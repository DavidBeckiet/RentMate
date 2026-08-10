import dotenv from "dotenv";
import path from "node:path";
import type { QueryResult, QueryResultRow } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { closeDatabasePool } from "../src/db/pool.js";
import { createSqlExecutor, type ParameterizedQuery, type SqlExecutor } from "../src/db/sql-executor.js";
import { withTransaction } from "../src/db/transaction.js";
import { createAdminListingReadRepository } from "../src/modules/listings/admin-listing-read-repository.js";
import { createCurrentModerationReasonRepository } from "../src/modules/listings/current-moderation-reason-repository.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import { createModerationActionService } from "../src/modules/listings/moderation-action-service.js";
import {
  validateModerationActionBody,
  type ModerationAction,
  type ModerationActionInput
} from "../src/modules/listings/moderation-action-validation.js";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";
import type { Logger } from "../src/shared/logging/logger.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 4 });
const executor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
const statuses = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] as const;
const actions = ["APPROVE", "REJECT", "HIDE", "RESTORE"] as const;
const transitions: Readonly<Record<ModerationAction, readonly [ListingStatus, ListingStatus]>> = Object.freeze({
  APPROVE: ["PENDING", "APPROVED"],
  REJECT: ["PENDING", "REJECTED"],
  HIDE: ["APPROVED", "HIDDEN"],
  RESTORE: ["HIDDEN", "APPROVED"]
});
let sequence = 0;

async function cleanSchema(): Promise<void> {
  for (const table of [
    "moderation_history",
    "favorites",
    "listing_amenities",
    "listing_images",
    "listings",
    "amenities",
    "property_types",
    "users"
  ]) {
    await pool.query(`DROP TABLE IF EXISTS ${table}`);
  }
  await pool.query("DROP TYPE IF EXISTS listing_status");
  await pool.query("DROP TYPE IF EXISTS user_role");
}

async function resetRows(): Promise<void> {
  await pool.query("DELETE FROM moderation_history");
  await pool.query("DELETE FROM favorites");
  await pool.query("DELETE FROM listing_amenities");
  await pool.query("DELETE FROM listing_images");
  await pool.query("DELETE FROM listings");
  await pool.query("DELETE FROM users");
}

async function insertUser(role: "ADMIN" | "LANDLORD" | "TENANT"): Promise<number> {
  sequence += 1;
  return (
    await pool.query<{ id: number }>({
      text: "INSERT INTO users (role,email,phone_e164,password_hash,is_active) VALUES ($1,$2,$3,'hash',true) RETURNING id",
      values: [
        role,
        `rm044.matrix.${role.toLowerCase()}.${sequence}@example.com`,
        role === "LANDLORD" ? `+8494${String(sequence).padStart(8, "0")}` : null
      ]
    })
  ).rows[0]!.id;
}

async function insertListing(landlordId: number, status: ListingStatus): Promise<number> {
  sequence += 1;
  return (
    await pool.query<{ id: number }>({
      text: `INSERT INTO listings
        (landlord_id,property_type_id,status,title,description,monthly_rent,room_area_sqm,address_text,area_name,latitude,longitude,created_at,updated_at)
        VALUES ($1,(SELECT id FROM property_types WHERE code='STUDIO'),$2,$3,'Description',5000000,25,'Private address','District 1',10.75,106.67,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z') RETURNING id`,
      values: [landlordId, status, `RM-044 matrix listing ${sequence}`]
    })
  ).rows[0]!.id;
}

function transactionRunner(): TransactionRunner {
  return async (operation) => withTransaction(pool, logger, operation);
}

function service(runner: TransactionRunner = transactionRunner()) {
  return createModerationActionService({ transactionRunner: runner });
}

async function moderate(adminId: number, listingId: number, input: ModerationActionInput) {
  return service().moderateListing({ userId: adminId, role: "ADMIN" }, listingId, input);
}

async function listingSnapshot(listingId: number) {
  return (
    await pool.query<{
      id: number;
      landlord_id: number;
      property_type_id: number;
      status: ListingStatus;
      title: string | null;
      description: string | null;
      monthly_rent: string | null;
      room_area_sqm: string | null;
      address_text: string | null;
      area_name: string | null;
      latitude: number | null;
      longitude: number | null;
      created_at: Date;
      updated_at: Date;
    }>("SELECT * FROM listings WHERE id=$1", [listingId])
  ).rows[0]!;
}

async function historyRows(listingId: number) {
  return (
    await pool.query<{
      id: number;
      listing_id: number;
      admin_id: number;
      previous_status: ListingStatus;
      new_status: ListingStatus;
      reason: string | null;
      created_at: Date;
    }>(
      "SELECT id,listing_id,admin_id,previous_status,new_status,reason,created_at FROM moderation_history WHERE listing_id=$1 ORDER BY id",
      [listingId]
    )
  ).rows;
}

