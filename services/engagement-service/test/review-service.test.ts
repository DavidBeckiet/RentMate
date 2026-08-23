import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type {
  ListingReview,
  ReviewInquiryContext,
  ReviewRepository
} from "../src/modules/reviews/repositories/review-repository.js";
import { createReviewService } from "../src/modules/reviews/services/review-service.js";

const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 11, role: "TENANT" });
const otherTenant: AuthenticatedPrincipal = Object.freeze({ userId: 12, role: "TENANT" });
const admin: AuthenticatedPrincipal = Object.freeze({ userId: 21, role: "ADMIN" });
const createdAt = "2026-08-23T00:00:00.000Z";

function harness(options: { visible?: boolean; context?: ReviewInquiryContext } = {}) {
  const rows = new Map<number, ListingReview>();
  const context =
    options.context ??
    Object.freeze({
      id: 1,
      tenantId: tenant.userId,
      listingId: 501,
      status: "CLOSED" as const,
      hasLandlordReply: true
    });
  const executor: SqlExecutor = {
    query: async () => {
      throw new Error("SQL is not used by this test.");
    }
  };
  let nextId = 1;
  const repository: ReviewRepository = {
    async findInquiryContext(_executor, inquiryId) {
      return inquiryId === context.id ? context : null;
    },
    async findByInquiryId(_executor, inquiryId) {
      return [...rows.values()].find((row) => row.inquiryId === inquiryId) ?? null;
    },
    async create(_executor, current, input) {
      const row: ListingReview = Object.freeze({
        id: nextId++,
        inquiryId: current.id,
        listingId: current.listingId,
        tenantId: current.tenantId,
        ...input,
        status: "PENDING",
        moderationNote: null,
        reviewedByAdminId: null,
        createdAt,
        updatedAt: createdAt,
        reviewedAt: null
      });
      rows.set(row.id, row);
      return row;
    },
    async listPublic(_executor, listingId, limit, offset) {
      return [...rows.values()]
        .filter((row) => row.listingId === listingId && row.status === "APPROVED")
        .slice(offset, offset + limit);
    },
    async listAdmin(_executor, status, limit, offset) {
      return [...rows.values()].filter((row) => row.status === status).slice(offset, offset + limit);
    },
    async findById(_executor, reviewId) {
      return rows.get(reviewId) ?? null;
    },
    async moderate(_executor, reviewId, status, note, adminId) {
      const current = rows.get(reviewId);
      if (!current) throw new Error("Review was not initialized.");
      const row: ListingReview = Object.freeze({
        ...current,
        status,
        moderationNote: note,
        reviewedByAdminId: adminId,
        updatedAt: "2026-08-23T01:00:00.000Z",
        reviewedAt: "2026-08-23T01:00:00.000Z"
      });
      rows.set(reviewId, row);
      return row;
    }
  };
  const service = createReviewService({
    repository,
    transactionRunner: { run: (operation) => operation(executor) },
    listingCatalogClient: {
      loadPublicSummariesByIds: async (ids) =>
        options.visible === false ? Object.freeze([]) : (Object.freeze(ids.map((id) => Object.freeze({ id }))) as never)
    }
  });
  return { service };
}

const input = Object.freeze({
  overallRating: 5,
  accuracyRating: 4,
  responsivenessRating: 5,
  comment: "Chủ trọ phản hồi nhanh và thông tin đúng thực tế."
});

test("allows one review only after a closed inquiry with landlord reply", async () => {
  const subject = harness();
  assert.deepEqual(await subject.service.eligibility(tenant, 1), { eligible: true, reason: null, review: null });
  const review = await subject.service.create(tenant, 1, input);
  assert.equal(review.status, "PENDING");
  assert.equal((await subject.service.eligibility(tenant, 1)).reason, "ALREADY_REVIEWED");
  await assert.rejects(
    () => subject.service.create(tenant, 1, input),
    (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
  );
  await assert.rejects(
    () => subject.service.eligibility(otherTenant, 1),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );
});

test("explains ineligible inquiry states", async () => {
  const open = harness({
    context: { id: 1, tenantId: 11, listingId: 501, status: "CONTACTED", hasLandlordReply: true }
  });
  assert.equal((await open.service.eligibility(tenant, 1)).reason, "INQUIRY_OPEN");
  const noReply = harness({
    context: { id: 1, tenantId: 11, listingId: 501, status: "CLOSED", hasLandlordReply: false }
  });
  assert.equal((await noReply.service.eligibility(tenant, 1)).reason, "NO_LANDLORD_REPLY");
});

test("publishes only approved reviews for a currently public listing and moderates once", async () => {
  const subject = harness();
  const created = await subject.service.create(tenant, 1, input);
  assert.equal((await subject.service.listPublic(501, { page: 1, pageSize: 20, offset: 0 })).data.length, 0);
  const approved = await subject.service.moderate(admin, created.id, { status: "APPROVED", note: "Hợp lệ." });
  assert.equal(approved.reviewedByAdminId, admin.userId);
  assert.equal(
    (await subject.service.listAdmin(admin, { status: "APPROVED", page: 1, pageSize: 20, offset: 0 })).data.length,
    1
  );
  assert.equal((await subject.service.listPublic(501, { page: 1, pageSize: 20, offset: 0 })).data.length, 1);
  await assert.rejects(
    () => subject.service.moderate(admin, created.id, { status: "REJECTED", note: "Đổi quyết định." }),
    (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
  );

  const hidden = harness({ visible: false });
  await assert.rejects(
    () => hidden.service.listPublic(501, { page: 1, pageSize: 20, offset: 0 }),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );
});
