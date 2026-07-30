import dotenv from "dotenv";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PoolClient } from "pg";
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
const nonDraftStatuses = ["PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] as const;
let uniqueSequence = 0;

interface ListingInput {
  readonly landlordId: number | null;
  readonly propertyTypeId: number | null;
  readonly status: (typeof nonDraftStatuses)[number] | "DRAFT" | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly monthlyRent: string | number | null;
  readonly roomAreaSqm: string | number | null;
  readonly addressText: string | null;
  readonly areaName: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

interface ImageInput {
  readonly listingId: number;
  readonly publicId: string;
  readonly secureUrl: string;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly displayOrder: number;
  readonly altText: string | null;
}

async function cleanDatabase(): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS rm006_committed_fixture");
  await pool.query("DROP TABLE IF EXISTS rm006_rolled_back_fixture");
  await pool.query("DROP TABLE IF EXISTS rm006_skipped_fixture");
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

async function createUser(role: "TENANT" | "LANDLORD" | "ADMIN" = "LANDLORD"): Promise<number> {
  uniqueSequence += 1;
  const email = `rm006-${role.toLowerCase()}-${uniqueSequence}@example.com`;
  const phone = role === "LANDLORD" ? `+1415555${String(uniqueSequence).padStart(4, "0")}` : null;
  const result = await pool.query<{ id: number }>(
    `
      INSERT INTO users (role, email, phone_e164, password_hash)
      VALUES ($1, $2, $3, 'rm006-hash')
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
    [`RM006_TYPE_${uniqueSequence}`, `RM006 type ${uniqueSequence}`]
  );
  return result.rows[0]!.id;
}

async function createAmenity(): Promise<number> {
  uniqueSequence += 1;
  const result = await pool.query<{ id: number }>(
    `
      INSERT INTO amenities (code, label)
      VALUES ($1, $2)
      RETURNING id
    `,
    [`RM006_AMENITY_${uniqueSequence}`, `RM006 amenity ${uniqueSequence}`]
  );
  return result.rows[0]!.id;
}

function completeListing(landlordId: number, propertyTypeId: number): ListingInput {
  return {
    landlordId,
    propertyTypeId,
    status: "DRAFT",
    title: "Complete RM-006 listing",
    description: "Complete listing description",
    monthlyRent: 7_500_000,
    roomAreaSqm: "28.50",
    addressText: "101 Test Street",
    areaName: "Test Area",
    latitude: 10.772341,
    longitude: 106.697912
  };
}

async function insertListing(input: ListingInput): Promise<number> {
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `,
    [
      input.landlordId,
      input.propertyTypeId,
      input.status,
      input.title,
      input.description,
      input.monthlyRent,
      input.roomAreaSqm,
      input.addressText,
      input.areaName,
      input.latitude,
      input.longitude
    ]
  );
  return result.rows[0]!.id;
}

async function insertMinimalDraft(landlordId: number): Promise<number> {
  const result = await pool.query<{ id: number }>("INSERT INTO listings (landlord_id) VALUES ($1) RETURNING id", [
    landlordId
  ]);
  return result.rows[0]!.id;
}

function validImage(listingId: number, displayOrder: number, publicId?: string): ImageInput {
  uniqueSequence += 1;
  return {
    listingId,
    publicId: publicId ?? `rm006/image-${uniqueSequence}`,
    secureUrl: `https://example.com/rm006-image-${uniqueSequence}.webp`,
    format: "webp",
    width: 1600,
    height: 1200,
    byteSize: 384_210,
    displayOrder,
    altText: null
  };
}

async function insertImage(input: ImageInput): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `
      INSERT INTO listing_images (
        listing_id,
        cloudinary_public_id,
        secure_url,
        format,
        width,
        height,
        byte_size,
        display_order,
        alt_text
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `,
    [
      input.listingId,
      input.publicId,
      input.secureUrl,
      input.format,
      input.width,
      input.height,
      input.byteSize,
      input.displayOrder,
      input.altText
    ]
  );
  return result.rows[0]!.id;
}