async function sideEffectCounts() {
  const names = ["favorites", "listing_images", "listing_amenities", "property_types", "amenities"] as const;
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        (await pool.query<{ count: number }>(`SELECT COUNT(*)::integer AS count FROM ${name}`)).rows[0]!.count
      ])
    )
  );
}

beforeAll(async () => {
  await cleanSchema();
  await executeMigrationPlan(pool, createMigrationPlan("clean", await discoverMigrations(migrationDirectory)));
});
beforeEach(resetRows);
afterAll(async () => {
  await cleanSchema();
  await closeDatabasePool(pool);
});

const matrix = actions.flatMap((action) => statuses.map((status) => ({ action, status })));

describe("RM-044 exhaustive PostgreSQL moderation matrix", () => {
  it.each(matrix)("enforces $action from $status atomically", async ({ action, status }) => {
    const adminId = await insertUser("ADMIN");
    const listingId = await insertListing(await insertUser("LANDLORD"), status);
    const before = await listingSnapshot(listingId);
    const historyBefore = await historyRows(listingId);
    const sideEffectsBefore = await sideEffectCounts();
    const [legalSource, target] = transitions[action];
    const reason = action === "REJECT" || action === "HIDE" ? `${action.toLowerCase()} reason` : null;

    if (status === legalSource) {
      const returned = await moderate(adminId, listingId, { action, reason });
      const after = await listingSnapshot(listingId);
      const history = await historyRows(listingId);
      expect(after.status).toBe(target);
      expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
      expect({ ...after, status: before.status, updated_at: before.updated_at }).toStrictEqual(before);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        listing_id: listingId,
        admin_id: adminId,
        previous_status: status,
        new_status: target,
        reason
      });
      expect(Object.keys(history[0]!).sort()).toStrictEqual(
        ["id", "listing_id", "admin_id", "previous_status", "new_status", "reason", "created_at"].sort()
      );
      expect(returned).toMatchObject({
        id: history[0]!.id,
        listingId,
        adminId,
        previousStatus: status,
        newStatus: target,
        reason
      });
      expect(returned.createdAt.toISOString()).toBe(history[0]!.created_at.toISOString());
    } else {
      await expect(moderate(adminId, listingId, { action, reason })).rejects.toMatchObject({
        code: "INVALID_LISTING_TRANSITION"
      });
      expect(await listingSnapshot(listingId)).toStrictEqual(before);
      expect(await historyRows(listingId)).toStrictEqual(historyBefore);
    }
    expect(await sideEffectCounts()).toStrictEqual(sideEffectsBefore);
  });

  it("validates required REJECT/HIDE reasons at Unicode code-point boundaries without mutation", async () => {
    const validCases = [
      { value: "x", stored: "x" },
      { value: "  normal reason  ", stored: "normal reason" },
      { value: "😀".repeat(1000), stored: "😀".repeat(1000) }
    ];
    const invalidCases = [
      { kind: "omitted" },
      { kind: "value", value: null },
      { kind: "value", value: "" },
      { kind: "value", value: "   " },
      { kind: "value", value: 1 },
      { kind: "value", value: "😀".repeat(1001) }
    ];

    for (const action of ["REJECT", "HIDE"] as const) {
      for (const testCase of validCases) {
        await resetRows();
        const adminId = await insertUser("ADMIN");
        const source = transitions[action][0];
        const listingId = await insertListing(await insertUser("LANDLORD"), source);
        const input = validateModerationActionBody({ action, reason: testCase.value });
        const returned = await moderate(adminId, listingId, input);
        expect(returned.reason).toBe(testCase.stored);
        expect((await historyRows(listingId))[0]!.reason).toBe(testCase.stored);
      }
      for (const testCase of invalidCases) {
        await resetRows();
        const listingId = await insertListing(await insertUser("LANDLORD"), transitions[action][0]);
        const before = await listingSnapshot(listingId);
        const body = testCase.kind === "omitted" ? { action } : { action, reason: testCase.value };
        expect(() => validateModerationActionBody(body)).toThrow();
        expect(await listingSnapshot(listingId)).toStrictEqual(before);
        expect(await historyRows(listingId)).toHaveLength(0);
      }
    }
  });

  it("validates optional APPROVE/RESTORE notes at Unicode code-point boundaries without mutation", async () => {
    const validCases = [
      { kind: "omitted", stored: null },
      { kind: "value", value: null, stored: null },
      { kind: "value", value: "  normal note  ", stored: "normal note" },
      { kind: "value", value: "😀".repeat(1000), stored: "😀".repeat(1000) }
    ];
    const invalidCases = [{ value: "" }, { value: "   " }, { value: 1 }, { value: "😀".repeat(1001) }];

    for (const action of ["APPROVE", "RESTORE"] as const) {
      for (const testCase of validCases) {
        await resetRows();
        const adminId = await insertUser("ADMIN");
        const listingId = await insertListing(await insertUser("LANDLORD"), transitions[action][0]);
        const body = testCase.kind === "omitted" ? { action } : { action, reason: testCase.value };
        const returned = await moderate(adminId, listingId, validateModerationActionBody(body));
        expect(returned.reason).toBe(testCase.stored);
        expect((await historyRows(listingId))[0]!.reason).toBe(testCase.stored);
      }
      for (const testCase of invalidCases) {
        await resetRows();
        const listingId = await insertListing(await insertUser("LANDLORD"), transitions[action][0]);
        const before = await listingSnapshot(listingId);
        expect(() => validateModerationActionBody({ action, reason: testCase.value })).toThrow();
        expect(await listingSnapshot(listingId)).toStrictEqual(before);
        expect(await historyRows(listingId)).toHaveLength(0);
      }
    }
  });

  it("retains append-only history and exposes current reason semantics through integrated reads", async () => {
    const adminId = await insertUser("ADMIN");
    const landlordId = await insertUser("LANDLORD");
    const listingId = await insertListing(landlordId, "APPROVED");
    await pool.query(
      "INSERT INTO moderation_history (listing_id,admin_id,previous_status,new_status,reason,created_at) VALUES ($1,$2,'PENDING','APPROVED',NULL,'2019-01-01T00:00:00Z')",
      [listingId, adminId]
    );
    const existing = (await historyRows(listingId))[0]!;

    await moderate(adminId, listingId, { action: "HIDE", reason: "H1" });
    await expect(createCurrentModerationReasonRepository(executor).findLatestReason(listingId, "HIDDEN")).resolves.toBe(
      "H1"
    );
    await moderate(adminId, listingId, { action: "RESTORE", reason: "R1" });
    expect((await listingSnapshot(listingId)).status).toBe("APPROVED");

    const durable = await historyRows(listingId);
    expect(durable).toHaveLength(3);
    expect(durable[0]).toStrictEqual(existing);
    const page = await createAdminListingReadRepository(executor).findModerationHistoryPage({
      listingId,
      limit: 10,
      offset: 0
    });
    expect(page.map((item) => item.newStatus)).toStrictEqual(["APPROVED", "HIDDEN", "APPROVED"]);
    expect(page[0]).toMatchObject({ reason: "R1", previousStatus: "HIDDEN", newStatus: "APPROVED" });
    expect(page[1]).toMatchObject({ reason: "H1", previousStatus: "APPROVED", newStatus: "HIDDEN" });
    expect(Object.keys(page[0]!).sort()).toStrictEqual(
      ["id", "listingId", "adminId", "previousStatus", "newStatus", "reason", "createdAt"].sort()
    );

    const rejectedId = await insertListing(landlordId, "PENDING");
    await moderate(adminId, rejectedId, { action: "REJECT", reason: "R" });
    await expect(
      createCurrentModerationReasonRepository(executor).findLatestReason(rejectedId, "REJECTED")
    ).resolves.toBe("R");
    const approvedId = await insertListing(landlordId, "PENDING");
    await moderate(adminId, approvedId, { action: "APPROVE", reason: null });
    expect((await listingSnapshot(approvedId)).status).toBe("APPROVED");
    expect((await historyRows(approvedId))[0]!.reason).toBeNull();
  });

  it.each(["insert", "mapping"] as const)(
    "rolls back listing state and history when the history %s path fails",
    async (fault) => {
      const adminId = await insertUser("ADMIN");
      const listingId = await insertListing(await insertUser("LANDLORD"), "PENDING");
      const before = await listingSnapshot(listingId);
      const runner: TransactionRunner = async (operation) =>
        withTransaction(pool, logger, async (transaction) => {
          const faulting: SqlExecutor = {
            async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
              if (!query.text.startsWith("INSERT INTO moderation_history")) return transaction.query<Row>(query);
              if (fault === "insert") throw new Error("synthetic history insert failure");
              const durable = await transaction.query<Row>(query);
              return { ...durable, rows: [{ id: 0 }] as unknown as Row[] };
            }
          };
          return operation(faulting);
        });
      await expect(
        service(runner).moderateListing({ userId: adminId, role: "ADMIN" }, listingId, {
          action: "APPROVE",
          reason: null
        })
      ).rejects.toThrow(fault === "insert" ? "synthetic history insert failure" : "Moderation history representation");
      expect(await listingSnapshot(listingId)).toStrictEqual(before);
      expect(await historyRows(listingId)).toHaveLength(0);
    }
  );
});
