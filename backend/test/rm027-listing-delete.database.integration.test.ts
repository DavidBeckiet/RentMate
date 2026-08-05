import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqlExecutor, type ParameterizedQuery, type SqlExecutor } from "../src/db/sql-executor.js";
import { withTransaction } from "../src/db/transaction.js";
import type { ListingDeleteCleanupHandoff } from "../src/modules/listings/listing-delete-cleanup.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import {
  createPhase4DatabaseFixture,
  phase4JwtSecret,
  phase4NowSeconds,
  phase4Origin,
  type Phase4DatabaseFixture
} from "./helpers/listings-phase4-fixture.js";

const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
let fixture: Phase4DatabaseFixture;
let sequence = 0;

type DeleteFault = "conditional-delete" | "delete-failure";

interface DeleteAppFixture {
  readonly app: Express;
  readonly cleanupCalls: readonly (readonly string[])[];
  readonly cleanupObservedCommittedDelete: readonly boolean[];
  readonly statements: readonly ParameterizedQuery[];
  readonly setCleanupTarget: (listingId: number) => void;
}

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function faultingExecutor(
  delegate: SqlExecutor,
  statements: ParameterizedQuery[],
  fault: DeleteFault | undefined
): SqlExecutor {
  return {
    async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
      statements.push(query);
      if (fault === "delete-failure" && query.text.includes("DELETE FROM listings")) {
        throw new Error("synthetic RM-027 delete failure");
      }
      const result = await delegate.query<Row>(query);
      if (fault === "conditional-delete" && query.text.includes("DELETE FROM listings")) {
        return { ...result, rowCount: 0 };
      }
      return result;
    }
  };
}

async function createDeleteApp(fault?: DeleteFault): Promise<DeleteAppFixture> {
  const statements: ParameterizedQuery[] = [];
  const cleanupCalls: (readonly string[])[] = [];
  const cleanupObservedCommittedDelete: boolean[] = [];
  let cleanupTargetId = 0;
  const sqlExecutor = createSqlExecutor(fixture.pool);
  const transactionRunner: TransactionRunner = async <Value>(
    operation: (executor: SqlExecutor) => Promise<Value>
  ): Promise<Value> =>
    withTransaction(fixture.pool, logger, async (transaction) =>
      operation(faultingExecutor(transaction, statements, fault))
    );
  const cleanupHandoff: ListingDeleteCleanupHandoff = {
    afterCommittedDelete: vi.fn(async (publicIds) => {
      cleanupCalls.push(publicIds);
      const result = await fixture.pool.query<{ count: number }>({
        text: `SELECT count(*)::integer AS count FROM listings WHERE id = $1`,
        values: [cleanupTargetId]
      });
      cleanupObservedCommittedDelete.push(result.rows[0]!.count === 0);
    })
  };
  const app = await createBackendApp({
    frontendOrigin: phase4Origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor,
    jwtSecret: phase4JwtSecret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => phase4NowSeconds,
    authRateLimitClock: () => 0,
    transactionRunner,
    listingDeleteCleanupHandoff: cleanupHandoff
  });

  return {
    app,
    cleanupCalls,
    cleanupObservedCommittedDelete,
    statements,
    setCleanupTarget: (listingId) => {
      cleanupTargetId = listingId;
    }
  };
}

async function insertListing(landlordId: number, status: string): Promise<number> {
  const result = await fixture.pool.query<{ id: number }>({
    text: `
      INSERT INTO listings (
        landlord_id, property_type_id, status, title, description, monthly_rent,
        room_area_sqm, address_text, area_name, latitude, longitude
      )
      VALUES (
        $1, (SELECT id FROM property_types WHERE code = 'STUDIO'), $2::listing_status,
        'RM-027 listing', 'Listing eligible for delete tests', 5000000,
        25.50, 'Private address', 'District', 10.75, 106.67
      )
      RETURNING id
    `,
    values: [landlordId, status]
  });
  return result.rows[0]!.id;
}

async function addChildren(listingId: number, tenantId: number): Promise<readonly string[]> {
  sequence += 1;
  const publicIds = [`rm027/${sequence}-a`, `rm027/${sequence}-b`];
  await fixture.pool.query({
    text: `INSERT INTO listing_amenities (listing_id, amenity_id) SELECT $1, id FROM amenities WHERE code = 'WIFI'`,
    values: [listingId]
  });
  for (const [index, publicId] of publicIds.entries()) {
    await fixture.pool.query({
      text: `
        INSERT INTO listing_images (
          listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order
        )
        VALUES ($1, $2, $3, 'webp', 800, 600, 1234, $4)
      `,
      values: [listingId, publicId, `https://example.test/${publicId}.webp`, index + 1]
    });
  }
  await fixture.pool.query({
    text: `INSERT INTO favorites (tenant_id, listing_id) VALUES ($1, $2)`,
    values: [tenantId, listingId]
  });
  return Object.freeze(publicIds);
}

