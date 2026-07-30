import dotenv from "dotenv";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { MigrationExecutionError } from "../src/db/migrations/types.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool();
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const temporaryDirectories: string[] = [];
const listingStatuses = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] as const;
const allowedModerationTransitions = new Set([
  "PENDING->APPROVED",
  "PENDING->REJECTED",
  "APPROVED->HIDDEN",
  "HIDDEN->APPROVED"
]);
let uniqueSequence = 0;

async function cleanDatabase(): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS rm007_committed_fixture");
  await pool.query("DROP TABLE IF EXISTS rm007_rolled_back_fixture");
  await pool.query("DROP TABLE IF EXISTS rm007_skipped_fixture");
  await pool.query("DROP TABLE IF EXISTS moderation_history");
  await pool.query("DROP TABLE IF EXISTS favorites");
  await pool.query("DROP TABLE IF EXISTS listing_amenities");
  await pool.query("DROP TABLE IF EXISTS listing_images");
  await pool.query("DROP TABLE IF EXISTS listings");
  await pool.query("DROP TABLE IF EXISTS amenities");
  await pool.query("DROP TABLE IF EXISTS property_types");
  await pool.query("DROP TABLE IF EXISTS users");
  await pool.query("DROP TYPE IF EXISTS listing_status");
  await pool.query("DROP TYPE IF EXISTS user_role");
}

async function migrateClean(): Promise<void> {
  const migrations = await discoverMigrations(migrationDirectory);
  await executeMigrationPlan(pool, createMigrationPlan("clean", migrations));
}

async function expectQueryFailure(sql: string, values: readonly unknown[] = []): Promise<void> {
  await expect(pool.query(sql, [...values])).rejects.toBeDefined();
}

async function createUser(role: "TENANT" | "LANDLORD" | "ADMIN"): Promise<number> {
  uniqueSequence += 1;
  const email = `rm007-${role.toLowerCase()}-${uniqueSequence}@example.com`;
  const phone = role === "LANDLORD" ? `+1415666${String(uniqueSequence).padStart(4, "0")}` : null;
  const result = await pool.query<{ id: number }>(
    `
      INSERT INTO users (role, email, phone_e164, password_hash)
      VALUES ($1, $2, $3, 'rm007-hash')
      RETURNING id
    `,
    [role, email, phone]
  );
  return result.rows[0]!.id;
}

async function createPropertyType(): Promise<number> {
  uniqueSequence += 1;
  const result = await pool.query<{ id: number }>(
    `
      INSERT INTO property_types (code, label)
      VALUES ($1, $2)
      RETURNING id
    `,
    [`RM007_TYPE_${uniqueSequence}`, `RM-007 type ${uniqueSequence}`]
  );
  return result.rows[0]!.id;
}

async function createCompleteListing(landlordId: number, status = "DRAFT"): Promise<number> {
  const propertyTypeId = await createPropertyType();
  uniqueSequence += 1;
  const result = await pool.query<{ id: number }>(
    `
      INSERT INTO listings (
        landlord_id,
        property_type_id,
        status,
        title,
        description,
        monthly_rent,
        room_area_sqm,
        address_text,
        area_name,
        latitude,
        longitude
      )
      VALUES ($1, $2, $3, $4, $5, 7500000, 28.50, '101 Test Street', 'Test Area', 10.772341, 106.697912)
      RETURNING id
    `,
    [landlordId, propertyTypeId, status, `RM-007 listing ${uniqueSequence}`, "Complete listing description"]
  );
  return result.rows[0]!.id;
}

async function createMinimalDraft(landlordId: number): Promise<number> {
  const result = await pool.query<{ id: number }>("INSERT INTO listings (landlord_id) VALUES ($1) RETURNING id", [
    landlordId
  ]);
  return result.rows[0]!.id;
}

async function insertModerationHistory(
  listingId: number,
  adminId: number,
  previousStatus: (typeof listingStatuses)[number],
  newStatus: (typeof listingStatuses)[number],
  reason: string | null
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `
      INSERT INTO moderation_history (listing_id, admin_id, previous_status, new_status, reason)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `,
    [listingId, adminId, previousStatus, newStatus, reason]
  );
  return result.rows[0]!.id;
}

