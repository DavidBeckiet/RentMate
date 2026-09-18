import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { ListingCatalogClient } from "../../../../../shared/listing-catalog-client.js";
import {
  mapPublicInquiryListingSummary,
  type PublicInquiryListingSummary
} from "../../../../../shared/public-inquiry-listing-summary.js";
import type { IdentityAccountClient, IdentityUserProfile } from "../../../../../shared/identity-account-client.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { ContactRepository, Inquiry, InquiryMessage, Notification } from "../repositories/contact-repository.js";
import type {
  ContactReport,
  ContactReportEvent,
  ContactBlockState,
  ContactSafetyRepository
} from "../repositories/contact-safety-repository.js";
import type { ContactCollectionQuery, CreateInquiryInput, InquiryStatus } from "../validations/contact-validation.js";
import type {
  ContactReportCollectionQuery,
  CreateContactReportInput,
  ContactReportStatus,
  UpdateContactReportStatusInput
} from "../validations/contact-safety-validation.js";

const notFoundMessage = "The requested resource was not found.";
const closedMessage = "This inquiry is closed and cannot receive new messages.";

export interface ContactPage<Value> {
  readonly data: readonly Value[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface InquiryView extends Inquiry {
  readonly canSendMessage: boolean;
  readonly blockedByCurrentUser: boolean;
  readonly listingSummary: PublicInquiryListingSummary | null;
  readonly listingContextState: "AVAILABLE" | "UNAVAILABLE" | "TEMPORARILY_UNAVAILABLE";
  readonly lastMessage: InquiryMessage | null;
}

export interface AdminContactReport extends ContactReport {
  readonly reporter: IdentityUserProfile;
}

export interface AdminContactReportDetail extends AdminContactReport {
  readonly events: readonly ContactReportEvent[];
}

export interface ContactTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}

export interface ContactService {
  readonly createInquiry: (principal: AuthenticatedPrincipal, input: CreateInquiryInput) => Promise<InquiryView>;
  readonly listTenantInquiries: (
    principal: AuthenticatedPrincipal,
    query: ContactCollectionQuery
  ) => Promise<ContactPage<InquiryView>>;
  readonly listLandlordInquiries: (
    principal: AuthenticatedPrincipal,
    query: ContactCollectionQuery
  ) => Promise<ContactPage<InquiryView>>;
  readonly getInquiry: (principal: AuthenticatedPrincipal, inquiryId: number) => Promise<InquiryView>;
  readonly authorizeRealtime: (principal: AuthenticatedPrincipal, inquiryId: number) => Promise<void>;
  readonly sendMessage: (principal: AuthenticatedPrincipal, inquiryId: number, body: string) => Promise<InquiryMessage>;
  readonly blockInquiry: (principal: AuthenticatedPrincipal, inquiryId: number) => Promise<ContactBlockState>;
  readonly unblockInquiry: (principal: AuthenticatedPrincipal, inquiryId: number) => Promise<ContactBlockState>;
  readonly createContactReport: (
    principal: AuthenticatedPrincipal,
    inquiryId: number,
    input: CreateContactReportInput
  ) => Promise<ContactReport>;
  readonly listContactReports: (
    principal: AuthenticatedPrincipal,
    query: ContactReportCollectionQuery
  ) => Promise<ContactPage<AdminContactReport>>;
  readonly getContactReport: (principal: AuthenticatedPrincipal, reportId: number) => Promise<AdminContactReportDetail>;
  readonly updateContactReportStatus: (
    principal: AuthenticatedPrincipal,
    reportId: number,
    input: UpdateContactReportStatusInput
  ) => Promise<AdminContactReportDetail>;
  readonly updateStatus: (
    principal: AuthenticatedPrincipal,
    inquiryId: number,
    status: InquiryStatus
  ) => Promise<InquiryView>;
  readonly listNotifications: (
    principal: AuthenticatedPrincipal,
    query: ContactCollectionQuery
  ) => Promise<ContactPage<Notification>>;
  readonly getUnreadNotificationCount: (principal: AuthenticatedPrincipal) => Promise<number>;
  readonly markNotificationRead: (principal: AuthenticatedPrincipal, notificationId: number) => Promise<void>;
  readonly markAllNotificationsRead: (principal: AuthenticatedPrincipal) => Promise<void>;
}

function requireRole(principal: AuthenticatedPrincipal, role: "TENANT" | "LANDLORD" | "ADMIN"): number {
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

const contactBlockedMessage = "This conversation cannot receive new messages.";
const duplicateReportMessage = "You already have an active report for this inquiry.";

function otherParticipantId(principal: AuthenticatedPrincipal, inquiry: Inquiry): number {
  return requireParticipant(principal, inquiry) === "TENANT" ? inquiry.landlordId : inquiry.tenantId;
}

function canSend(inquiry: Inquiry, state: ContactBlockState): boolean {
  return inquiry.status !== "CLOSED" && state.canSendMessage;
}

async function decorateInquiry(
  executor: SqlExecutor,
  principal: AuthenticatedPrincipal,
  inquiry: Inquiry,
  safetyRepository: ContactSafetyRepository,
  lastMessage: InquiryMessage | null = null
): Promise<InquiryView> {
  const state = await safetyRepository.getBlockState(
    executor,
    principal.userId,
    otherParticipantId(principal, inquiry)
  );
  return Object.freeze({
    ...inquiry,
    canSendMessage: canSend(inquiry, state),
    blockedByCurrentUser: state.blockedByCurrentUser,
    listingSummary: null,
    listingContextState: "TEMPORARILY_UNAVAILABLE",
    lastMessage
  });
}

function mapDuplicateReport(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new ApplicationError("CONCURRENT_MODIFICATION", duplicateReportMessage, { cause: error });
  }
  throw error;
}

function allowedReportTransition(current: ContactReportStatus, next: ContactReportStatus): boolean {
  return (current === "OPEN" || current === "INVESTIGATING") && (next === "RESOLVED" || next === "DISMISSED");
}

function requireReportProfile(report: ContactReport, profiles: readonly IdentityUserProfile[]): IdentityUserProfile {
  const profile = profiles.find((candidate) => candidate.id === report.reporterId);
  if (!profile) throw new Error("Identity service reporter profile is missing.");
  return profile;
}

export function createContactService(dependencies: {
  readonly repository: ContactRepository;
  readonly safetyRepository: ContactSafetyRepository;
  readonly listingCatalogClient: ListingCatalogClient;
  readonly identityAccountClient: Pick<IdentityAccountClient, "loadProfilesByIds">;
  readonly transactionRunner: ContactTransactionRunner;
}): ContactService {
  const { repository, safetyRepository, listingCatalogClient, identityAccountClient, transactionRunner } = dependencies;
  const enrichReports = async (reports: readonly ContactReport[]): Promise<readonly AdminContactReport[]> => {
    const profiles = await identityAccountClient.loadProfilesByIds([
      ...new Set(reports.map((report) => report.reporterId))
    ]);
    return Object.freeze(
      reports.map((report) => Object.freeze({ ...report, reporter: requireReportProfile(report, profiles) }))
    );
  };
  const enrichListingViews = async (views: readonly InquiryView[]): Promise<readonly InquiryView[]> => {
    if (views.length === 0) return Object.freeze([]);
    const listingIds = [...new Set(views.map((view) => view.listingId))];
    try {
      const summaries = await listingCatalogClient.loadPublicSummariesByIds(listingIds);
      const summaryById = new Map(summaries.map((summary) => [summary.id, mapPublicInquiryListingSummary(summary)]));
      return Object.freeze(
        views.map((view) => {
          const listingSummary = summaryById.get(view.listingId) ?? null;
          return Object.freeze({
            ...view,
            listingSummary,
            listingContextState: listingSummary ? "AVAILABLE" : "UNAVAILABLE"
          });
        })
      );
    } catch {
      return Object.freeze(
        views.map((view) =>
          Object.freeze({
            ...view,
            listingSummary: null,
            listingContextState: "TEMPORARILY_UNAVAILABLE" as const
          })
        )
      );
    }
  };
  const enrichListingView = async (view: InquiryView): Promise<InquiryView> => {
    const [enriched] = await enrichListingViews([view]);
    if (!enriched) throw new Error("Inquiry listing context enrichment returned no view.");
    return enriched;
  };
  const service: ContactService = {
    async createInquiry(principal, input) {
      const tenantId = requireRole(principal, "TENANT");
      const target = await listingCatalogClient.loadPublicInquiryTarget(input.listingId);
      if (!target) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
      const profiles = input.contactPhone === null ? await identityAccountClient.loadProfilesByIds([tenantId]) : [];
      const profilePhone = profiles[0]?.phone ?? null;
      try {
        const created = await transactionRunner.run(async (executor) => {
          const existing = await repository.findOpenInquiry(executor, tenantId, input.listingId);
          if (existing) {
            throw new ApplicationError("CONCURRENT_MODIFICATION", "You already have an open inquiry for this listing.");
          }
          if (await safetyRepository.isPairBlocked(executor, tenantId, target.landlordId)) {
            throw new ApplicationError("CONCURRENT_MODIFICATION", contactBlockedMessage);
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
          return decorateInquiry(
            executor,
            principal,
            Object.freeze({ ...inquiry, messages }),
            safetyRepository,
            messages[messages.length - 1] ?? null
          );
        });
        return enrichListingView(created);
      } catch (error) {
        return mapConflict(error);
      }
    },

    async listTenantInquiries(principal, query) {
      const tenantId = requireRole(principal, "TENANT");
      const result = await transactionRunner.run(async (executor) => {
        const inquiries = await repository.listInquiries(executor, {
          actorId: tenantId,
          role: "TENANT",
          pageSize: query.pageSize,
          offset: query.offset
        });
        const visibleInquiries = inquiries.slice(0, query.pageSize);
        const latestMessages = await repository.listLatestMessages(
          executor,
          visibleInquiries.map((inquiry) => inquiry.id),
          "TENANT"
        );
        const latestMessageByInquiryId = new Map(
          latestMessages.map((message) => [message.inquiryId, message] as const)
        );
        const decorated: InquiryView[] = [];
        for (const inquiry of inquiries)
          decorated.push(
            await decorateInquiry(
              executor,
              principal,
              inquiry,
              safetyRepository,
              latestMessageByInquiryId.get(inquiry.id) ?? null
            )
          );
        return { rows: decorated, hasNextPage: inquiries.length > query.pageSize };
      });
      const rows = await enrichListingViews(result.rows.slice(0, query.pageSize));
      return Object.freeze({
        data: Object.freeze(rows),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: result.hasNextPage
      });
    },

    async listLandlordInquiries(principal, query) {
      const landlordId = requireRole(principal, "LANDLORD");
      const result = await transactionRunner.run(async (executor) => {
        const inquiries = await repository.listInquiries(executor, {
          actorId: landlordId,
          role: "LANDLORD",
          pageSize: query.pageSize,
          offset: query.offset
        });
        const visibleInquiries = inquiries.slice(0, query.pageSize);
        const latestMessages = await repository.listLatestMessages(
          executor,
          visibleInquiries.map((inquiry) => inquiry.id),
          "LANDLORD"
        );
        const latestMessageByInquiryId = new Map(
          latestMessages.map((message) => [message.inquiryId, message] as const)
        );
        const decorated: InquiryView[] = [];
        for (const inquiry of inquiries)
          decorated.push(
            await decorateInquiry(
              executor,
              principal,
              inquiry,
              safetyRepository,
              latestMessageByInquiryId.get(inquiry.id) ?? null
            )
          );
        return { rows: decorated, hasNextPage: inquiries.length > query.pageSize };
      });
      const rows = await enrichListingViews(result.rows.slice(0, query.pageSize));
      return Object.freeze({
        data: Object.freeze(rows),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: result.hasNextPage
      });
    },

    async getInquiry(principal, inquiryId) {
      const view = await transactionRunner.run(async (executor) => {
        const inquiry = await repository.findInquiryForUpdate(executor, inquiryId);
        if (!inquiry) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        const viewerRole = requireParticipant(principal, inquiry);
        await repository.markMessagesRead(executor, inquiryId, viewerRole);
        const messages = await repository.listMessages(executor, inquiryId, viewerRole);
        return decorateInquiry(
          executor,
          principal,
          Object.freeze({ ...inquiry, messages }),
          safetyRepository,
          messages[messages.length - 1] ?? null
        );
      });
      return enrichListingView(view);
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
        if (
          !(await safetyRepository.getBlockState(executor, principal.userId, otherParticipantId(principal, inquiry)))
            .canSendMessage
        ) {
          throw new ApplicationError("CONCURRENT_MODIFICATION", contactBlockedMessage);
        }
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

    async blockInquiry(principal, inquiryId) {
      return transactionRunner.run(async (executor) => {
        const inquiry = await repository.findInquiryForUpdate(executor, inquiryId);
        if (!inquiry) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        const otherId = otherParticipantId(principal, inquiry);
        await safetyRepository.createBlock(executor, {
          blockerId: principal.userId,
          blockedId: otherId,
          inquiryId
        });
        return safetyRepository.getBlockState(executor, principal.userId, otherId);
      });
    },

    async unblockInquiry(principal, inquiryId) {
      return transactionRunner.run(async (executor) => {
        const inquiry = await repository.findInquiryForUpdate(executor, inquiryId);
        if (!inquiry) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        const otherId = otherParticipantId(principal, inquiry);
        await safetyRepository.deleteBlock(executor, principal.userId, otherId);
        return safetyRepository.getBlockState(executor, principal.userId, otherId);
      });
    },

    async createContactReport(principal, inquiryId, input) {
      return transactionRunner
        .run(async (executor) => {
          const inquiry = await repository.findInquiryForUpdate(executor, inquiryId);
          if (!inquiry) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
          const actorRole = requireParticipant(principal, inquiry);
          if (
            input.messageId !== null &&
            !(await safetyRepository.messageBelongsToInquiry(executor, inquiryId, input.messageId))
          ) {
            throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
          }
          const report = await safetyRepository.createReport(executor, inquiryId, principal.userId, input);
          await safetyRepository.appendReportEvent(executor, {
            reportId: report.id,
            actorId: principal.userId,
            actorRole,
            previousStatus: null,
            newStatus: "OPEN",
            note: input.details
          });
          return report;
        })
        .catch(mapDuplicateReport);
    },

    async updateStatus(principal, inquiryId, status) {
      const landlordId = requireRole(principal, "LANDLORD");
      const view = await transactionRunner.run(async (executor) => {
        const inquiry = await repository.findInquiryForUpdate(executor, inquiryId);
        if (!inquiry || inquiry.landlordId !== landlordId)
          throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        if (inquiry.status === status) return decorateInquiry(executor, principal, inquiry, safetyRepository);
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
        return decorateInquiry(
          executor,
          principal,
          Object.freeze({ ...updated, messages }),
          safetyRepository,
          messages[messages.length - 1] ?? null
        );
      });
      return enrichListingView(view);
    },

    async listContactReports(principal, query) {
      requireRole(principal, "ADMIN");
      const rows = await transactionRunner.run((executor) =>
        safetyRepository.listReports(executor, {
          status: query.status,
          category: query.category,
          limit: query.pageSize + 1,
          offset: query.offset
        })
      );
      const pageRows = rows.slice(0, query.pageSize);
      return Object.freeze({
        data: await enrichReports(pageRows),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },

    async getContactReport(principal, reportId) {
      requireRole(principal, "ADMIN");
      const result = await transactionRunner.run(async (executor) => {
        const report = await safetyRepository.findReport(executor, reportId);
        if (!report) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        return { report, events: await safetyRepository.listReportEvents(executor, reportId) };
      });
      const [report] = await enrichReports([result.report]);
      return Object.freeze({ ...report, events: result.events });
    },

    async updateContactReportStatus(principal, reportId, input) {
      const adminId = requireRole(principal, "ADMIN");
      const result = await transactionRunner.run(async (executor) => {
        const current = await safetyRepository.findReport(executor, reportId, true);
        if (!current) throw new ApplicationError("RESOURCE_NOT_FOUND", notFoundMessage);
        if (!allowedReportTransition(current.status, input.status)) {
          throw new ApplicationError("CONCURRENT_MODIFICATION", "The report status transition is not allowed.");
        }
        const report = await safetyRepository.updateReportStatus(executor, reportId, input.status, adminId, input.note);
        await safetyRepository.appendReportEvent(executor, {
          reportId,
          actorId: adminId,
          actorRole: "ADMIN",
          previousStatus: current.status,
          newStatus: input.status,
          note: input.note
        });
        return { report, events: await safetyRepository.listReportEvents(executor, reportId) };
      });
      const [report] = await enrichReports([result.report]);
      return Object.freeze({ ...report, events: result.events });
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

    async getUnreadNotificationCount(principal) {
      return transactionRunner.run((executor) => repository.countUnreadNotifications(executor, principal.userId));
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
