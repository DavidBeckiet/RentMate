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
import { createListingOverviewRepository } from "../src/modules/overview/repositories/listing-overview-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for Listing overview database tests.");
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
const schemaName = `listing_overview_${process.pid}`;
const quotedSchema = `"${schemaName}"`;
const runner = createMigrationRunner("Listing overview");
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

test("PostgreSQL Listing overview counts all moderation statuses and exact report states", async () => {
  assert.deepEqual((await transaction((executor) => createListingOverviewRepository(executor).read())).listings, {
    total: 0,
    byStatus: { DRAFT: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, HIDDEN: 0, INACTIVE: 0 }
  });
  const listingIds = await transaction(async (executor) => {
    const ids: number[] = [];
    for (const status of ["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] as const) {
      const result = await executor.query<{ id: number }>({
        text:
          status === "DRAFT"
            ? "INSERT INTO listings (landlord_id, status) VALUES (10, 'DRAFT') RETURNING id"
            : "INSERT INTO listings (landlord_id, property_type_id, status, title, description, monthly_rent, room_area_sqm, address_text, area_name, latitude, longitude) VALUES (10, (SELECT id FROM property_types ORDER BY id LIMIT 1), $1, 'Phòng thử nghiệm', 'Mô tả đủ dữ liệu để kiểm tra trạng thái tin đăng.', 1000000, 20, 'Địa chỉ thử nghiệm', 'Quận 1', 10.7, 106.7) RETURNING id",
        values: status === "DRAFT" ? [] : [status]
      });
      const id = result.rows[0]?.id;
      if (!id) throw new Error("Listing was not created.");
      ids.push(id);
    }
    await executor.query({
      text: "INSERT INTO listing_reports (listing_id, reporter_id, category, status) VALUES ($1, 100, 'FRAUD', 'OPEN')",
      values: [ids[0]]
    });
    await executor.query({
      text: "INSERT INTO listing_reports (listing_id, reporter_id, category, status) VALUES ($1, 101, 'FRAUD', 'INVESTIGATING')",
      values: [ids[1]]
    });
    await executor.query({
      text: "INSERT INTO listing_reports (listing_id, reporter_id, category, status, resolution_note, assigned_admin_id, resolved_at) VALUES ($1, 102, 'FRAUD', 'RESOLVED', 'Đã hoàn tất.', 1, CURRENT_TIMESTAMP)",
      values: [ids[2]]
    });
    return ids;
  });
  assert.equal(listingIds.length, 6);
  const value = await transaction((executor) => createListingOverviewRepository(executor).read());
  assert.deepEqual(value.listings.byStatus, { DRAFT: 1, PENDING: 1, APPROVED: 1, REJECTED: 1, HIDDEN: 1, INACTIVE: 1 });
  assert.equal(value.listings.total, 6);
  assert.deepEqual(value.listingReports, { open: 1, investigating: 1 });
});
