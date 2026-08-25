import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type { ListingCatalogClient } from "../../shared/listing-catalog-client.js";
import type { IdentityAccountClient } from "../../shared/identity-account-client.js";
import { createContactService, type ContactService } from "../src/modules/contact/services/contact-service.js";
import type {
  ContactRepository,
  Inquiry,
  InquiryMessage,
  Notification
} from "../src/modules/contact/repositories/contact-repository.js";
import type { ContactSafetyRepository } from "../src/modules/contact/repositories/contact-safety-repository.js";
import type {
  ContactCollectionQuery,
  CreateInquiryInput,
  InquiryStatus
} from "../src/modules/contact/validations/contact-validation.js";

const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 11, role: "TENANT" });
const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 22, role: "LANDLORD" });
const unrelatedTenant: AuthenticatedPrincipal = Object.freeze({ userId: 33, role: "TENANT" });
const listingId = 501;
const createdAt = "2026-08-23T00:00:00.000Z";

interface StoredMessage extends InquiryMessage {
  readonly senderId: number;
  readonly readBy: Set<"TENANT" | "LANDLORD">;
}

interface StoredNotification extends Notification {
  readonly recipientId: number;
}

interface ContactHarness {
  readonly service: ContactService;
  readonly notifications: readonly StoredNotification[];
}

function cloneInquiry(inquiry: Inquiry): Inquiry {
  return Object.freeze({ ...inquiry, messages: Object.freeze([...inquiry.messages]) });
}

function createContactHarness(): ContactHarness {
  const inquiries = new Map<number, Inquiry>();
  const messages = new Map<number, StoredMessage[]>();
  const notifications: StoredNotification[] = [];
  let nextInquiryId = 1;
  let nextMessageId = 1;
  let nextNotificationId = 1;

  const executor: SqlExecutor = {
    query: async () => {
      throw new Error("The contact service test repository does not execute SQL.");
    }
  };

  const repository: ContactRepository = {
    async createInquiry(_executor, input) {
      const inquiry: Inquiry = Object.freeze({
        id: nextInquiryId++,
        tenantId: input.tenantId,
        landlordId: input.landlordId,
        listingId: input.listingId,
        status: "NEW",
        contactPhone: input.contactPhone,
        preferredContactAt: input.preferredContactAt,
        createdAt,
        updatedAt: createdAt,
        messages: Object.freeze([])
      });
      inquiries.set(inquiry.id, inquiry);
      messages.set(inquiry.id, []);
      return cloneInquiry(inquiry);
    },

    async findOpenInquiry(_executor, tenantId, targetListingId) {
      const inquiry = [...inquiries.values()].find(
        (item) => item.tenantId === tenantId && item.listingId === targetListingId && item.status !== "CLOSED"
      );
      return inquiry ? cloneInquiry(inquiry) : null;
    },

    async findInquiryById(_executor, inquiryId) {
      const inquiry = inquiries.get(inquiryId);
      return inquiry ? cloneInquiry(inquiry) : null;
    },

    async findInquiryForUpdate(_executor, inquiryId) {
      const inquiry = inquiries.get(inquiryId);
      return inquiry ? cloneInquiry(inquiry) : null;
    },

    async listInquiries(_executor, input) {
      return [...inquiries.values()]
        .filter((item) => (input.role === "TENANT" ? item.tenantId : item.landlordId) === input.actorId)
        .slice(input.offset, input.offset + input.pageSize + 1)
        .map(cloneInquiry);
    },

    async listMessages(_executor, inquiryId, viewerRole) {
      return Object.freeze(
        (messages.get(inquiryId) ?? []).map((message) =>
          Object.freeze({
            id: message.id,
            senderRole: message.senderRole,
            body: message.body,
            isRead: message.readBy.has(viewerRole),
            createdAt: message.createdAt
          })
        )
      );
    },

    async appendMessage(_executor, input) {
      const message: StoredMessage = {
        id: nextMessageId++,
        senderRole: input.senderRole,
        senderId: input.senderId,
        body: input.body,
        isRead: false,
        createdAt,
        readBy: new Set()
      };
      const inquiryMessages = messages.get(input.inquiryId);
      if (!inquiryMessages) throw new Error("Inquiry messages were not initialized.");
      inquiryMessages.push(message);
      return Object.freeze({
        id: message.id,
        senderRole: message.senderRole,
        body: message.body,
        isRead: false,
        createdAt: message.createdAt
      });
    },

    async updateStatus(_executor, inquiryId, status) {
      const inquiry = inquiries.get(inquiryId);
      if (!inquiry) throw new Error("Inquiry was not initialized.");
      const updated: Inquiry = Object.freeze({ ...inquiry, status, updatedAt: createdAt });
      inquiries.set(inquiryId, updated);
      return cloneInquiry(updated);
    },

    async markMessagesRead(_executor, inquiryId, role) {
      for (const message of messages.get(inquiryId) ?? []) message.readBy.add(role);
    },

    async createNotification(_executor, input) {
      const notification: StoredNotification = Object.freeze({
        id: nextNotificationId++,
        recipientId: input.recipientId,
        eventType: input.eventType,
        inquiryId: input.inquiryId,
        listingId: null,
        resourcePath: `/inquiries/${input.inquiryId}`,
        isRead: false,
        createdAt
      });
      notifications.push(notification);
      return notification;
    },

    async listNotifications(_executor, input) {
      return notifications
        .filter((item) => item.recipientId === input.recipientId)
        .slice(input.offset, input.offset + input.pageSize + 1)
        .map((item) => Object.freeze({ ...item }));
    },

    async markNotificationRead(_executor, recipientId, notificationId) {
      const notification = notifications.find((item) => item.recipientId === recipientId && item.id === notificationId);
      if (!notification) return false;
      const index = notifications.indexOf(notification);
      notifications[index] = Object.freeze({ ...notification, isRead: true });
      return true;
    },

    async markAllNotificationsRead(_executor, recipientId) {
      notifications.forEach((notification, index) => {
        if (notification.recipientId === recipientId) {
          notifications[index] = Object.freeze({ ...notification, isRead: true });
        }
      });
    }
  };

  const listingCatalogClient: ListingCatalogClient = {
    loadPublicSummariesByIds: async () => Object.freeze([]),
    loadPublicInquiryTarget: async (targetListingId) =>
      targetListingId === listingId ? Object.freeze({ listingId, landlordId: landlord.userId }) : null
  };
  const identityAccountClient: Pick<IdentityAccountClient, "loadProfilesByIds"> = {
    loadProfilesByIds: async () =>
      Object.freeze([
        Object.freeze({
          id: tenant.userId,
          role: "TENANT" as const,
          email: "tenant@example.test",
          phone: "+84901234567",
          isActive: true
        })
      ])
  };
  const safetyRepository = {
    getBlockState: async () =>
      Object.freeze({ blockedByCurrentUser: false, blockedByOtherUser: false, canSendMessage: true }),
    isPairBlocked: async () => false
  } as unknown as ContactSafetyRepository;

  return {
    service: createContactService({
      repository,
      safetyRepository,
      listingCatalogClient,
      identityAccountClient,
      transactionRunner: { run: (operation) => operation(executor) }
    }),
    notifications
  };
}

