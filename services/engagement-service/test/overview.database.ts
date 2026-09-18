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
import { createEngagementOverviewRepository } from "../src/modules/overview/repositories/engagement-overview-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for Engagement overview database tests.");
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
const schemaName = `engagement_overview_${process.pid}`;
const quotedSchema = `"${schemaName}"`;
const runner = createMigrationRunner("Engagement overview");
const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
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
const migrationPool: MigrationPool = {
  connect: async (): Promise<MigrationClient> => {
    const client = await pool.connect();
    await client.query(`SET search_path TO ${quotedSchema}`);
    return client;
  }
};
before(async () => {
  await pool.query(`CREATE SCHEMA ${quotedSchema}`);
  const migrations = await runner.discover(migrationsDirectory);
  await runner.executePlan(migrationPool, runner.createPlan("clean", migrations));
});
after(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  await pool.end();
});

test("PostgreSQL Engagement overview separates exact operational states and report sources", async () => {
  const empty = await transaction((executor) => createEngagementOverviewRepository(executor).read());
  assert.deepEqual(
    {
      support: { open: 0, inProgress: 0 },
      reviews: { pending: 0 },
      contactReports: { open: 0, investigating: 0 },
      roommateReports: { open: 0, investigating: 0 },
      reviewReports: { open: 0, investigating: 0 }
    },
    {
      support: empty.support,
      reviews: empty.reviews,
      contactReports: empty.contactReports,
      roommateReports: empty.roommateReports,
      reviewReports: empty.reviewReports
    }
  );
  await transaction(async (executor) => {
    await executor.query({
      text: "INSERT INTO support_requests (requester_id, requester_role, category, subject, message, status) VALUES (1, 'TENANT', 'OTHER', 'Mở', 'Nội dung mở', 'OPEN'), (2, 'LANDLORD', 'OTHER', 'Đang xem', 'Nội dung đang xem', 'IN_PROGRESS'), (3, 'TENANT', 'OTHER', 'Đã kết thúc', 'Nội dung đã kết thúc', 'OPEN')",
      values: []
    });
    await executor.query({
      text: "UPDATE support_requests SET status = 'RESOLVED', resolution_note = 'Đã xử lý.', assigned_admin_id = 99, resolved_at = CURRENT_TIMESTAMP WHERE requester_id = 3",
      values: []
    });
    const inquiry = await executor.query<{ id: number }>({
      text: "INSERT INTO listing_inquiries (tenant_id, landlord_id, listing_id, status) VALUES (11, 12, 101, 'CLOSED') RETURNING id",
      values: []
    });
    const inquiryId = inquiry.rows[0]?.id;
    if (!inquiryId) throw new Error("Inquiry was not created.");
    const review = await executor.query<{ id: number }>({
      text: "INSERT INTO listing_reviews (inquiry_id, listing_id, tenant_id, overall_rating, accuracy_rating, responsiveness_rating, comment, status) VALUES ($1, 101, 11, 5, 5, 5, 'Nội dung đánh giá đủ dài để kiểm tra tổng quan.', 'PENDING') RETURNING id",
      values: [inquiryId]
    });
    const reviewId = review.rows[0]?.id;
    if (!reviewId) throw new Error("Review was not created.");
    await executor.query({
      text: "INSERT INTO review_reports (review_id, reporter_id, category, status) VALUES ($1, 21, 'SPAM', 'OPEN'), ($1, 22, 'SPAM', 'INVESTIGATING')",
      values: [reviewId]
    });
    await executor.query({
      text: "INSERT INTO review_reports (review_id, reporter_id, category, status, resolution_note, assigned_admin_id, resolved_at) VALUES ($1, 23, 'SPAM', 'RESOLVED', 'Đã hoàn tất.', 99, CURRENT_TIMESTAMP)",
      values: [reviewId]
    });
    await executor.query({
      text: "INSERT INTO contact_reports (inquiry_id, reporter_id, category, status) VALUES ($1, 31, 'SPAM', 'OPEN'), ($1, 32, 'SPAM', 'INVESTIGATING')",
      values: [inquiryId]
    });
    await executor.query({
      text: "INSERT INTO contact_reports (inquiry_id, reporter_id, category, status, resolution_note, assigned_admin_id, resolved_at) VALUES ($1, 33, 'SPAM', 'RESOLVED', 'Đã hoàn tất.', 99, CURRENT_TIMESTAMP)",
      values: [inquiryId]
    });
    await executor.query({
      text: "INSERT INTO roommate_profiles (tenant_id, intro, sleep_schedule, cleanliness_level, noise_preference, smoking_environment, pet_environment) VALUES (41, 'Hồ sơ ở ghép đủ dài để tạo dữ liệu kiểm tra nguồn báo cáo.', 'STANDARD', 'TIDY', 'SOCIAL', 'SMOKE_FREE', 'NO_PETS')",
      values: []
    });
    const roommateRequest = await executor.query<{ id: number }>({
      text: "INSERT INTO roommate_requests (owner_tenant_id, budget_min_per_person, budget_max_per_person, move_in_from, move_in_until, expires_at) VALUES (41, 1000000, 2000000, CURRENT_DATE, CURRENT_DATE + 30, CURRENT_TIMESTAMP + interval '31 days') RETURNING id",
      values: []
    });
    const roommateRequestId = roommateRequest.rows[0]?.id;
    if (!roommateRequestId) throw new Error("Roommate request was not created.");
    await executor.query({
      text: "INSERT INTO contact_reports (inquiry_id, reporter_id, source, roommate_request_id, subject_tenant_id, target_type, category, status, evidence_snapshot) VALUES (NULL, 51, 'ROOMMATE', $1, 41, 'ROOMMATE_PROFILE', 'SPAM', 'OPEN', '{}'::jsonb), (NULL, 52, 'ROOMMATE', $1, 41, 'ROOMMATE_PROFILE', 'SPAM', 'INVESTIGATING', '{}'::jsonb)",
      values: [roommateRequestId]
    });
    await executor.query({
      text: "INSERT INTO contact_reports (inquiry_id, reporter_id, source, roommate_request_id, subject_tenant_id, target_type, category, status, resolution_note, assigned_admin_id, resolved_at, evidence_snapshot) VALUES (NULL, 53, 'ROOMMATE', $1, 41, 'ROOMMATE_PROFILE', 'SPAM', 'RESOLVED', 'Đã hoàn tất.', 99, CURRENT_TIMESTAMP, '{}'::jsonb)",
      values: [roommateRequestId]
    });
  });
  const value = await transaction((executor) => createEngagementOverviewRepository(executor).read());
  assert.deepEqual(value.support, { open: 1, inProgress: 1 });
  assert.deepEqual(value.reviews, { pending: 1 });
  assert.deepEqual(value.contactReports, { open: 1, investigating: 1 });
  assert.deepEqual(value.roommateReports, { open: 1, investigating: 1 });
  assert.deepEqual(value.reviewReports, { open: 1, investigating: 1 });
});