async function expectImageFailure(input: ImageInput): Promise<void> {
  await expect(
    pool.query(
      `
        INSERT INTO listing_images (
          listing_id,
          cloudinary_public_id,
          secure_url,
          format,
          width,
          height,
          byte_size,
          display_order,
          alt_text
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        input.listingId,
        input.publicId,
        input.secureUrl,
        input.format,
        input.width,
        input.height,
        input.byteSize,
        input.displayOrder,
        input.altText
      ]
    )
  ).rejects.toBeDefined();
}

async function rollbackAndRelease(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
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

describe("RM-006 PostgreSQL schema", () => {
  it("creates the exact six-table inventory, columns, constraints, foreign keys, and allowed indexes", async () => {
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
      { tableName: "listing_amenities" },
      { tableName: "listing_images" },
      { tableName: "listings" },
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
            CASE
              WHEN data_type = 'numeric' THEN concat(numeric_precision, ',', numeric_scale)
              ELSE '-'
            END, '|',
            is_nullable, '|',
            is_identity, '|',
            coalesce(identity_generation, '-'), '|',
            coalesce(column_default, '-')
          ) AS signature
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('listings', 'listing_images', 'listing_amenities')
        ORDER BY table_name, ordinal_position
      `
    );
    expect(columns.rows).toStrictEqual([
      {
        tableName: "listing_amenities",
        signature: "1|listing_id|integer|int4|-|-|NO|NO|-|-"
      },
      {
        tableName: "listing_amenities",
        signature: "2|amenity_id|smallint|int2|-|-|NO|NO|-|-"
      },
      {
        tableName: "listing_images",
        signature: "1|id|integer|int4|-|-|NO|YES|ALWAYS|-"
      },
      {
        tableName: "listing_images",
        signature: "2|listing_id|integer|int4|-|-|NO|NO|-|-"
      },
      {
        tableName: "listing_images",
        signature: "3|cloudinary_public_id|character varying|varchar|255|-|NO|NO|-|-"
      },
      {
        tableName: "listing_images",
        signature: "4|secure_url|character varying|varchar|2048|-|NO|NO|-|-"
      },
      {
        tableName: "listing_images",
        signature: "5|format|character varying|varchar|16|-|NO|NO|-|-"
      },
      {
        tableName: "listing_images",
        signature: "6|width|integer|int4|-|-|NO|NO|-|-"
      },
      {
        tableName: "listing_images",
        signature: "7|height|integer|int4|-|-|NO|NO|-|-"
      },
      {
        tableName: "listing_images",
        signature: "8|byte_size|integer|int4|-|-|NO|NO|-|-"
      },
      {
        tableName: "listing_images",
        signature: "9|display_order|smallint|int2|-|-|NO|NO|-|-"
      },
      {
        tableName: "listing_images",
        signature: "10|alt_text|character varying|varchar|255|-|YES|NO|-|-"
      },
      {
        tableName: "listing_images",
        signature: "11|created_at|timestamp with time zone|timestamptz|-|-|NO|NO|-|CURRENT_TIMESTAMP"
      },
      {
        tableName: "listings",
        signature: "1|id|integer|int4|-|-|NO|YES|ALWAYS|-"
      },
      {
        tableName: "listings",
        signature: "2|landlord_id|integer|int4|-|-|NO|NO|-|-"
      },
      {
        tableName: "listings",
        signature: "3|property_type_id|smallint|int2|-|-|YES|NO|-|-"
      },
      {
        tableName: "listings",
        signature: "4|status|USER-DEFINED|listing_status|-|-|NO|NO|-|'DRAFT'::listing_status"
      },
      {
        tableName: "listings",
        signature: "5|title|character varying|varchar|160|-|YES|NO|-|-"
      },
      {
        tableName: "listings",
        signature: "6|description|text|text|-|-|YES|NO|-|-"
      },
      {
        tableName: "listings",
        signature: "7|monthly_rent|numeric|numeric|-|12,0|YES|NO|-|-"
      },
      {
        tableName: "listings",
        signature: "8|room_area_sqm|numeric|numeric|-|8,2|YES|NO|-|-"
      },
      {
        tableName: "listings",
        signature: "9|address_text|character varying|varchar|500|-|YES|NO|-|-"
      },
      {
        tableName: "listings",
        signature: "10|area_name|character varying|varchar|120|-|YES|NO|-|-"
      },
      {
        tableName: "listings",
        signature: "11|latitude|double precision|float8|-|-|YES|NO|-|-"
      },
      {
        tableName: "listings",
        signature: "12|longitude|double precision|float8|-|-|YES|NO|-|-"
      },
      {
        tableName: "listings",
        signature: "13|created_at|timestamp with time zone|timestamptz|-|-|NO|NO|-|CURRENT_TIMESTAMP"
      },
      {
        tableName: "listings",
        signature: "14|updated_at|timestamp with time zone|timestamptz|-|-|NO|NO|-|CURRENT_TIMESTAMP"
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
          AND source_table.relname IN ('listings', 'listing_images', 'listing_amenities')
        ORDER BY source_table.relname, constraint_record.conname
      `
    );
    expect(constraints.rows).toStrictEqual([
      {
        tableName: "listing_amenities",
        constraintName: "fk_listing_amenities_amenity",
        constraintType: "f"
      },
      {
        tableName: "listing_amenities",
        constraintName: "fk_listing_amenities_listing",
        constraintType: "f"
      },
      {
        tableName: "listing_amenities",
        constraintName: "pk_listing_amenities",
        constraintType: "p"
      },
      {
        tableName: "listing_images",
        constraintName: "ck_listing_images_alt_text",
        constraintType: "c"
      },
      {
        tableName: "listing_images",
        constraintName: "ck_listing_images_byte_size",
        constraintType: "c"
      },
      {
        tableName: "listing_images",
        constraintName: "ck_listing_images_dimensions",
        constraintType: "c"
      },
      {
        tableName: "listing_images",
        constraintName: "ck_listing_images_display_order",
        constraintType: "c"
      },
      {
        tableName: "listing_images",
        constraintName: "ck_listing_images_format",
        constraintType: "c"
      },
      {
        tableName: "listing_images",
        constraintName: "ck_listing_images_public_id",
        constraintType: "c"
      },
      {
        tableName: "listing_images",
        constraintName: "ck_listing_images_secure_url",
        constraintType: "c"
      },
      {
        tableName: "listing_images",
        constraintName: "fk_listing_images_listing",
        constraintType: "f"
      },
      {
        tableName: "listing_images",
        constraintName: "pk_listing_images",
        constraintType: "p"
      },
      {
        tableName: "listing_images",
        constraintName: "uq_listing_images_cloudinary_public_id",
        constraintType: "u"
      },
      {
        tableName: "listing_images",
        constraintName: "uq_listing_images_listing_display_order",
        constraintType: "u"
      },
      {
        tableName: "listings",
        constraintName: "ck_listings_address_text",
        constraintType: "c"
      },
      {
        tableName: "listings",
        constraintName: "ck_listings_area_name",
        constraintType: "c"
      },
      {
        tableName: "listings",
        constraintName: "ck_listings_coordinate_pair",
        constraintType: "c"
      },
      {
        tableName: "listings",
        constraintName: "ck_listings_description",
        constraintType: "c"
      },
      {
        tableName: "listings",
        constraintName: "ck_listings_latitude",
        constraintType: "c"
      },
      {
        tableName: "listings",
        constraintName: "ck_listings_longitude",
        constraintType: "c"
      },
      {
        tableName: "listings",
        constraintName: "ck_listings_monthly_rent",
        constraintType: "c"
      },
      {
        tableName: "listings",
        constraintName: "ck_listings_non_draft_complete",
        constraintType: "c"
      },
      {
        tableName: "listings",
        constraintName: "ck_listings_room_area",
        constraintType: "c"
      },
      {
        tableName: "listings",
        constraintName: "ck_listings_title",
        constraintType: "c"
      },
      {
        tableName: "listings",
        constraintName: "fk_listings_landlord",
        constraintType: "f"
      },
      {
        tableName: "listings",
        constraintName: "fk_listings_property_type",
        constraintType: "f"
      },
      {
        tableName: "listings",
        constraintName: "pk_listings",
        constraintType: "p"
      }
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
          AND source_table.relname IN ('listings', 'listing_images', 'listing_amenities')
        ORDER BY constraint_record.conname
      `
    );
    expect(foreignKeys.rows).toStrictEqual([
      {
        constraintName: "fk_listing_amenities_amenity",
        sourceTable: "listing_amenities",
        parentTable: "amenities",
        deleteAction: "r",
        updateAction: "r"
      },
      {
        constraintName: "fk_listing_amenities_listing",
        sourceTable: "listing_amenities",
        parentTable: "listings",
        deleteAction: "c",
        updateAction: "r"
      },
      {
        constraintName: "fk_listing_images_listing",
        sourceTable: "listing_images",
        parentTable: "listings",
        deleteAction: "c",
        updateAction: "r"
      },
      {
        constraintName: "fk_listings_landlord",
        sourceTable: "listings",
        parentTable: "users",
        deleteAction: "r",
        updateAction: "r"
      },
      {
        constraintName: "fk_listings_property_type",
        sourceTable: "listings",
        parentTable: "property_types",
        deleteAction: "r",
        updateAction: "r"
      }
    ]);

    const imageOrderConstraint = await pool.query<{
      deferrable: boolean;
      deferred: boolean;
      definition: string;
    }>(
      `
        SELECT
          condeferrable AS deferrable,
          condeferred AS deferred,
          pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname = 'uq_listing_images_listing_display_order'
      `
    );
    expect(imageOrderConstraint.rows).toStrictEqual([
      {
        deferrable: true,
        deferred: false,
        definition: "UNIQUE (listing_id, display_order) DEFERRABLE"
      }
    ]);

    const keyDefinitions = await pool.query<{ constraintName: string; definition: string }>(
      `
        SELECT conname AS "constraintName", pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname IN (
          'pk_listing_amenities',
          'uq_listing_images_cloudinary_public_id',
          'uq_listing_images_listing_display_order'
        )
        ORDER BY conname
      `
    );
    expect(keyDefinitions.rows).toStrictEqual([
      {
        constraintName: "pk_listing_amenities",
        definition: "PRIMARY KEY (listing_id, amenity_id)"
      },
      {
        constraintName: "uq_listing_images_cloudinary_public_id",
        definition: "UNIQUE (cloudinary_public_id)"
      },
      {
        constraintName: "uq_listing_images_listing_display_order",
        definition: "UNIQUE (listing_id, display_order) DEFERRABLE"
      }
    ]);

    const nonConstraintIndexes = await pool.query<{ indexName: string }>(
      `
        SELECT index_table.relname AS "indexName"
        FROM pg_index AS index_record
        JOIN pg_class AS index_table ON index_table.oid = index_record.indexrelid
        JOIN pg_class AS source_table ON source_table.oid = index_record.indrelid
        JOIN pg_namespace AS namespace ON namespace.oid = source_table.relnamespace
        WHERE namespace.nspname = 'public'
          AND source_table.relname IN (
            'users',
            'property_types',
            'amenities',
            'listings',
            'listing_images',
            'listing_amenities'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint AS constraint_record
            WHERE constraint_record.conindid = index_record.indexrelid
          )
      `
    );
    expect(nonConstraintIndexes.rows).toStrictEqual([]);

    const forbiddenObjects = await pool.query<{ objectCount: number }>(
      `
        SELECT (
          (SELECT count(*) FROM pg_tables
            WHERE schemaname = 'public'
              AND (
                tablename IN ('favorites', 'moderation_history', 'sessions', 'refresh_tokens')
                OR tablename ~* 'migration'
              ))
          +
          (SELECT count(*) FROM pg_trigger
            WHERE NOT tgisinternal
              AND tgrelid IN ('listings'::regclass, 'listing_images'::regclass, 'listing_amenities'::regclass))
          +
          (SELECT count(*) FROM pg_extension WHERE extname = 'postgis')
        )::integer AS "objectCount"
      `
    );
    expect(forbiddenObjects.rows).toStrictEqual([{ objectCount: 0 }]);
  });

  it("accepts progressive drafts for every existing user role and valid partial values", async () => {
    await migrateClean();
    const landlordId = await createUser("LANDLORD");
    const tenantId = await createUser("TENANT");
    const adminId = await createUser("ADMIN");
    const propertyTypeId = await createPropertyType();

    const minimalDraftIds = await Promise.all([
      insertMinimalDraft(landlordId),
      insertMinimalDraft(tenantId),
      insertMinimalDraft(adminId)
    ]);
    const typedDraftId = await insertListing({
      ...completeListing(landlordId, propertyTypeId),
      status: "DRAFT",
      title: null,
      description: null,
      monthlyRent: null,
      roomAreaSqm: null,
      addressText: null,
      areaName: null,
      latitude: null,
      longitude: null
    });
    const partialDraftId = await insertListing({
      ...completeListing(landlordId, propertyTypeId),
      propertyTypeId: null,
      description: " description may retain surrounding whitespace ",
      addressText: null,
      areaName: null,
      latitude: null,
      longitude: null
    });
    const coordinateDraftId = await insertListing({
      ...completeListing(landlordId, propertyTypeId),
      propertyTypeId: null,
      title: null,
      description: null,
      monthlyRent: null,
      roomAreaSqm: null,
      addressText: null,
      areaName: null
    });
    const completeDraftId = await insertListing(completeListing(landlordId, propertyTypeId));

    const rows = await pool.query<{ id: number; status: string }>("SELECT id, status FROM listings ORDER BY id");
    expect(rows.rows.map(({ id }) => id)).toStrictEqual([
      ...minimalDraftIds,
      typedDraftId,
      partialDraftId,
      coordinateDraftId,
      completeDraftId
    ]);
    expect(rows.rows.every(({ status }) => status === "DRAFT")).toBe(true);
  });

  it("rejects every frozen invalid listing value without strengthening description trimming", async () => {
    await migrateClean();
    const landlordId = await createUser("LANDLORD");
    const propertyTypeId = await createPropertyType();
    const base = completeListing(landlordId, propertyTypeId);

    await insertListing({ ...base, description: " valid with surrounding whitespace " });

    const invalidInputs: ListingInput[] = [
      { ...base, landlordId: null },
      { ...base, landlordId: 2_147_000_000 },
      { ...base, propertyTypeId: 32_000 },
      { ...base, title: "" },
      { ...base, title: "   " },
      { ...base, title: " leading" },
      { ...base, title: "trailing " },
      { ...base, description: "" },
      { ...base, description: "   " },
      { ...base, description: "x".repeat(5001) },
      { ...base, monthlyRent: 0 },
      { ...base, monthlyRent: -1 },
      { ...base, roomAreaSqm: 0 },
      { ...base, roomAreaSqm: -1 },
      { ...base, addressText: "" },
      { ...base, addressText: "   " },
      { ...base, addressText: " leading" },
      { ...base, addressText: "trailing " },
      { ...base, areaName: "" },
      { ...base, areaName: "   " },
      { ...base, areaName: " leading" },
      { ...base, areaName: "trailing " },
      { ...base, latitude: -90.000001 },
      { ...base, latitude: 90.000001 },
      { ...base, longitude: -180.000001 },
      { ...base, longitude: 180.000001 },
      { ...base, longitude: null },
      { ...base, latitude: null },
      { ...base, status: null }
    ];

    for (const input of invalidInputs) {
      await expect(insertListing(input)).rejects.toBeDefined();
    }
  });

  it("requires every scalar field for every non-draft status but no amenity, image, or transition history", async () => {
    await migrateClean();
    const landlordId = await createUser("LANDLORD");
    const propertyTypeId = await createPropertyType();
    const requiredFields = [
      "propertyTypeId",
      "title",
      "description",
      "monthlyRent",
      "roomAreaSqm",
      "addressText",
      "areaName",
      "latitude",
      "longitude"
    ] as const;

    for (const status of nonDraftStatuses) {
      const complete = { ...completeListing(landlordId, propertyTypeId), status };
      await insertListing(complete);

      for (const field of requiredFields) {
        await expect(insertListing({ ...complete, [field]: null })).rejects.toBeDefined();
      }
    }

    const directTransitionId = await insertListing(completeListing(landlordId, propertyTypeId));
    await pool.query("UPDATE listings SET status = 'APPROVED' WHERE id = $1", [directTransitionId]);
    await pool.query("UPDATE listings SET status = 'HIDDEN' WHERE id = $1", [directTransitionId]);

    const childCounts = await pool.query<{ imageCount: number; amenityCount: number }>(
      `
        SELECT
          (SELECT count(*)::integer FROM listing_images) AS "imageCount",
          (SELECT count(*)::integer FROM listing_amenities) AS "amenityCount"
      `
    );
    expect(childCounts.rows).toStrictEqual([{ imageCount: 0, amenityCount: 0 }]);
  });

  it("restricts listing parent deletion and key updates while allowing property-type retirement", async () => {
    await migrateClean();
    const landlordId = await createUser("LANDLORD");
    const propertyTypeId = await createPropertyType();
    await insertListing(completeListing(landlordId, propertyTypeId));

    await expectQueryFailure("DELETE FROM users WHERE id = $1", [landlordId]);
    await expectQueryFailure("UPDATE users SET id = id + 10000 WHERE id = $1", [landlordId]);
    await expectQueryFailure("DELETE FROM property_types WHERE id = $1", [propertyTypeId]);
    await expectQueryFailure("UPDATE property_types SET id = id + 1000 WHERE id = $1", [propertyTypeId]);

    await pool.query("UPDATE property_types SET is_active = false WHERE id = $1", [propertyTypeId]);
    const retained = await pool.query<{ isActive: boolean; references: number }>(
      `
        SELECT
          property_type.is_active AS "isActive",
          count(listing.id)::integer AS references
        FROM property_types AS property_type
        JOIN listings AS listing ON listing.property_type_id = property_type.id
        WHERE property_type.id = $1
        GROUP BY property_type.is_active
      `,
      [propertyTypeId]
    );
    expect(retained.rows).toStrictEqual([{ isActive: false, references: 1 }]);
  });

  it("accepts valid image metadata and rejects every frozen invalid image value", async () => {
    await migrateClean();
    const landlordId = await createUser("LANDLORD");
    const listingId = await insertMinimalDraft(landlordId);
    const otherListingId = await insertMinimalDraft(landlordId);

    await insertImage({ ...validImage(listingId, 1), byteSize: 1, altText: null });
    await insertImage({ ...validImage(listingId, 3), altText: " meaningful alt text " });
    await insertImage({ ...validImage(listingId, 8), byteSize: 5_242_880 });
    const duplicatePublicId = "rm006/globally-unique";
    await insertImage(validImage(otherListingId, 1, duplicatePublicId));

    const invalidImages: ImageInput[] = [
      validImage(2_147_000_000, 1),
      { ...validImage(otherListingId, 2), publicId: "" },
      { ...validImage(otherListingId, 2), publicId: "   " },
      { ...validImage(otherListingId, 2), publicId: " leading" },
      { ...validImage(otherListingId, 2), publicId: "trailing " },
      validImage(listingId, 2, duplicatePublicId),
      { ...validImage(otherListingId, 2), secureUrl: "http://example.com/image.webp" },
      { ...validImage(otherListingId, 2), format: "" },
      { ...validImage(otherListingId, 2), format: "   " },
      { ...validImage(otherListingId, 2), format: "WEBP" },
      { ...validImage(otherListingId, 2), format: " webp" },
      { ...validImage(otherListingId, 2), format: "webp " },
      { ...validImage(otherListingId, 2), width: 0 },
      { ...validImage(otherListingId, 2), width: -1 },
      { ...validImage(otherListingId, 2), height: 0 },
      { ...validImage(otherListingId, 2), height: -1 },
      { ...validImage(otherListingId, 2), byteSize: 0 },
      { ...validImage(otherListingId, 2), byteSize: 5_242_881 },
      { ...validImage(otherListingId, 0) },
      { ...validImage(otherListingId, 9) },
      validImage(listingId, 1),
      { ...validImage(otherListingId, 2), altText: "" },
      { ...validImage(otherListingId, 2), altText: "   " }
    ];

    for (const image of invalidImages) {
      await expectImageFailure(image);
    }

    const orders = await pool.query<{ displayOrder: number }>(
      `
        SELECT display_order AS "displayOrder"
        FROM listing_images
        WHERE listing_id = $1
        ORDER BY display_order
      `,
      [listingId]
    );
    expect(orders.rows).toStrictEqual([{ displayOrder: 1 }, { displayOrder: 3 }, { displayOrder: 8 }]);
  });

  it("enforces exactly eight available image slots while allowing gaps and zero images", async () => {
    await migrateClean();
    const landlordId = await createUser("LANDLORD");
    const propertyTypeId = await createPropertyType();
    const listingId = await insertMinimalDraft(landlordId);
    const emptyNonDraftId = await insertListing({
      ...completeListing(landlordId, propertyTypeId),
      status: "PENDING"
    });

    for (let order = 1; order <= 8; order += 1) {
      await insertImage(validImage(listingId, order));
    }

    await expectImageFailure(validImage(listingId, 8));
    await expectImageFailure(validImage(listingId, 9));

    const counts = await pool.query<{ fullCount: number; emptyCount: number }>(
      `
        SELECT
          count(*) FILTER (WHERE listing_id = $1)::integer AS "fullCount",
          count(*) FILTER (WHERE listing_id = $2)::integer AS "emptyCount"
        FROM listing_images
      `,
      [listingId, emptyNonDraftId]
    );
    expect(counts.rows).toStrictEqual([{ fullCount: 8, emptyCount: 0 }]);
  });

  it("keeps image order initially immediate and supports explicit deferred swaps only with a valid final order", async () => {
    await migrateClean();
    const landlordId = await createUser("LANDLORD");
    const listingId = await insertMinimalDraft(landlordId);
    const firstId = await insertImage(validImage(listingId, 1));
    const secondId = await insertImage(validImage(listingId, 2));

    const immediateClient = await pool.connect();
    await immediateClient.query("BEGIN");
    await expect(
      immediateClient.query("UPDATE listing_images SET display_order = 2 WHERE id = $1", [firstId])
    ).rejects.toBeDefined();
    await rollbackAndRelease(immediateClient);

    const swapClient = await pool.connect();
    try {
      await swapClient.query("BEGIN");
      await swapClient.query("SET CONSTRAINTS uq_listing_images_listing_display_order DEFERRED");
      await swapClient.query("UPDATE listing_images SET display_order = 2 WHERE id = $1", [firstId]);
      await swapClient.query("UPDATE listing_images SET display_order = 1 WHERE id = $1", [secondId]);
      await swapClient.query("COMMIT");
    } catch (error) {
      await swapClient.query("ROLLBACK");
      throw error;
    } finally {
      swapClient.release();
    }

    const swapped = await pool.query<{ id: number; displayOrder: number }>(
      `
        SELECT id, display_order AS "displayOrder"
        FROM listing_images
        WHERE listing_id = $1
        ORDER BY id
      `,
      [listingId]
    );
    expect(swapped.rows).toStrictEqual([
      { id: firstId, displayOrder: 2 },
      { id: secondId, displayOrder: 1 }
    ]);

    const duplicateClient = await pool.connect();
    await duplicateClient.query("BEGIN");
    await duplicateClient.query("SET CONSTRAINTS uq_listing_images_listing_display_order DEFERRED");
    await duplicateClient.query("UPDATE listing_images SET display_order = 1 WHERE id = $1", [firstId]);
    await expect(duplicateClient.query("COMMIT")).rejects.toBeDefined();
    await rollbackAndRelease(duplicateClient);
  });

  it("enforces the exact listing-amenity junction behavior and retirement boundary", async () => {
    await migrateClean();
    const landlordId = await createUser("LANDLORD");
    const firstListingId = await insertMinimalDraft(landlordId);
    const secondListingId = await insertMinimalDraft(landlordId);
    const firstAmenityId = await createAmenity();
    const secondAmenityId = await createAmenity();
    const unreferencedAmenityId = await createAmenity();

    await pool.query(
      `
        INSERT INTO listing_amenities (listing_id, amenity_id)
        VALUES ($1, $3), ($1, $4), ($2, $3)
      `,
      [firstListingId, secondListingId, firstAmenityId, secondAmenityId]
    );
    await expectQueryFailure("INSERT INTO listing_amenities (listing_id, amenity_id) VALUES ($1, $2)", [
      firstListingId,
      firstAmenityId
    ]);
    await expectQueryFailure("INSERT INTO listing_amenities (listing_id, amenity_id) VALUES (2147000000, $1)", [
      firstAmenityId
    ]);
    await expectQueryFailure("INSERT INTO listing_amenities (listing_id, amenity_id) VALUES ($1, 32000)", [
      firstListingId
    ]);

    await pool.query("UPDATE amenities SET is_active = false WHERE id = $1", [firstAmenityId]);
    await expectQueryFailure("DELETE FROM amenities WHERE id = $1", [firstAmenityId]);
    await expectQueryFailure("UPDATE amenities SET id = id + 1000 WHERE id = $1", [firstAmenityId]);
    await pool.query("DELETE FROM amenities WHERE id = $1", [unreferencedAmenityId]);

    await pool.query("DELETE FROM listings WHERE id = $1", [firstListingId]);
    const remaining = await pool.query<{ listingId: number; amenityId: number }>(
      `
        SELECT listing_id AS "listingId", amenity_id AS "amenityId"
        FROM listing_amenities
        ORDER BY listing_id, amenity_id
      `
    );
    expect(remaining.rows).toStrictEqual([{ listingId: secondListingId, amenityId: firstAmenityId }]);
  });

  it("cascades listing children without reverse deletion or cross-listing effects", async () => {
    await migrateClean();
    const landlordId = await createUser("LANDLORD");
    const firstListingId = await insertMinimalDraft(landlordId);
    const secondListingId = await insertMinimalDraft(landlordId);
    const amenityId = await createAmenity();
    const firstImageId = await insertImage(validImage(firstListingId, 1));
    const secondImageId = await insertImage(validImage(secondListingId, 1));
    await pool.query("INSERT INTO listing_amenities (listing_id, amenity_id) VALUES ($1, $3), ($2, $3)", [
      firstListingId,
      secondListingId,
      amenityId
    ]);

    await pool.query("DELETE FROM listing_images WHERE id = $1", [firstImageId]);
    const firstListingStillExists = await pool.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM listings WHERE id = $1) AS exists",
      [firstListingId]
    );
    expect(firstListingStillExists.rows).toStrictEqual([{ exists: true }]);

    await insertImage(validImage(firstListingId, 1));
    await pool.query("DELETE FROM listings WHERE id = $1", [firstListingId]);

    const survivors = await pool.query<{ listingCount: number; imageCount: number; amenityCount: number }>(
      `
        SELECT
          (SELECT count(*)::integer FROM listings WHERE id = $1) AS "listingCount",
          (SELECT count(*)::integer FROM listing_images WHERE id = $2) AS "imageCount",
          (SELECT count(*)::integer FROM listing_amenities WHERE listing_id = $1) AS "amenityCount"
      `,
      [secondListingId, secondImageId]
    );
    expect(survivors.rows).toStrictEqual([{ listingCount: 1, imageCount: 1, amenityCount: 1 }]);
  });

  it("rolls back an RM-006-shaped failed file, preserves prior commits, skips later files, and releases clients", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "rentmate-rm006-rollback-"));
    temporaryDirectories.push(directory);
    await writeFile(
      path.join(directory, "0001_create_committed_fixture.sql"),
      "CREATE TABLE rm006_committed_fixture (id integer PRIMARY KEY);",
      "utf8"
    );
    await writeFile(
      path.join(directory, "0002_create_listing_then_fail.sql"),
      `
        CREATE TABLE rm006_rolled_back_fixture (
          id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          display_order smallint NOT NULL CHECK (display_order BETWEEN 1 AND 8)
        );
        SELECT * FROM rm006_deliberately_missing_relation;
      `,
      "utf8"
    );
    await writeFile(
      path.join(directory, "0003_create_skipped_fixture.sql"),
      "CREATE TABLE rm006_skipped_fixture (id integer PRIMARY KEY);",
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
      filename: "0002_create_listing_then_fail.sql"
    });
    expect(failure?.lastSuccessfulMigration).toMatchObject({
      version: 1,
      filename: "0001_create_committed_fixture.sql"
    });
    expect(failure?.message).not.toContain("rm006_deliberately_missing_relation");
    expect(failure?.message).not.toContain("postgresql://");

    const relations = await pool.query<{ name: string; relation: string | null }>(
      `
        SELECT requested.name, to_regclass('public.' || requested.name)::text AS relation
        FROM unnest($1::text[]) AS requested(name)
        ORDER BY requested.name
      `,
      [["rm006_committed_fixture", "rm006_rolled_back_fixture", "rm006_skipped_fixture"]]
    );
    expect(relations.rows).toStrictEqual([
      { name: "rm006_committed_fixture", relation: "rm006_committed_fixture" },
      { name: "rm006_rolled_back_fixture", relation: null },
      { name: "rm006_skipped_fixture", relation: null }
    ]);
    expect(pool.waitingCount).toBe(0);
    expect(pool.idleCount).toBe(pool.totalCount);
  });
});