async function deleteListing(app: Express, landlordId: number, listingId: number, expectedStatus: number) {
  return request(app)
    .delete(`/api/v1/landlord/listings/${listingId}`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${await fixture.signToken(landlordId)}`)
    .expect(expectedStatus);
}

async function tableListingCount(table: string, listingId: number): Promise<number> {
  const listingReferenceColumn = table === "listings" ? "id" : "listing_id";
  const result = await fixture.pool.query<{ count: number }>({
    text: `SELECT count(*)::integer AS count FROM ${table} WHERE ${listingReferenceColumn} = $1`,
    values: [listingId]
  });
  return result.rows[0]!.count;
}

beforeAll(async () => {
  fixture = createPhase4DatabaseFixture(migrationDirectory);
  await fixture.rebuildSchema();
});

beforeEach(async () => {
  await fixture.resetData();
});

afterAll(async () => {
  await fixture.dropSchema();
  await fixture.close();
});

describe("RM-027 listing delete PostgreSQL integration", () => {
  it("deletes an eligible empty DRAFT, hands off one frozen empty array after commit, then returns 404", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    const application = await createDeleteApp();
    application.setCleanupTarget(listingId);
    const response = await deleteListing(application.app, landlordId, listingId, 204);
    expect(response.text).toBe("");
    expect(await tableListingCount("listings", listingId)).toBe(0);
    expect(application.cleanupCalls).toHaveLength(1);
    expect(application.cleanupCalls[0]).toStrictEqual([]);
    expect(Object.isFrozen(application.cleanupCalls[0])).toBe(true);
    expect(application.cleanupObservedCommittedDelete).toStrictEqual([true]);
    expect(application.statements).toHaveLength(4);
    await deleteListing(application.app, landlordId, listingId, 404);
    expect(application.cleanupCalls).toHaveLength(1);
  });

  it("captures ordered public IDs and relies only on database cascades for all child rows", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const tenantId = await fixture.insertUser("TENANT", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    const unrelatedId = await insertListing(landlordId, "DRAFT");
    const publicIds = await addChildren(listingId, tenantId);
    const usersBefore = await fixture.tableCount("users");
    const propertyTypesBefore = await fixture.tableCount("property_types");
    const amenitiesBefore = await fixture.tableCount("amenities");
    const application = await createDeleteApp();
    application.setCleanupTarget(listingId);
    await deleteListing(application.app, landlordId, listingId, 204);

    expect(await tableListingCount("listings", listingId)).toBe(0);
    expect(await tableListingCount("listing_images", listingId)).toBe(0);
    expect(await tableListingCount("listing_amenities", listingId)).toBe(0);
    expect(await tableListingCount("favorites", listingId)).toBe(0);
    expect(await tableListingCount("listings", unrelatedId)).toBe(1);
    expect(await fixture.tableCount("users")).toBe(usersBefore);
    expect(await fixture.tableCount("property_types")).toBe(propertyTypesBefore);
    expect(await fixture.tableCount("amenities")).toBe(amenitiesBefore);
    expect(application.cleanupCalls).toStrictEqual([publicIds]);
    expect(application.cleanupObservedCommittedDelete).toStrictEqual([true]);
    expect(application.statements).toHaveLength(4);
    expect(application.statements.map((statement) => statement.text)).toEqual([
      expect.stringContaining("FOR UPDATE OF l"),
      expect.stringContaining("SELECT EXISTS"),
      expect.stringContaining("SELECT cloudinary_public_id"),
      expect.stringContaining("DELETE FROM listings")
    ]);
    expect(application.statements.filter((statement) => statement.text.includes("DELETE FROM"))).toHaveLength(1);
  });

  it.each(["PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] as const)(
    "rejects non-DRAFT %s after only the owner lock",
    async (status) => {
      const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
      const tenantId = await fixture.insertUser("TENANT", ++sequence);
      const listingId = await insertListing(landlordId, status);
      await addChildren(listingId, tenantId);
      const application = await createDeleteApp();
      application.setCleanupTarget(listingId);
      const response = await deleteListing(application.app, landlordId, listingId, 409);
      expect(response.body.error).toMatchObject({
        code: "LISTING_DELETE_NOT_ALLOWED",
        message: "The listing cannot be deleted."
      });
      expect(application.statements).toHaveLength(1);
      expect(application.statements[0]!.text).toContain("FOR UPDATE OF l");
      expect(await tableListingCount("listings", listingId)).toBe(1);
      expect(await tableListingCount("listing_images", listingId)).toBe(2);
      expect(application.cleanupCalls).toHaveLength(0);
    }
  );

  it("blocks a rejected listing edited back to DRAFT and retains history and children", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const tenantId = await fixture.insertUser("TENANT", ++sequence);
    const adminId = await fixture.insertUser("ADMIN", ++sequence);
    const listingId = await insertListing(landlordId, "REJECTED");
    await addChildren(listingId, tenantId);
    await fixture.pool.query({
      text: `INSERT INTO moderation_history (listing_id, admin_id, previous_status, new_status, reason) VALUES ($1, $2, 'PENDING', 'REJECTED', 'Needs revision')`,
      values: [listingId, adminId]
    });
    await fixture.pool.query({ text: `UPDATE listings SET status = 'DRAFT' WHERE id = $1`, values: [listingId] });
    const before = await fixture.stateSnapshot();
    const application = await createDeleteApp();
    application.setCleanupTarget(listingId);
    const response = await deleteListing(application.app, landlordId, listingId, 409);
    expect(response.body.error.code).toBe("LISTING_DELETE_NOT_ALLOWED");
    expect(application.statements).toHaveLength(2);
    expect(application.statements[1]!.text).toContain("moderation_history");
    expect(await fixture.stateSnapshot()).toStrictEqual(before);
    expect(application.cleanupCalls).toHaveLength(0);
  });

  it("uses equivalent owner-safe disclosure and permits only the owner to delete", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const otherId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(ownerId, "DRAFT");
    const otherApp = await createDeleteApp();
    otherApp.setCleanupTarget(listingId);
    const other = await deleteListing(otherApp.app, otherId, listingId, 404);
    const missingApp = await createDeleteApp();
    const missing = await deleteListing(missingApp.app, ownerId, 2_147_483_647, 404);
    for (const response of [other, missing]) {
      expect(response.body.error).toMatchObject({
        code: "RESOURCE_NOT_FOUND",
        message: "The requested resource was not found."
      });
    }
    expect(otherApp.statements).toHaveLength(1);
    expect(missingApp.statements).toHaveLength(1);
    expect(otherApp.cleanupCalls).toHaveLength(0);
    const ownerApp = await createDeleteApp();
    ownerApp.setCleanupTarget(listingId);
    await deleteListing(ownerApp.app, ownerId, listingId, 204);
  });

  it("rolls back a stale conditional delete with every child row intact", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const tenantId = await fixture.insertUser("TENANT", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    await addChildren(listingId, tenantId);
    const before = await fixture.stateSnapshot();
    const application = await createDeleteApp("conditional-delete");
    application.setCleanupTarget(listingId);
    const response = await deleteListing(application.app, landlordId, listingId, 409);
    expect(response.body.error.code).toBe("CONCURRENT_MODIFICATION");
    expect(application.statements).toHaveLength(4);
    expect(await fixture.stateSnapshot()).toStrictEqual(before);
    expect(application.cleanupCalls).toHaveLength(0);
  });

  it("rolls back failure after ID capture and invokes no cleanup handoff", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const tenantId = await fixture.insertUser("TENANT", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    await addChildren(listingId, tenantId);
    const before = await fixture.stateSnapshot();
    const application = await createDeleteApp("delete-failure");
    application.setCleanupTarget(listingId);
    const response = await deleteListing(application.app, landlordId, listingId, 500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(application.statements).toHaveLength(4);
    expect(await fixture.stateSnapshot()).toStrictEqual(before);
    expect(application.cleanupCalls).toHaveLength(0);
  });

  it("keeps moderation history as a restrictive foreign-key backstop", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const adminId = await fixture.insertUser("ADMIN", ++sequence);
    const listingId = await insertListing(landlordId, "REJECTED");
    await fixture.pool.query({
      text: `INSERT INTO moderation_history (listing_id, admin_id, previous_status, new_status, reason) VALUES ($1, $2, 'PENDING', 'REJECTED', 'Retained reason')`,
      values: [listingId, adminId]
    });
    await fixture.pool.query({ text: `UPDATE listings SET status = 'DRAFT' WHERE id = $1`, values: [listingId] });
    await expect(
      fixture.pool.query({ text: `DELETE FROM listings WHERE id = $1`, values: [listingId] })
    ).rejects.toMatchObject({ code: "23503" });
    expect(await tableListingCount("listings", listingId)).toBe(1);
    expect(await tableListingCount("moderation_history", listingId)).toBe(1);
  });
});