const collectionQuery: ContactCollectionQuery = Object.freeze({ page: 1, pageSize: 20, offset: 0 });

test("completes the tenant-landlord inquiry, message, status and notification flow", async () => {
  const harness = createContactHarness();
  const input: CreateInquiryInput = Object.freeze({
    listingId,
    message: "Mình muốn hỏi phòng còn trống không.",
    contactPhone: null,
    preferredContactAt: null
  });

  const created = await harness.service.createInquiry(tenant, input);
  assert.equal(created.status, "NEW");
  assert.equal(created.contactPhone, "+84901234567");
  assert.deepEqual(
    created.messages.map((message) => message.body),
    [input.message]
  );

  const landlordInbox = await harness.service.listLandlordInquiries(landlord, collectionQuery);
  assert.equal(landlordInbox.data.length, 1);
  assert.equal(landlordInbox.data[0]?.id, created.id);
  assert.equal(harness.notifications[0]?.eventType, "INQUIRY_CREATED");
  assert.equal(harness.notifications[0]?.recipientId, landlord.userId);

  const landlordView = await harness.service.getInquiry(landlord, created.id);
  assert.equal(landlordView.messages[0]?.isRead, true);
  await harness.service.authorizeRealtime(tenant, created.id);
  await harness.service.authorizeRealtime(landlord, created.id);
  await assert.rejects(
    () => harness.service.authorizeRealtime(unrelatedTenant, created.id),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );

  const landlordReply = await harness.service.sendMessage(landlord, created.id, "Phòng vẫn còn bạn nhé.");
  assert.equal(landlordReply.senderRole, "LANDLORD");
  assert.equal(harness.notifications[1]?.eventType, "MESSAGE_CREATED");
  assert.equal(harness.notifications[1]?.recipientId, tenant.userId);

  const contacted = await harness.service.updateStatus(landlord, created.id, "CONTACTED");
  assert.equal(contacted.status, "CONTACTED");
  assert.equal(harness.notifications[2]?.eventType, "INQUIRY_STATUS_CHANGED");
  assert.equal(harness.notifications[2]?.recipientId, tenant.userId);

  const tenantNotifications = await harness.service.listNotifications(tenant, collectionQuery);
  assert.deepEqual(
    tenantNotifications.data.map((notification) => notification.eventType),
    ["MESSAGE_CREATED", "INQUIRY_STATUS_CHANGED"]
  );

  await harness.service.markNotificationRead(tenant, tenantNotifications.data[0]?.id ?? 0);
  assert.equal(harness.notifications[1]?.isRead, true);

  await harness.service.updateStatus(landlord, created.id, "CLOSED");
  await assert.rejects(
    () => harness.service.sendMessage(tenant, created.id, "Mình muốn hỏi thêm."),
    (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
  );
});

test("hides inquiry ownership and rejects non-public listing targets", async () => {
  const harness = createContactHarness();
  const input: CreateInquiryInput = Object.freeze({
    listingId,
    message: "Xin chào.",
    contactPhone: "+84909999999",
    preferredContactAt: null
  });
  const created = await harness.service.createInquiry(tenant, input);

  await assert.rejects(
    () => harness.service.getInquiry(unrelatedTenant, created.id),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );
  await assert.rejects(
    () => harness.service.createInquiry(tenant, { ...input, listingId: 999 }),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );
});

test("enforces the allowed status transitions", async () => {
  const harness = createContactHarness();
  const created = await harness.service.createInquiry(tenant, {
    listingId,
    message: "Xin hỏi thông tin phòng.",
    contactPhone: null,
    preferredContactAt: null
  });

  await assert.rejects(
    () => harness.service.updateStatus(landlord, created.id, "CLOSED" as InquiryStatus),
    (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
  );
});
