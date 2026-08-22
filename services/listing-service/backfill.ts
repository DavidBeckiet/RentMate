import { EnvironmentConfigurationError, loadEnvironment } from "../shared/src/runtime/config/env.js";
import { closeDatabasePool, createPostgresPool } from "../shared/src/runtime/db/pool.js";
import { createLogger } from "../shared/src/runtime/shared/logging/logger.js";
import { applyDatabaseOverrides } from "../shared/database-overrides.js";

function hasApplyFlag(): boolean {
  return process.argv.includes("--apply");
}

const tables = [
  "property_types",
  "amenities",
  "listings",
  "listing_images",
  "listing_amenities",
  "moderation_history"
] as const;

async function backfill(): Promise<void> {
  applyDatabaseOverrides("LISTING");
  process.env.PORT = process.env.LISTING_SERVICE_PORT ?? "4200";
  const config = loadEnvironment();
  const legacyDatabaseName = process.env.LEGACY_DB_NAME ?? "rentmate";
  if (config.database.database === legacyDatabaseName) {
    throw new Error("Listing target database must differ from LEGACY_DB_NAME.");
  }

  const logger = createLogger(config.logLevel);
  const targetPool = createPostgresPool(config.database, logger);
  const legacyPool = createPostgresPool(
    {
      ...config.database,
      host: process.env.LEGACY_DB_HOST ?? config.database.host,
      port: Number(process.env.LEGACY_DB_PORT ?? config.database.port),
      database: legacyDatabaseName,
      user: process.env.LEGACY_DB_USER ?? config.database.user,
      password: process.env.LEGACY_DB_PASSWORD ?? config.database.password
    },
    logger
  );
  const legacyClient = await legacyPool.connect();
  const targetClient = await targetPool.connect();

  try {
    const counts = Object.fromEntries(
      await Promise.all(
        tables.map(async (table) => {
          const result = await legacyClient.query<{ readonly count: string }>({
            text: `SELECT COUNT(*)::text AS count FROM ${table}`,
            values: []
          });
          return [table, Number(result.rows[0]?.count ?? 0)] as const;
        })
      )
    );
    logger.info("Listing backfill planned", {
      sourceDatabase: legacyDatabaseName,
      targetDatabase: config.database.database,
      counts,
      apply: hasApplyFlag()
    });
    if (!hasApplyFlag()) return;

    await targetClient.query("BEGIN");
    const upsertLookupRows = async (table: "property_types" | "amenities"): Promise<void> => {
      const result = await legacyClient.query(`SELECT id, code, label, is_active FROM ${table} ORDER BY id ASC`);
      for (const row of result.rows) {
        await targetClient.query({
          text: `
            INSERT INTO ${table} (id, code, label, is_active)
            OVERRIDING SYSTEM VALUE
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET
              code = EXCLUDED.code,
              label = EXCLUDED.label,
              is_active = EXCLUDED.is_active
          `,
          values: [row.id, row.code, row.label, row.is_active]
        });
      }
    };
    const copyRows = async (table: (typeof tables)[number], columns: string[]): Promise<void> => {
      const result = await legacyClient.query(`SELECT ${columns.join(", ")} FROM ${table} ORDER BY 1 ASC`);
      for (const row of result.rows) {
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
        await targetClient.query({
          text: `INSERT INTO ${table} (${columns.join(", ")}) OVERRIDING SYSTEM VALUE VALUES (${placeholders})`,
          values: columns.map((column) => row[column])
        });
      }
    };

    await upsertLookupRows("property_types");
    await upsertLookupRows("amenities");
    await copyRows("listings", [
      "id",
      "landlord_id",
      "property_type_id",
      "status",
      "title",
      "description",
      "monthly_rent",
      "room_area_sqm",
      "address_text",
      "area_name",
      "latitude",
      "longitude",
      "created_at",
      "updated_at"
    ]);
    await copyRows("listing_images", [
      "id",
      "listing_id",
      "cloudinary_public_id",
      "secure_url",
      "format",
      "width",
      "height",
      "byte_size",
      "display_order",
      "alt_text",
      "created_at"
    ]);
    await copyRows("listing_amenities", ["listing_id", "amenity_id"]);
    await copyRows("moderation_history", [
      "id",
      "listing_id",
      "admin_id",
      "previous_status",
      "new_status",
      "reason",
      "created_at"
    ]);
    for (const table of ["property_types", "amenities", "listings", "listing_images", "moderation_history"]) {
      await targetClient.query({
        text: `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${table}`,
        values: []
      });
    }
    await targetClient.query("COMMIT");
    logger.info("Listing backfill completed", { counts });
  } catch (error) {
    await targetClient.query("ROLLBACK");
    throw error;
  } finally {
    legacyClient.release();
    targetClient.release();
    await closeDatabasePool(legacyPool);
    await closeDatabasePool(targetPool);
  }
}

void backfill().catch((error: unknown) => {
  const logger = createLogger("info");
  if (error instanceof EnvironmentConfigurationError) {
    logger.error("Listing backfill configuration failed", { reason: error.message });
  } else {
    logger.error("Listing backfill failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }
  process.exitCode = 1;
});
