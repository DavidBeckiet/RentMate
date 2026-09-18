import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type { IdentityAccountClient } from "../../shared/identity-account-client.js";
import type { ListingCatalogClient } from "../../shared/listing-catalog-client.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type {
  ContactRepository,
  Inquiry,
  InquiryMessage
} from "../src/modules/contact/repositories/contact-repository.js";
import type {
  ContactBlockState,
  ContactReport,
  ContactReportEvent,
  ContactSafetyRepository
} from "../src/modules/contact/repositories/contact-safety-repository.js";
import { createContactService, type ContactService } from "../src/modules/contact/services/contact-service.js";
import {
  validateContactReportCollectionQuery,
  validateCreateContactReportBody,
  validateUpdateContactReportStatusBody
} from "../src/modules/contact/validations/contact-safety-validation.js";

const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 11, role: "TENANT" });
const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 22, role: "LANDLORD" });
const admin: AuthenticatedPrincipal = Object.freeze({ userId: 1, role: "ADMIN" });
const outsider: AuthenticatedPrincipal = Object.freeze({ userId: 33, role: "TENANT" });
const createdAt = "2026-08-25T00:00:00.000Z";

interface SafetyHarness {
  readonly service: ContactService;
  readonly inquiry: Inquiry;
  readonly reports: Map<number, ContactReport>;
}

