import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type {
  ListingReport,
  ReportEvent,
  ReportRepository
} from "../src/modules/reports/repositories/report-repository.js";
import { createReportService } from "../src/modules/reports/services/report-service.js";
import type { ReportStatus } from "../src/modules/reports/validations/report-validation.js";

const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 10, role: "TENANT" });
const admin: AuthenticatedPrincipal = Object.freeze({ userId: 20, role: "ADMIN" });
const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 30, role: "LANDLORD" });
const executor: SqlExecutor = {
  query: async () => {
    throw new Error("SQL is not used by this test.");
  }
};

function harness(reportable = true) {
  const reports = new Map<number, ListingReport>();
  const events = new Map<number, ReportEvent[]>();
  let nextReportId = 1;
  let nextEventId = 1;
  const repository: ReportRepository = {
    async isReportableListing() {
      return reportable;
    },
    async create(_executor, reporterId, listingId, input) {
      const report: ListingReport = Object.freeze({
        id: nextReportId++,
        listing: Object.freeze({ id: listingId, title: "Phòng sáng", areaName: "Quận 3", status: "APPROVED" }),
        reporterId,
        category: input.category,
        details: input.details,
        status: "OPEN",
        resolutionNote: null,
        assignedAdminId: null,
        createdAt: "2026-08-23T00:00:00.000Z",
        updatedAt: "2026-08-23T00:00:00.000Z",
        resolvedAt: null
      });
      reports.set(report.id, report);
      events.set(report.id, []);
      return report;
    },
    async list(_executor, input) {
      return [...reports.values()]
        .filter((report) => report.status === input.status)
        .slice(input.offset, input.offset + input.limit);
    },
    async findById(_executor, reportId) {
      return reports.get(reportId) ?? null;
    },
    async updateStatus(_executor, reportId, status, adminId, note) {
      const current = reports.get(reportId)!;
      const terminal = status === "RESOLVED" || status === "DISMISSED";
      const updated: ListingReport = Object.freeze({
        ...current,
        status,
        assignedAdminId: adminId,
        resolutionNote: terminal ? note : null,
        updatedAt: "2026-08-23T01:00:00.000Z",
        resolvedAt: terminal ? "2026-08-23T01:00:00.000Z" : null
      });
      reports.set(reportId, updated);
      return updated;
    },
    async appendEvent(_executor, input) {
      const event: ReportEvent = Object.freeze({
        id: nextEventId++,
        actorId: input.actorId,
        actorRole: input.actorRole,
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        note: input.note,
        createdAt: "2026-08-23T00:00:00.000Z"
      });
      events.get(input.reportId)!.push(event);
      return event;
    },
    async listEvents(_executor, reportId) {
      return Object.freeze([...(events.get(reportId) ?? [])]);
    }
  };
  const service = createReportService({
    repository,
    transactionRunner: (operation) => operation(executor),
    identityAccountClient: {
      loadActiveLandlordIds: async () => Object.freeze([30]),
      loadProfilesByIds: async () =>
        Object.freeze([{ id: 10, role: "TENANT", email: "tenant@example.com", phone: null, isActive: true }])
    }
  });
  return { service, reports, events };
}

test("creates a tenant report and its first history event atomically", async () => {
  const subject = harness();
  const report = await subject.service.create(tenant, 51, { category: "FRAUD", details: "Đề nghị chuyển cọc." });
  assert.equal(report.status, "OPEN");
  assert.deepEqual(
    subject.events.get(report.id)?.map((event) => [event.actorRole, event.newStatus]),
    [["TENANT", "OPEN"]]
  );
  await assert.rejects(() => subject.service.create(landlord, 51, { category: "FRAUD", details: null }), /permission/i);
});

test("hides non-public report targets", async () => {
  const subject = harness(false);
  await assert.rejects(
    () => subject.service.create(tenant, 51, { category: "ALREADY_RENTED", details: null }),
    /not found/i
  );
});

test("resolves an open report directly, records history and rejects a stale decision", async () => {
  const subject = harness();
  const created = await subject.service.create(tenant, 51, { category: "IMAGE_INCORRECT", details: null });
  const resolved = await subject.service.updateStatus(admin, created.id, {
    status: "RESOLVED",
    note: "Đã xem xét bằng chứng."
  });
  assert.equal(resolved.status, "RESOLVED");
  assert.deepEqual(
    resolved.events.map((event) => event.newStatus),
    ["OPEN", "RESOLVED"] satisfies ReportStatus[]
  );
  assert.equal(resolved.events[1]?.previousStatus, "OPEN");
  await assert.rejects(
    () => subject.service.updateStatus(admin, created.id, { status: "DISMISSED", note: "Không hợp lệ." }),
    /not allowed/i
  );
});

test("dismisses an open report and completes either decision from a legacy investigating report", async () => {
  const subject = harness();
  const dismissedReport = await subject.service.create(tenant, 51, { category: "FRAUD", details: null });
  const dismissed = await subject.service.updateStatus(admin, dismissedReport.id, {
    status: "DISMISSED",
    note: "Không có căn cứ."
  });
  assert.equal(dismissed.events[1]?.previousStatus, "OPEN");

  const legacyResolved = await subject.service.create(tenant, 52, { category: "FRAUD", details: null });
  subject.reports.set(legacyResolved.id, { ...legacyResolved, status: "INVESTIGATING" });
  const resolved = await subject.service.updateStatus(admin, legacyResolved.id, {
    status: "RESOLVED",
    note: "Đã hoàn tất xem xét."
  });
  assert.equal(resolved.events.at(-1)?.previousStatus, "INVESTIGATING");

  const legacyDismissed = await subject.service.create(tenant, 53, { category: "FRAUD", details: null });
  subject.reports.set(legacyDismissed.id, { ...legacyDismissed, status: "INVESTIGATING" });
  const closed = await subject.service.updateStatus(admin, legacyDismissed.id, {
    status: "DISMISSED",
    note: "Không cần xử lý thêm."
  });
  assert.equal(closed.events.at(-1)?.previousStatus, "INVESTIGATING");
});
