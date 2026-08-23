import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { ListingCatalogClient } from "../../../../../shared/listing-catalog-client.js";
import type { IdentityAccountClient } from "../../../../../shared/identity-account-client.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { ContactRepository, Inquiry, InquiryMessage, Notification } from "../repositories/contact-repository.js";
import type { ContactCollectionQuery, CreateInquiryInput, InquiryStatus } from "../validations/contact-validation.js";

const notFoundMessage = "The requested resource was not found.";
const closedMessage = "This inquiry is closed and cannot receive new messages.";

export interface ContactPage<Value> {
  readonly data: readonly Value[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface ContactTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}

export interface ContactService {
  readonly createInquiry: (principal: AuthenticatedPrincipal, input: CreateInquiryInput) => Promise<Inquiry>;
  readonly listTenantInquiries: (
    principal: AuthenticatedPrincipal,
    query: ContactCollectionQuery
  ) => Promise<ContactPage<Inquiry>>;
  readonly listLandlordInquiries: (
    principal: AuthenticatedPrincipal,
    query: ContactCollectionQuery
  ) => Promise<ContactPage<Inquiry>>;
  readonly getInquiry: (principal: AuthenticatedPrincipal, inquiryId: number) => Promise<Inquiry>;
  readonly authorizeRealtime: (principal: AuthenticatedPrincipal, inquiryId: number) => Promise<void>;
  readonly sendMessage: (principal: AuthenticatedPrincipal, inquiryId: number, body: string) => Promise<InquiryMessage>;
  readonly updateStatus: (
    principal: AuthenticatedPrincipal,
    inquiryId: number,
    status: InquiryStatus
  ) => Promise<Inquiry>;
  readonly listNotifications: (
    principal: AuthenticatedPrincipal,
    query: ContactCollectionQuery
  ) => Promise<ContactPage<Notification>>;
  readonly markNotificationRead: (principal: AuthenticatedPrincipal, notificationId: number) => Promise<void>;
  readonly markAllNotificationsRead: (principal: AuthenticatedPrincipal) => Promise<void>;
}

function requireRole(principal: AuthenticatedPrincipal, role: "TENANT" | "LANDLORD"): number {
  if (principal.role !== role) throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  return principal.userId;
}

function requireParticipant(principal: AuthenticatedPrincipal, inquiry: Inquiry): "TENANT" | "LANDLORD" {
  if (principal.role === "TENANT" && principal.userId === inquiry.tenantId) return "TENANT";
  if (principal.role === "LANDLORD" && principal.userId === inquiry.landlordId) return "LANDLORD";
  throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
}

function mapConflict(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new ApplicationError("CONCURRENT_MODIFICATION", "An open inquiry already exists for this listing.", {
      cause: error
    });
  }
  throw error;
}

function invalidTransition(message: string): ApplicationError {
  return new ApplicationError("CONCURRENT_MODIFICATION", message);
}