function createHarness(): SafetyHarness {
  const inquiry: Inquiry = Object.freeze({
    id: 9,
    tenantId: tenant.userId,
    landlordId: landlord.userId,
    listingId: 42,
    status: "NEW",
    contactPhone: null,
    preferredContactAt: null,
    createdAt,
    updatedAt: createdAt,
    messages: Object.freeze([
      Object.freeze({ id: 3, senderRole: "LANDLORD" as const, body: "Chuyển khoản trước.", isRead: false, createdAt })
    ])
  });
  const blocks = new Set<string>();
  const reports = new Map<number, ContactReport>();
  const events = new Map<number, ContactReportEvent[]>();
  let nextReportId = 1;

  const executor: SqlExecutor = {
    query: async () => {
      throw new Error("SQL is not used by the safety harness.");
    }
  };
  const repository = {
    findInquiryById: async () => inquiry,
    findInquiryForUpdate: async () => inquiry,
    findOpenInquiry: async () => null,
    createInquiry: async () => inquiry,
    listInquiries: async () => [inquiry],
    listMessages: async (_executor: SqlExecutor, _inquiryId: number, _role: "TENANT" | "LANDLORD") => inquiry.messages,
    appendMessage: async (
      _executor: SqlExecutor,
      input: { readonly senderRole: "TENANT" | "LANDLORD"; readonly body: string }
    ) => Object.freeze({ id: 4, senderRole: input.senderRole, body: input.body, isRead: false, createdAt }),
    updateStatus: async () => inquiry,
    markMessagesRead: async () => undefined,
    createNotification: async () => ({
      id: 1,
      eventType: "MESSAGE_CREATED" as const,
      inquiryId: inquiry.id,
      listingId: null,
      resourcePath: "/inquiries/9",
      isRead: false,
      createdAt
    }),
    listNotifications: async () => [],
    markNotificationRead: async () => true,
    markAllNotificationsRead: async () => undefined
  } as unknown as ContactRepository;

  const blockKey = (first: number, second: number) => `${first}:${second}`;
  const blockState = (currentUserId: number, otherUserId: number): ContactBlockState => {
    const current = blocks.has(blockKey(currentUserId, otherUserId));
    const other = blocks.has(blockKey(otherUserId, currentUserId));
    return Object.freeze({
      blockedByCurrentUser: current,
      blockedByOtherUser: other,
      canSendMessage: !current && !other
    });
  };
  const reportValue = (
    reportId: number,
    reporterId: number,
    input: {
      readonly category: ContactReport["category"];
      readonly details: string | null;
      readonly messageId: number | null;
    }
  ): ContactReport =>
    Object.freeze({
      id: reportId,
      inquiryId: inquiry.id,
      listingId: inquiry.listingId,
      tenantId: inquiry.tenantId,
      landlordId: inquiry.landlordId,
      reporterId,
      message:
        input.messageId === null
          ? null
          : Object.freeze({ id: input.messageId, senderRole: "LANDLORD", body: "Chuyển khoản trước.", createdAt }),
      category: input.category,
      details: input.details,
      status: "OPEN",
      resolutionNote: null,
      assignedAdminId: null,
      createdAt,
      updatedAt: createdAt,
      resolvedAt: null
    });

  const safetyRepository = {
    getBlockState: async (_executor: SqlExecutor, currentUserId: number, otherUserId: number) =>
      blockState(currentUserId, otherUserId),
    isPairBlocked: async (_executor: SqlExecutor, first: number, second: number) =>
      blocks.has(blockKey(first, second)) || blocks.has(blockKey(second, first)),
    createBlock: async (_executor: SqlExecutor, input: { readonly blockerId: number; readonly blockedId: number }) => {
      blocks.add(blockKey(input.blockerId, input.blockedId));
    },
    deleteBlock: async (_executor: SqlExecutor, blockerId: number, blockedId: number) => {
      blocks.delete(blockKey(blockerId, blockedId));
    },
    messageBelongsToInquiry: async (_executor: SqlExecutor, inquiryId: number, messageId: number) =>
      inquiryId === inquiry.id && messageId === 3,
    createReport: async (
      _executor: SqlExecutor,
      inquiryId: number,
      reporterId: number,
      input: {
        readonly category: ContactReport["category"];
        readonly details: string | null;
        readonly messageId: number | null;
      }
    ) => {
      if (
        [...reports.values()].some(
          (report) =>
            report.inquiryId === inquiryId &&
            report.reporterId === reporterId &&
            ["OPEN", "INVESTIGATING"].includes(report.status)
        )
      ) {
        const error = new Error("duplicate") as Error & { code: string };
        error.code = "23505";
        throw error;
      }
      const report = reportValue(nextReportId++, reporterId, input);
      reports.set(report.id, report);
      return report;
    },
    listReports: async (_executor: SqlExecutor, input: { readonly status: ContactReport["status"] }) =>
      [...reports.values()].filter((report) => report.status === input.status),
    findReport: async (_executor: SqlExecutor, reportId: number) => reports.get(reportId) ?? null,
    updateReportStatus: async (
      _executor: SqlExecutor,
      reportId: number,
      status: ContactReport["status"],
      adminId: number,
      note: string | null
    ) => {
      const current = reports.get(reportId);
      if (!current) throw new Error("missing report");
      const updated = Object.freeze({
        ...current,
        status,
        assignedAdminId: adminId,
        resolutionNote: status === "RESOLVED" || status === "DISMISSED" ? note : null,
        resolvedAt: status === "RESOLVED" || status === "DISMISSED" ? createdAt : null
      });
      reports.set(reportId, updated);
      return updated;
    },
    appendReportEvent: async (_executor: SqlExecutor, input: Omit<ContactReportEvent, "id" | "createdAt">) => {
      const event = Object.freeze({ ...input, id: (events.get(input.reportId)?.length ?? 0) + 1, createdAt });
      events.set(input.reportId, [...(events.get(input.reportId) ?? []), event]);
      return event;
    },
    listReportEvents: async (_executor: SqlExecutor, reportId: number) => events.get(reportId) ?? []
  } as unknown as ContactSafetyRepository;

  const listingCatalogClient: ListingCatalogClient = {
    loadPublicSummariesByIds: async () => [],
    loadPublicInquiryTarget: async () => ({ listingId: inquiry.listingId, landlordId: inquiry.landlordId })
  };
  const identityAccountClient: Pick<IdentityAccountClient, "loadProfilesByIds"> = {
    loadProfilesByIds: async (ids) =>
      ids.map((id) =>
        Object.freeze({
          id,
          role:
            id === admin.userId
              ? ("ADMIN" as const)
              : id === landlord.userId
                ? ("LANDLORD" as const)
                : ("TENANT" as const),
          email: `${id}@example.com`,
          phone: null,
          isActive: true
        })
      )
  };

  return {
    inquiry,
    reports,
    service: createContactService({
      repository,
      safetyRepository,
      listingCatalogClient,
      identityAccountClient,
      transactionRunner: { run: (operation) => operation(executor) }
    })
  };
}

