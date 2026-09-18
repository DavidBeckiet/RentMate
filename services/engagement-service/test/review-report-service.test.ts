import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type { ReviewRepository } from "../src/modules/reviews/repositories/review-repository.js";
import type {
  ReviewReport,
  ReviewReportEvent,
  ReviewReportRepository
} from "../src/modules/reviews/repositories/review-report-repository.js";
import { createReviewService } from "../src/modules/reviews/services/review-service.js";

const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 30, role: "LANDLORD" });
const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 11, role: "TENANT" });
const admin: AuthenticatedPrincipal = Object.freeze({ userId: 21, role: "ADMIN" });
const executor: SqlExecutor = {
  query: async () => {
    throw new Error("SQL is not used by this test.");
  }
};

function harness(initialStatus: ReviewReport["status"] = "OPEN") {
  const report: ReviewReport = {
    id: 1,
    reviewId: 7,
    listingId: 501,
    reporterId: landlord.userId,
    category: "INACCURATE",
    details: "Thông tin không khớp.",
    status: initialStatus,
    resolutionNote: null,
    assignedAdminId: null,
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    resolvedAt: null
  };
  let current = report;
  const events: ReviewReportEvent[] = [];
  const reviewReportRepository: ReviewReportRepository = {
    async findReportableReview(_executor, reviewId) {
      return reviewId === 7 ? { reviewId: 7, tenantId: tenant.userId, listingId: 501 } : null;
    },
    async create(_executor, _reviewId, _reporterId, input) {
      current = { ...current, category: input.category, details: input.details };
      return current;
    },
    async list() {
      return [current];
    },
    async findById(_executor, reportId) {
      return reportId === current.id ? current : null;
    },
    async updateStatus(_executor, _reportId, status, adminId, note) {
      current = {
        ...current,
        status,
        assignedAdminId: adminId,
        resolutionNote: note,
        resolvedAt: status === "RESOLVED" || status === "DISMISSED" ? "2026-08-25T01:00:00.000Z" : null
      };
      return current;
    },
    async appendEvent(_executor, input) {
      const event = {
        id: events.length + 1,
        actorId: input.actorId,
        actorRole: input.actorRole,
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        note: input.note,
        createdAt: "2026-08-25T00:00:00.000Z"
      } satisfies ReviewReportEvent;
      events.push(event);
      return event;
    },
    async listEvents() {
      return [...events];
    }
  };
  return createReviewService({
    repository: {} as ReviewRepository,
    reviewReportRepository,
    transactionRunner: { run: (operation) => operation(executor) },
    listingCatalogClient: {} as never
  });
}

test("creates a public-review report for another role and records its first event", async () => {
  const service = harness();
  const report = await service.createReport(landlord, 7, { category: "INACCURATE", details: "Thông tin không khớp." });
  assert.equal(report.status, "OPEN");
  assert.equal(
    (await service.listAdminReports(admin, { status: "OPEN", category: null, page: 1, pageSize: 20, offset: 0 })).data
      .length,
    1
  );
  await assert.rejects(
    () => service.createReport(tenant, 7, { category: "SPAM", details: null }),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );
});

test("keeps review-report status transitions auditable and rejects stale decisions", async () => {
  const service = harness();
  await service.createReport(landlord, 7, { category: "OTHER", details: null });
  const resolved = await service.moderateReport(admin, 1, { status: "RESOLVED", note: "Đã xem xét." });
  assert.equal(resolved.status, "RESOLVED");
  assert.deepEqual(
    resolved.events.map((event) => event.newStatus),
    ["OPEN", "RESOLVED"]
  );
  await assert.rejects(
    () => service.moderateReport(admin, 1, { status: "DISMISSED", note: "Muộn." }),
    (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
  );
});

test("dismisses an open report and completes legacy investigating reports either way", async () => {
  const open = harness();
  const dismissed = await open.moderateReport(admin, 1, { status: "DISMISSED", note: "Không có căn cứ." });
  assert.equal(dismissed.events[0]?.previousStatus, "OPEN");

  const legacyResolved = harness("INVESTIGATING");
  const resolved = await legacyResolved.moderateReport(admin, 1, { status: "RESOLVED", note: "Đã xem xét." });
  assert.equal(resolved.events[0]?.previousStatus, "INVESTIGATING");

  const legacyDismissed = harness("INVESTIGATING");
  const closed = await legacyDismissed.moderateReport(admin, 1, { status: "DISMISSED", note: "Không cần xử lý." });
  assert.equal(closed.events[0]?.previousStatus, "INVESTIGATING");
});
