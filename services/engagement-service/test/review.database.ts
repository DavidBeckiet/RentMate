import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresPool } from "../../shared/src/runtime/db/pool.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { withTransaction } from "../../shared/src/runtime/db/transaction.js";
import {
  createMigrationRunner,
  type MigrationClient,
  type MigrationPool
} from "../../shared/src/runtime/migrations/migration-runner.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import { createReviewReportRepository } from "../src/modules/reviews/repositories/review-report-repository.js";
import { createReviewRepository } from "../src/modules/reviews/repositories/review-repository.js";
import { createReviewService } from "../src/modules/reviews/services/review-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for Review database integration tests.");

const parsed = new URL(databaseUrl);
const pool = createPostgresPool(
  {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    max: 4,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000
  },
  { debug() {}, info() {}, warn() {}, error() {} }
);
const schemaName = `listing_reviews_${process.pid}`;
const quotedSchema = `"${schemaName}"`;
const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migrationRunner = createMigrationRunner("Engagement");
const repository = createReviewRepository();
const tenant = Object.freeze({ userId: 11, role: "TENANT" as const });
const admin = Object.freeze({ userId: 99, role: "ADMIN" as const });
const input = Object.freeze({
  overallRating: 5,
  accuracyRating: 4,
  responsivenessRating: 5,
  comment: "Nội dung phản hồi đủ dài để vượt qua kiểm tra tối thiểu."
});
const service = createReviewService({
  repository,
  reviewReportRepository: createReviewReportRepository(),
  transactionRunner: { run: transaction },
  listingCatalogClient: { loadPublicSummariesByIds: async () => [] }
});

function migrationPool(): MigrationPool {
  return {
    async connect(): Promise<MigrationClient> {
      const client = await pool.connect();
      await client.query(`SET search_path TO ${quotedSchema}`);
      return client;
    }
  };
}

function transaction<Value>(operation: (executor: SqlExecutor) => Promise<Value>): Promise<Value> {
  return withTransaction(
    {
      connect: async () => {
        const client = await pool.connect();
        await client.query(`SET search_path TO ${quotedSchema}`);
        return client;
      }
    },
    { error() {} },
    operation
  );
}

async function createPendingReview() {
  const inquiryId = await transaction(async (executor) => {
    const inquiry = await executor.query<{ id: number }>({
      text: `
        INSERT INTO listing_inquiries (tenant_id, landlord_id, listing_id, status)
        VALUES ($1, $2, $3, 'CLOSED')
        RETURNING id
      `,
      values: [tenant.userId, 30, 501]
    });
    const id = inquiry.rows[0]?.id;
    if (!id) throw new Error("The test inquiry was not created.");
    await executor.query({
      text: `
        INSERT INTO inquiry_messages (inquiry_id, sender_id, sender_role, body)
        VALUES ($1, $2, 'LANDLORD', $3)
      `,
      values: [id, 30, "Phản hồi từ chủ trọ để xác nhận tương tác trước đó."]
    });
    return id;
  });
  return service.create(tenant, inquiryId, input);
}

async function rawState(reviewId: number) {
  return transaction(async (executor) => {
    const result = await executor.query<{
      status: string;
      moderation_note: string | null;
      reviewed_by_admin_id: number | null;
      reviewed_at: Date | null;
    }>({
      text: "SELECT status, moderation_note, reviewed_by_admin_id, reviewed_at FROM listing_reviews WHERE id = $1",
      values: [reviewId]
    });
    const row = result.rows[0];
    if (!row) throw new Error("The test review was not created.");
    return row;
  });
}

before(async () => {
  await pool.query(`CREATE SCHEMA ${quotedSchema}`);
  const migrations = await migrationRunner.discover(migrationsDirectory);
  await migrationRunner.executePlan(migrationPool(), migrationRunner.createPlan("clean", migrations));
});

after(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  await pool.end();
});

test("PostgreSQL persists a PENDING to APPROVED moderation decision", async () => {
  const created = await createPendingReview();
  const updated = await service.moderate(admin, created.id, {
    status: "APPROVED",
    note: "Đã duyệt sau khi đọc nội dung."
  });
  const stored = await rawState(created.id);

  assert.equal(updated.status, "APPROVED");
  assert.equal(updated.moderationNote, "Đã duyệt sau khi đọc nội dung.");
  assert.equal(updated.reviewedByAdminId, admin.userId);
  assert.ok(updated.reviewedAt);
  assert.deepEqual(stored.status, "APPROVED");
  assert.equal(stored.moderation_note, "Đã duyệt sau khi đọc nội dung.");
  assert.equal(stored.reviewed_by_admin_id, admin.userId);
  assert.ok(stored.reviewed_at);
});

test("PostgreSQL persists a PENDING to REJECTED decision and rejects a stale second decision", async () => {
  const created = await createPendingReview();
  const updated = await service.moderate(admin, created.id, {
    status: "REJECTED",
    note: "Nội dung không đáp ứng tiêu chuẩn."
  });
  const stored = await rawState(created.id);

  assert.equal(updated.status, "REJECTED");
  assert.equal(updated.moderationNote, "Nội dung không đáp ứng tiêu chuẩn.");
  assert.equal(updated.reviewedByAdminId, admin.userId);
  assert.ok(updated.reviewedAt);
  assert.deepEqual(stored.status, "REJECTED");
  assert.equal(stored.moderation_note, "Nội dung không đáp ứng tiêu chuẩn.");
  assert.equal(stored.reviewed_by_admin_id, admin.userId);
  assert.ok(stored.reviewed_at);
  await assert.rejects(
    () => service.moderate(admin, created.id, { status: "APPROVED", note: "Không được phép mở lại." }),
    (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
  );
});