beforeEach(async () => {
  uniqueSequence = 0;
  await cleanDatabase();
});

afterEach(async () => {
  await cleanDatabase();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

afterAll(async () => {
  await cleanDatabase();
  await pool.end();
});

describe("RM-007 PostgreSQL schema", () => {
  it("creates exactly two enums, eight tables, the frozen columns and constraints, and ten explicit indexes", async () => {
    await migrateClean();

    const enums = await pool.query<{ typeName: string }>(
      `
        SELECT DISTINCT type.typname AS "typeName"
        FROM pg_type AS type
        JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
        JOIN pg_enum AS enum_value ON enum_value.enumtypid = type.oid
        WHERE namespace.nspname = 'public'
        ORDER BY type.typname
      `
    );
    expect(enums.rows).toStrictEqual([{ typeName: "listing_status" }, { typeName: "user_role" }]);

    const tables = await pool.query<{ tableName: string }>(
      `
        SELECT tablename AS "tableName"
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `
    );
    expect(tables.rows).toStrictEqual([
      { tableName: "amenities" },
      { tableName: "favorites" },
      { tableName: "listing_amenities" },
      { tableName: "listing_images" },
      { tableName: "listings" },
      { tableName: "moderation_history" },
      { tableName: "property_types" },
      { tableName: "users" }
    ]);

    const columns = await pool.query<{ tableName: string; signature: string }>(
      `
        SELECT
          table_name AS "tableName",
          concat(
            ordinal_position, '|',
            column_name, '|',
            data_type, '|',
            udt_name, '|',
            coalesce(character_maximum_length::text, '-'), '|',
            is_nullable, '|',
            is_identity, '|',
            coalesce(identity_generation, '-'), '|',
            coalesce(column_default, '-')
          ) AS signature
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('favorites', 'moderation_history')
        ORDER BY table_name, ordinal_position
      `
    );
    expect(columns.rows).toStrictEqual([
      {
        tableName: "favorites",
        signature: "1|tenant_id|integer|int4|-|NO|NO|-|-"
      },
      {
        tableName: "favorites",
        signature: "2|listing_id|integer|int4|-|NO|NO|-|-"
      },
      {
        tableName: "favorites",
        signature: "3|created_at|timestamp with time zone|timestamptz|-|NO|NO|-|CURRENT_TIMESTAMP"
      },
      {
        tableName: "moderation_history",
        signature: "1|id|integer|int4|-|NO|YES|ALWAYS|-"
      },
      {
        tableName: "moderation_history",
        signature: "2|listing_id|integer|int4|-|NO|NO|-|-"
      },
      {
        tableName: "moderation_history",
        signature: "3|admin_id|integer|int4|-|NO|NO|-|-"
      },
      {
        tableName: "moderation_history",
        signature: "4|previous_status|USER-DEFINED|listing_status|-|NO|NO|-|-"
      },
      {
        tableName: "moderation_history",
        signature: "5|new_status|USER-DEFINED|listing_status|-|NO|NO|-|-"
      },
      {
        tableName: "moderation_history",
        signature: "6|reason|character varying|varchar|1000|YES|NO|-|-"
      },
      {
        tableName: "moderation_history",
        signature: "7|created_at|timestamp with time zone|timestamptz|-|NO|NO|-|CURRENT_TIMESTAMP"
      }
    ]);

    const constraints = await pool.query<{ tableName: string; constraintName: string; constraintType: string }>(
      `
        SELECT
          source_table.relname AS "tableName",
          constraint_record.conname AS "constraintName",
          constraint_record.contype AS "constraintType"
        FROM pg_constraint AS constraint_record
        JOIN pg_class AS source_table ON source_table.oid = constraint_record.conrelid
        JOIN pg_namespace AS namespace ON namespace.oid = source_table.relnamespace
        WHERE namespace.nspname = 'public'
          AND source_table.relname IN ('favorites', 'moderation_history')
        ORDER BY source_table.relname, constraint_record.conname
      `
    );
    expect(constraints.rows).toStrictEqual([
      { tableName: "favorites", constraintName: "fk_favorites_listing", constraintType: "f" },
      { tableName: "favorites", constraintName: "fk_favorites_tenant", constraintType: "f" },
      { tableName: "favorites", constraintName: "pk_favorites", constraintType: "p" },
      {
        tableName: "moderation_history",
        constraintName: "ck_moderation_history_reason_nonblank",
        constraintType: "c"
      },
      {
        tableName: "moderation_history",
        constraintName: "ck_moderation_history_reason_required",
        constraintType: "c"
      },
      {
        tableName: "moderation_history",
        constraintName: "ck_moderation_history_status_changed",
        constraintType: "c"
      },
      {
        tableName: "moderation_history",
        constraintName: "ck_moderation_history_transition",
        constraintType: "c"
      },
      { tableName: "moderation_history", constraintName: "fk_moderation_history_admin", constraintType: "f" },
      { tableName: "moderation_history", constraintName: "fk_moderation_history_listing", constraintType: "f" },
      { tableName: "moderation_history", constraintName: "pk_moderation_history", constraintType: "p" }
    ]);

    const primaryKeys = await pool.query<{ constraintName: string; definition: string }>(
      `
        SELECT conname AS "constraintName", pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname IN ('pk_favorites', 'pk_moderation_history')
        ORDER BY conname
      `
    );
    expect(primaryKeys.rows).toStrictEqual([
      { constraintName: "pk_favorites", definition: "PRIMARY KEY (tenant_id, listing_id)" },
      { constraintName: "pk_moderation_history", definition: "PRIMARY KEY (id)" }
    ]);

    const foreignKeys = await pool.query<{
      constraintName: string;
      sourceTable: string;
      parentTable: string;
      deleteAction: string;
      updateAction: string;
    }>(
      `
        SELECT
          constraint_record.conname AS "constraintName",
          source_table.relname AS "sourceTable",
          parent_table.relname AS "parentTable",
          constraint_record.confdeltype AS "deleteAction",
          constraint_record.confupdtype AS "updateAction"
        FROM pg_constraint AS constraint_record
        JOIN pg_class AS source_table ON source_table.oid = constraint_record.conrelid
        JOIN pg_class AS parent_table ON parent_table.oid = constraint_record.confrelid
        JOIN pg_namespace AS namespace ON namespace.oid = source_table.relnamespace
        WHERE namespace.nspname = 'public'
          AND constraint_record.contype = 'f'
          AND source_table.relname IN ('favorites', 'moderation_history')
        ORDER BY constraint_record.conname
      `
    );
    expect(foreignKeys.rows).toStrictEqual([
      {
        constraintName: "fk_favorites_listing",
        sourceTable: "favorites",
        parentTable: "listings",
        deleteAction: "c",
        updateAction: "r"
      },
      {
        constraintName: "fk_favorites_tenant",
        sourceTable: "favorites",
        parentTable: "users",
        deleteAction: "c",
        updateAction: "r"
      },
      {
        constraintName: "fk_moderation_history_admin",
        sourceTable: "moderation_history",
        parentTable: "users",
        deleteAction: "r",
        updateAction: "r"
      },
      {
        constraintName: "fk_moderation_history_listing",
        sourceTable: "moderation_history",
        parentTable: "listings",
        deleteAction: "r",
        updateAction: "r"
      }
    ]);

    const indexes = await pool.query<{
      indexName: string;
      tableName: string;
      unique: boolean;
      method: string;
      keyExpressions: string[];
      keyDirections: string[];
      attributeCount: number;
      keyCount: number;
      predicate: string | null;
    }>(
      `
        SELECT
          index_relation.relname AS "indexName",
          table_relation.relname AS "tableName",
          index_record.indisunique AS unique,
          access_method.amname AS method,
          ARRAY(
            SELECT pg_get_indexdef(index_record.indexrelid, position, true)
            FROM generate_series(1, index_record.indnkeyatts) AS position
          ) AS "keyExpressions",
          ARRAY(
            SELECT CASE
              WHEN (index_record.indoption[position - 1] & 1) = 1 THEN 'DESC'
              ELSE 'ASC'
            END
            FROM generate_series(1, index_record.indnkeyatts) AS position
          ) AS "keyDirections",
          index_record.indnatts::integer AS "attributeCount",
          index_record.indnkeyatts::integer AS "keyCount",
          pg_get_expr(index_record.indpred, index_record.indrelid) AS predicate
        FROM pg_index AS index_record
        JOIN pg_class AS index_relation ON index_relation.oid = index_record.indexrelid
        JOIN pg_class AS table_relation ON table_relation.oid = index_record.indrelid
        JOIN pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
        JOIN pg_am AS access_method ON access_method.oid = index_relation.relam
        WHERE namespace.nspname = 'public'
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint AS constraint_record
            WHERE constraint_record.conindid = index_record.indexrelid
          )
        ORDER BY index_relation.relname
      `
    );
    expect(
      indexes.rows.map(({ indexName, tableName, unique, method, keyExpressions, attributeCount, keyCount }) => ({
        indexName,
        tableName,
        unique,
        method,
        keyExpressions,
        attributeCount,
        keyCount
      }))
    ).toStrictEqual([
      {
        indexName: "idx_favorites_tenant_created_at",
        tableName: "favorites",
        unique: false,
        method: "btree",
        keyExpressions: ["tenant_id", "created_at", "listing_id"],
        attributeCount: 3,
        keyCount: 3
      },
      {
        indexName: "idx_listing_amenities_amenity_listing",
        tableName: "listing_amenities",
        unique: false,
        method: "btree",
        keyExpressions: ["amenity_id", "listing_id"],
        attributeCount: 2,
        keyCount: 2
      },
      {
        indexName: "idx_listings_approved_latitude",
        tableName: "listings",
        unique: false,
        method: "btree",
        keyExpressions: ["latitude", "id"],
        attributeCount: 2,
        keyCount: 2
      },
      {
        indexName: "idx_listings_approved_longitude",
        tableName: "listings",
        unique: false,
        method: "btree",
        keyExpressions: ["longitude", "id"],
        attributeCount: 2,
        keyCount: 2
      },
      {
        indexName: "idx_listings_approved_monthly_rent",
        tableName: "listings",
        unique: false,
        method: "btree",
        keyExpressions: ["monthly_rent", "id"],
        attributeCount: 2,
        keyCount: 2
      },
      {
        indexName: "idx_listings_approved_property_type",
        tableName: "listings",
        unique: false,
        method: "btree",
        keyExpressions: ["property_type_id", "id"],
        attributeCount: 2,
        keyCount: 2
      },
      {
        indexName: "idx_listings_approved_room_area",
        tableName: "listings",
        unique: false,
        method: "btree",
        keyExpressions: ["room_area_sqm", "id"],
        attributeCount: 2,
        keyCount: 2
      },
      {
        indexName: "idx_listings_landlord_updated_at",
        tableName: "listings",
        unique: false,
        method: "btree",
        keyExpressions: ["landlord_id", "updated_at", "id"],
        attributeCount: 3,
        keyCount: 3
      },
      {
        indexName: "idx_listings_status_updated_at",
        tableName: "listings",
        unique: false,
        method: "btree",
        keyExpressions: ["status", "updated_at", "id"],
        attributeCount: 3,
        keyCount: 3
      },
      {
        indexName: "idx_moderation_history_listing_created_at",
        tableName: "moderation_history",
        unique: false,
        method: "btree",
        keyExpressions: ["listing_id", "created_at", "id"],
        attributeCount: 3,
        keyCount: 3
      }
    ]);
    expect(
      Object.fromEntries(indexes.rows.map(({ indexName, keyDirections }) => [indexName, keyDirections]))
    ).toStrictEqual({
      idx_favorites_tenant_created_at: ["ASC", "DESC", "DESC"],
      idx_listing_amenities_amenity_listing: ["ASC", "ASC"],
      idx_listings_approved_latitude: ["ASC", "ASC"],
      idx_listings_approved_longitude: ["ASC", "ASC"],
      idx_listings_approved_monthly_rent: ["ASC", "ASC"],
      idx_listings_approved_property_type: ["ASC", "ASC"],
      idx_listings_approved_room_area: ["ASC", "ASC"],
      idx_listings_landlord_updated_at: ["ASC", "DESC", "DESC"],
      idx_listings_status_updated_at: ["ASC", "DESC", "DESC"],
      idx_moderation_history_listing_created_at: ["ASC", "DESC", "DESC"]
    });
    const partialIndexes = indexes.rows.filter(({ predicate }) => predicate !== null);
    expect(partialIndexes).toHaveLength(5);
    expect(partialIndexes.every(({ indexName }) => indexName.startsWith("idx_listings_approved_"))).toBe(true);
    expect(partialIndexes.every(({ predicate }) => predicate?.includes("'APPROVED'::listing_status"))).toBe(true);
    expect(partialIndexes.every(({ predicate }) => !predicate?.includes("is_active"))).toBe(true);
    expect(indexes.rows.every(({ attributeCount, keyCount }) => attributeCount === keyCount)).toBe(true);

    const prohibitedObjects = await pool.query<{
      triggerCount: number;
      procedureCount: number;
      bookkeepingTableCount: number;
      postgisExtensionCount: number;
      seededUserCount: number;
    }>(
      `
        SELECT
          (
            SELECT count(*)::integer
            FROM pg_trigger AS trigger_record
            JOIN pg_class AS relation ON relation.oid = trigger_record.tgrelid
            JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public' AND NOT trigger_record.tgisinternal
          ) AS "triggerCount",
          (
            SELECT count(*)::integer
            FROM pg_proc AS routine
            JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
            WHERE namespace.nspname = 'public' AND routine.prokind = 'p'
          ) AS "procedureCount",
          (
            SELECT count(*)::integer
            FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename IN ('schema_migrations', 'migration_history', 'knex_migrations')
          ) AS "bookkeepingTableCount",
          (
            SELECT count(*)::integer
            FROM pg_extension
            WHERE extname = 'postgis'
          ) AS "postgisExtensionCount",
          (SELECT count(*)::integer FROM users) AS "seededUserCount"
      `
    );
    expect(prohibitedObjects.rows).toStrictEqual([
      {
        triggerCount: 0,
        procedureCount: 0,
        bookkeepingTableCount: 0,
        postgisExtensionCount: 0,
        seededUserCount: 0
      }
    ]);
  });

  it("enforces favorite uniqueness and references while preserving rows across status and activity changes", async () => {
    await migrateClean();
    const landlordId = await createUser("LANDLORD");
    const firstTenantId = await createUser("TENANT");
    const secondTenantId = await createUser("TENANT");
    const firstListingId = await createCompleteListing(landlordId);
    const secondListingId = await createCompleteListing(landlordId);

    await pool.query(
      `
        INSERT INTO favorites (tenant_id, listing_id)
        VALUES ($1, $3), ($1, $4), ($2, $3), ($2, $4), ($5, $3)
      `,
      [firstTenantId, secondTenantId, firstListingId, secondListingId, landlordId]
    );
    await expectQueryFailure("INSERT INTO favorites (tenant_id, listing_id) VALUES ($1, $2)", [
      firstTenantId,
      firstListingId
    ]);
    await expectQueryFailure("INSERT INTO favorites (tenant_id, listing_id) VALUES (2147000000, $1)", [firstListingId]);
    await expectQueryFailure("INSERT INTO favorites (tenant_id, listing_id) VALUES ($1, 2147000000)", [firstTenantId]);

    await pool.query("UPDATE listings SET status = 'PENDING' WHERE id = $1", [firstListingId]);
    await pool.query("UPDATE users SET is_active = false WHERE id = $1", [landlordId]);
    await expectQueryFailure("UPDATE users SET id = id + 10000 WHERE id = $1", [firstTenantId]);
    await expectQueryFailure("UPDATE listings SET id = id + 10000 WHERE id = $1", [firstListingId]);

    const retained = await pool.query<{ count: number; defaultedTimestamps: number }>(
      `
        SELECT
          count(*)::integer AS count,
          count(created_at)::integer AS "defaultedTimestamps"
        FROM favorites
      `
    );
    expect(retained.rows).toStrictEqual([{ count: 5, defaultedTimestamps: 5 }]);

    await pool.query("DELETE FROM users WHERE id = $1", [firstTenantId]);
    await pool.query("DELETE FROM listings WHERE id = $1", [firstListingId]);
    const survivors = await pool.query<{ tenantId: number; listingId: number }>(
      `
        SELECT tenant_id AS "tenantId", listing_id AS "listingId"
        FROM favorites
        ORDER BY tenant_id, listing_id
      `
    );
    expect(survivors.rows).toStrictEqual([{ tenantId: secondTenantId, listingId: secondListingId }]);
  });

  it("keeps representative approved indexes usable for their predicates and orderings", async () => {
    await migrateClean();
    const client = await pool.connect();
    const cases = [
      {
        indexName: "idx_listings_status_updated_at",
        sql: `
          EXPLAIN
          SELECT id
          FROM listings
          WHERE status = 'PENDING'
          ORDER BY updated_at DESC, id DESC
        `
      },
      {
        indexName: "idx_listings_approved_monthly_rent",
        sql: `
          EXPLAIN
          SELECT id
          FROM listings
          WHERE status = 'APPROVED' AND monthly_rent >= 5000000
          ORDER BY monthly_rent, id
        `
      },
      {
        indexName: "idx_listing_amenities_amenity_listing",
        sql: `
          EXPLAIN
          SELECT listing_id
          FROM listing_amenities
          WHERE amenity_id = 1
          ORDER BY listing_id
        `
      },
      {
        indexName: "idx_favorites_tenant_created_at",
        sql: `
          EXPLAIN
          SELECT listing_id
          FROM favorites
          WHERE tenant_id = 1
          ORDER BY created_at DESC, listing_id DESC
        `
      },
      {
        indexName: "idx_moderation_history_listing_created_at",
        sql: `
          EXPLAIN
          SELECT id
          FROM moderation_history
          WHERE listing_id = 1
          ORDER BY created_at DESC, id DESC
        `
      }
    ] as const;

    try {
      await client.query("SET enable_seqscan = off");
      for (const verificationCase of cases) {
        const plan = await client.query<{ "QUERY PLAN": string }>(verificationCase.sql);
        expect(plan.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain(verificationCase.indexName);
      }
    } finally {
      client.release();
    }
  });

  it("allows exactly the four frozen moderation transitions across the full status matrix", async () => {
    await migrateClean();
    const landlordId = await createUser("LANDLORD");
    const adminId = await createUser("ADMIN");
    const nonAdminId = await createUser("TENANT");
    const listingId = await createMinimalDraft(landlordId);

    await insertModerationHistory(listingId, adminId, "PENDING", "APPROVED", null);
    await insertModerationHistory(listingId, adminId, "PENDING", "APPROVED", " optional approval context ");
    await insertModerationHistory(listingId, adminId, "PENDING", "REJECTED", "Not suitable");
    await insertModerationHistory(listingId, adminId, "APPROVED", "HIDDEN", "Policy violation");
    await insertModerationHistory(listingId, adminId, "HIDDEN", "APPROVED", null);
    await insertModerationHistory(listingId, nonAdminId, "HIDDEN", "APPROVED", " restored by referenced user ");

    let acceptedMatrixRows = 0;
    for (const previousStatus of listingStatuses) {
      for (const newStatus of listingStatuses) {
        const transition = `${previousStatus}->${newStatus}`;
        if (allowedModerationTransitions.has(transition)) {
          await insertModerationHistory(listingId, adminId, previousStatus, newStatus, "matrix reason");
          acceptedMatrixRows += 1;
        } else {
          await expect(
            insertModerationHistory(listingId, adminId, previousStatus, newStatus, "matrix reason")
          ).rejects.toBeDefined();
        }
      }
    }
    expect(acceptedMatrixRows).toBe(4);

    const count = await pool.query<{ count: number }>("SELECT count(*)::integer AS count FROM moderation_history");
    expect(count.rows).toStrictEqual([{ count: 10 }]);
  });

  it("enforces nonblank and conditionally required moderation reasons without trimming stored context", async () => {
    await migrateClean();
    const landlordId = await createUser("LANDLORD");
    const adminId = await createUser("ADMIN");
    const listingId = await createMinimalDraft(landlordId);

    for (const [previousStatus, newStatus] of [
      ["PENDING", "REJECTED"],
      ["APPROVED", "HIDDEN"]
    ] as const) {
      await expect(insertModerationHistory(listingId, adminId, previousStatus, newStatus, null)).rejects.toBeDefined();
      await expect(insertModerationHistory(listingId, adminId, previousStatus, newStatus, "")).rejects.toBeDefined();
      await expect(insertModerationHistory(listingId, adminId, previousStatus, newStatus, "   ")).rejects.toBeDefined();
    }

    await expect(insertModerationHistory(listingId, adminId, "PENDING", "APPROVED", "")).rejects.toBeDefined();
    await expect(insertModerationHistory(listingId, adminId, "HIDDEN", "APPROVED", "   ")).rejects.toBeDefined();
    await expect(
      insertModerationHistory(listingId, adminId, "PENDING", "REJECTED", "x".repeat(1001))
    ).rejects.toBeDefined();

    await insertModerationHistory(listingId, adminId, "PENDING", "APPROVED", null);
    await insertModerationHistory(listingId, adminId, "HIDDEN", "APPROVED", null);
    await insertModerationHistory(listingId, adminId, "PENDING", "REJECTED", "x".repeat(1000));
    await insertModerationHistory(listingId, adminId, "APPROVED", "HIDDEN", " retained surrounding context ");

    const reasons = await pool.query<{ reason: string | null }>("SELECT reason FROM moderation_history ORDER BY id");
    expect(reasons.rows).toStrictEqual([
      { reason: null },
      { reason: null },
      { reason: "x".repeat(1000) },
      { reason: " retained surrounding context " }
    ]);
  });

  it("makes moderation history append-only through restrictive references and keeps favorite deletion independent", async () => {
    await migrateClean();
    const landlordId = await createUser("LANDLORD");
    const adminId = await createUser("ADMIN");
    const nonAdminId = await createUser("TENANT");
    const listingWithoutHistoryId = await createMinimalDraft(landlordId);
    const listingWithHistoryId = await createMinimalDraft(landlordId);

    await pool.query("INSERT INTO favorites (tenant_id, listing_id) VALUES ($1, $2), ($1, $3)", [
      nonAdminId,
      listingWithoutHistoryId,
      listingWithHistoryId
    ]);
    await expect(insertModerationHistory(2_147_000_000, adminId, "PENDING", "APPROVED", null)).rejects.toBeDefined();
    await expect(
      insertModerationHistory(listingWithHistoryId, 2_147_000_000, "PENDING", "APPROVED", null)
    ).rejects.toBeDefined();
    await insertModerationHistory(listingWithHistoryId, nonAdminId, "PENDING", "APPROVED", null);

    await pool.query("DELETE FROM listings WHERE id = $1", [listingWithoutHistoryId]);
    await expectQueryFailure("DELETE FROM listings WHERE id = $1", [listingWithHistoryId]);
    await expectQueryFailure("UPDATE listings SET id = id + 10000 WHERE id = $1", [listingWithHistoryId]);
    await expectQueryFailure("DELETE FROM users WHERE id = $1", [nonAdminId]);
    await expectQueryFailure("UPDATE users SET id = id + 10000 WHERE id = $1", [nonAdminId]);

    const retained = await pool.query<{ listingCount: number; favoriteCount: number; historyCount: number }>(
      `
        SELECT
          (SELECT count(*)::integer FROM listings) AS "listingCount",
          (SELECT count(*)::integer FROM favorites) AS "favoriteCount",
          (SELECT count(*)::integer FROM moderation_history) AS "historyCount"
      `
    );
    expect(retained.rows).toStrictEqual([{ listingCount: 1, favoriteCount: 1, historyCount: 1 }]);
  });

  it("upgrades an externally versioned deployment from 0009 and selects no already-applied migration", async () => {
    const migrations = await discoverMigrations(migrationDirectory);
    const priorMigrations = migrations.filter(({ version }) => version <= 9);
    await executeMigrationPlan(pool, createMigrationPlan("clean", priorMigrations));

    const upgradePlan = createMigrationPlan("existing", migrations, { appliedVersion: 9 });
    expect(upgradePlan.migrations.map(({ version }) => version)).toStrictEqual([10, 11, 12]);
    await executeMigrationPlan(pool, upgradePlan);

    expect(
      createMigrationPlan("existing", migrations, { appliedVersion: 10 }).migrations.map(({ version }) => version)
    ).toStrictEqual([11, 12]);
    expect(
      createMigrationPlan("existing", migrations, { appliedVersion: 11 }).migrations.map(({ version }) => version)
    ).toStrictEqual([12]);
    expect(createMigrationPlan("existing", migrations, { appliedVersion: 12 }).migrations).toStrictEqual([]);

    const catalog = await pool.query<{ tableCount: number; explicitIndexCount: number; bookkeepingTableCount: number }>(
      `
        SELECT
          (
            SELECT count(*)::integer
            FROM pg_tables
            WHERE schemaname = 'public'
          ) AS "tableCount",
          (
            SELECT count(*)::integer
            FROM pg_index AS index_record
            JOIN pg_class AS table_relation ON table_relation.oid = index_record.indrelid
            JOIN pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND NOT EXISTS (
                SELECT 1
                FROM pg_constraint AS constraint_record
                WHERE constraint_record.conindid = index_record.indexrelid
              )
          ) AS "explicitIndexCount",
          (
            SELECT count(*)::integer
            FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename IN ('schema_migrations', 'migration_history', 'knex_migrations')
          ) AS "bookkeepingTableCount"
      `
    );
    expect(catalog.rows).toStrictEqual([{ tableCount: 8, explicitIndexCount: 10, bookkeepingTableCount: 0 }]);
  });

  it("rolls back an RM-007-shaped failed file, preserves prior commits, skips later files, and releases clients", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "rentmate-rm007-rollback-"));
    temporaryDirectories.push(directory);
    await writeFile(
      path.join(directory, "0001_create_committed_fixture.sql"),
      "CREATE TABLE rm007_committed_fixture (id integer PRIMARY KEY);",
      "utf8"
    );
    await writeFile(
      path.join(directory, "0002_create_favorite_index_then_fail.sql"),
      `
        CREATE TABLE rm007_rolled_back_fixture (
          tenant_id integer NOT NULL,
          listing_id integer NOT NULL,
          created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tenant_id, listing_id)
        );
        CREATE INDEX idx_rm007_rolled_back_fixture
          ON rm007_rolled_back_fixture (tenant_id, created_at DESC, listing_id DESC);
        SELECT * FROM rm007_deliberately_missing_relation;
      `,
      "utf8"
    );
    await writeFile(
      path.join(directory, "0003_create_skipped_fixture.sql"),
      "CREATE TABLE rm007_skipped_fixture (id integer PRIMARY KEY);",
      "utf8"
    );

    let failure: MigrationExecutionError | undefined;
    try {
      await executeMigrationPlan(pool, createMigrationPlan("clean", await discoverMigrations(directory)));
    } catch (error) {
      if (error instanceof MigrationExecutionError) {
        failure = error;
      } else {
        throw error;
      }
    }

    expect(failure?.failedMigration).toMatchObject({
      version: 2,
      filename: "0002_create_favorite_index_then_fail.sql"
    });
    expect(failure?.lastSuccessfulMigration).toMatchObject({
      version: 1,
      filename: "0001_create_committed_fixture.sql"
    });
    expect(failure?.message).not.toContain("rm007_deliberately_missing_relation");
    expect(failure?.message).not.toContain("postgresql://");

    const relations = await pool.query<{ name: string; relation: string | null }>(
      `
        SELECT requested.name, to_regclass('public.' || requested.name)::text AS relation
        FROM unnest($1::text[]) AS requested(name)
        ORDER BY requested.name
      `,
      [["rm007_committed_fixture", "rm007_rolled_back_fixture", "rm007_skipped_fixture"]]
    );
    expect(relations.rows).toStrictEqual([
      { name: "rm007_committed_fixture", relation: "rm007_committed_fixture" },
      { name: "rm007_rolled_back_fixture", relation: null },
      { name: "rm007_skipped_fixture", relation: null }
    ]);
    expect(pool.waitingCount).toBe(0);
    expect(pool.idleCount).toBe(pool.totalCount);
  });
});