test("validates contact report fields and admin query filters", () => {
  assert.deepEqual(validateCreateContactReportBody({ category: "fraud", details: "  suspicious  ", messageId: 3 }), {
    category: "FRAUD",
    details: "suspicious",
    messageId: 3
  });
  assert.deepEqual(validateContactReportCollectionQuery({ status: "investigating", category: "spam", page: "2" }), {
    status: "INVESTIGATING",
    category: "SPAM",
    page: 2,
    pageSize: 20,
    offset: 20
  });
  assert.throws(() => validateCreateContactReportBody({ category: "SPAM", unknown: true }), /invalid data/i);
  assert.throws(() => validateUpdateContactReportStatusBody({ status: "RESOLVED" }), /invalid data/i);
  assert.throws(() => validateUpdateContactReportStatusBody({ status: "INVESTIGATING" }), /invalid data/i);
});

test("enforces two-way blocks, report dedupe, participant ownership and admin transitions", async () => {
  const harness = createHarness();
  const blocked = await harness.service.blockInquiry(tenant, harness.inquiry.id);
  assert.deepEqual(blocked, { blockedByCurrentUser: true, blockedByOtherUser: false, canSendMessage: false });
  const landlordView = await harness.service.getInquiry(landlord, harness.inquiry.id);
  assert.equal(landlordView.blockedByCurrentUser, false);
  assert.equal(landlordView.canSendMessage, false);
  await assert.rejects(
    () => harness.service.sendMessage(landlord, harness.inquiry.id, "hello"),
    (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
  );
  await harness.service.unblockInquiry(tenant, harness.inquiry.id);
  assert.equal((await harness.service.getInquiry(landlord, harness.inquiry.id)).canSendMessage, true);

  const report = await harness.service.createContactReport(tenant, harness.inquiry.id, {
    category: "FRAUD",
    details: "payment request",
    messageId: 3
  });
  assert.equal(report.status, "OPEN");
  await assert.rejects(
    () =>
      harness.service.createContactReport(tenant, harness.inquiry.id, {
        category: "SPAM",
        details: null,
        messageId: null
      }),
    (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
  );
  await assert.rejects(
    () =>
      harness.service.createContactReport(outsider, harness.inquiry.id, {
        category: "SPAM",
        details: null,
        messageId: null
      }),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );
  const adminPage = await harness.service.listContactReports(admin, {
    status: "OPEN",
    category: null,
    page: 1,
    pageSize: 20,
    offset: 0
  });
  assert.equal(adminPage.data[0]?.reporter.email, "11@example.com");
  const resolved = await harness.service.updateContactReportStatus(admin, report.id, {
    status: "RESOLVED",
    note: "Đã xem xét"
  });
  assert.equal(resolved.events.length, 2);
  assert.equal(resolved.events[1]?.previousStatus, "OPEN");
  await assert.rejects(
    () => harness.service.updateContactReportStatus(admin, report.id, { status: "DISMISSED", note: "Quá muộn." }),
    (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
  );
});

test("dismisses an open contact report and completes legacy investigating reports", async () => {
  const open = createHarness();
  const report = await open.service.createContactReport(tenant, open.inquiry.id, {
    category: "SPAM",
    details: null,
    messageId: null
  });
  const dismissed = await open.service.updateContactReportStatus(admin, report.id, {
    status: "DISMISSED",
    note: "Không có căn cứ."
  });
  assert.equal(dismissed.events.at(-1)?.previousStatus, "OPEN");

  for (const status of ["RESOLVED", "DISMISSED"] as const) {
    const legacy = createHarness();
    const oldReport = await legacy.service.createContactReport(tenant, legacy.inquiry.id, {
      category: "SPAM",
      details: null,
      messageId: null
    });
    legacy.reports.set(oldReport.id, { ...oldReport, status: "INVESTIGATING" });
    const completed = await legacy.service.updateContactReportStatus(admin, oldReport.id, {
      status,
      note: "Đã xem xét."
    });
    assert.equal(completed.events.at(-1)?.previousStatus, "INVESTIGATING");
  }
});