export function createContactService(dependencies: {
  readonly repository: ContactRepository;
  readonly listingCatalogClient: ListingCatalogClient;
  readonly identityAccountClient: Pick<IdentityAccountClient, "loadProfilesByIds">;
  readonly transactionRunner: ContactTransactionRunner;
}): ContactService {
  const { repository, listingCatalogClient, identityAccountClient, transactionRunner } = dependencies;
  const service: ContactService = {
    async createInquiry(principal, input) {
      const tenantId = requireRole(principal, "TENANT");
      const target = await listingCatalogClient.loadPublicInquiryTarget(input.listingId);
      if (!target) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      const profiles = input.contactPhone === null ? await identityAccountClient.loadProfilesByIds([tenantId]) : [];
      const profilePhone = profiles[0]?.phone ?? null;
      try {
        return await transactionRunner.run(async (executor) => {
          const existing = await repository.findOpenInquiry(executor, tenantId, input.listingId);
          if (existing) {
            throw new ApplicationError("CONCURRENT_MODIFICATION", "You already have an open inquiry for this listing.");
          }
          const inquiry = await repository.createInquiry(executor, {
            tenantId,
            landlordId: target.landlordId,
            listingId: input.listingId,
            contactPhone: input.contactPhone ?? profilePhone,
            preferredContactAt: input.preferredContactAt
          });
          await repository.appendMessage(executor, {
            inquiryId: inquiry.id,
            senderId: tenantId,
            senderRole: "TENANT",
            body: input.message
          });
          await repository.createNotification(executor, {
            recipientId: target.landlordId,
            eventType: "INQUIRY_CREATED",
            inquiryId: inquiry.id
          });
          const messages = await repository.listMessages(executor, inquiry.id, "TENANT");
          return Object.freeze({ ...inquiry, messages });
        });
      } catch (error) {
        return mapConflict(error);
      }
    },

    async listTenantInquiries(principal, query) {
      const tenantId = requireRole(principal, "TENANT");
      const rows = await transactionRunner.run((executor) =>
        repository.listInquiries(executor, {
          actorId: tenantId,
          role: "TENANT",
          pageSize: query.pageSize,
          offset: query.offset
        })
      );
      return Object.freeze({
        data: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },

    async listLandlordInquiries(principal, query) {
      const landlordId = requireRole(principal, "LANDLORD");
      const rows = await transactionRunner.run((executor) =>
        repository.listInquiries(executor, {
          actorId: landlordId,
          role: "LANDLORD",
          pageSize: query.pageSize,
          offset: query.offset
        })
      );
      return Object.freeze({
        data: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },

    async getInquiry(principal, inquiryId) {
      return transactionRunner.run(async (executor) => {
        const inquiry = await repository.findInquiryForUpdate(executor, inquiryId);
        if (!inquiry) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        const viewerRole = requireParticipant(principal, inquiry);
        await repository.markMessagesRead(executor, inquiryId, viewerRole);
        const messages = await repository.listMessages(executor, inquiryId, viewerRole);
        return Object.freeze({ ...inquiry, messages });
      });
    },

    async authorizeRealtime(principal, inquiryId) {
      await transactionRunner.run(async (executor) => {
        const inquiry = await repository.findInquiryById(executor, inquiryId);
        if (!inquiry) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        requireParticipant(principal, inquiry);
      });
    },

    async sendMessage(principal, inquiryId, body) {
      return transactionRunner.run(async (executor) => {
        const inquiry = await repository.findInquiryForUpdate(executor, inquiryId);
        if (!inquiry) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        const senderRole = requireParticipant(principal, inquiry);
        if (inquiry.status === "CLOSED") throw new ApplicationError("CONCURRENT_MODIFICATION", closedMessage);
        const message = await repository.appendMessage(executor, {
          inquiryId,
          senderId: principal.userId,
          senderRole,
          body
        });
        await repository.createNotification(executor, {
          recipientId: senderRole === "TENANT" ? inquiry.landlordId : inquiry.tenantId,
          eventType: "MESSAGE_CREATED",
          inquiryId
        });
        return message;
      });
    },

    async updateStatus(principal, inquiryId, status) {
      const landlordId = requireRole(principal, "LANDLORD");
      return transactionRunner.run(async (executor) => {
        const inquiry = await repository.findInquiryForUpdate(executor, inquiryId);
        if (!inquiry || inquiry.landlordId !== landlordId)
          throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        if (inquiry.status === status) return inquiry;
        const isAllowedTransition =
          (inquiry.status === "NEW" && status === "CONTACTED") ||
          (inquiry.status === "CONTACTED" && (status === "CONTACTED" || status === "CLOSED"));
        if (!isAllowedTransition) {
          throw invalidTransition("The inquiry status transition is not allowed.");
        }
        const updated = await repository.updateStatus(executor, inquiryId, status);
        await repository.createNotification(executor, {
          recipientId: inquiry.tenantId,
          eventType: "INQUIRY_STATUS_CHANGED",
          inquiryId
        });
        const messages = await repository.listMessages(executor, inquiryId, "LANDLORD");
        return Object.freeze({ ...updated, messages });
      });
    },

    async listNotifications(principal, query) {
      const rows = await transactionRunner.run((executor) =>
        repository.listNotifications(executor, {
          recipientId: principal.userId,
          pageSize: query.pageSize,
          offset: query.offset
        })
      );
      return Object.freeze({
        data: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },

    async markNotificationRead(principal, notificationId) {
      const changed = await transactionRunner.run((executor) =>
        repository.markNotificationRead(executor, principal.userId, notificationId)
      );
      if (!changed) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
    },

    async markAllNotificationsRead(principal) {
      await transactionRunner.run((executor) => repository.markAllNotificationsRead(executor, principal.userId));
    }
  };
  return Object.freeze(service);
}
