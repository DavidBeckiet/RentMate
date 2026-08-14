import { fileURLToPath } from "node:url";
import type { Express } from "express";
import type { Pool } from "pg";
import { bootstrapDatabase, type DatabaseBootstrapResult } from "../../src/db/bootstrap/bootstrap-database.js";
import { closeDatabasePool } from "../../src/db/pool.js";
import { createSqlExecutor, type SqlExecutor } from "../../src/db/sql-executor.js";
import { withTransaction } from "../../src/db/transaction.js";
import {
  CloudinaryClientError,
  type CloudinaryClient,
  type CloudinaryUploadedImage,
  type ListingImageMimeType
} from "../../src/integrations/cloudinary.client.js";
import {
  NominatimClientError,
  type NominatimClient,
  type NominatimCandidate
} from "../../src/integrations/nominatim.client.js";
import type { TransactionRunner } from "../../src/modules/listings/listing-create-service.js";
import { createBackendApp } from "../../src/server-composition.js";
import type { LogContext, Logger } from "../../src/shared/logging/logger.js";
import type { RateLimitStore } from "../../src/shared/middleware/rate-limit.js";
import {
  createTestDatabasePool,
  readTestDatabaseUrl,
  TestDatabaseConfigurationError
} from "../support/test-database.js";

export const rm054FrontendOrigin = "http://localhost:3100";
export const rm054TestDatabaseName = "rentmate_test_rm054";
export const rm054AdminEmail = "rm054.admin@example.test";
export const rm054AdminPassword = "Rm054AdminPass123";
export const rm054JwtSecret = "rm054-test-only-jwt-secret-not-for-production";
export const rm054NowSeconds = 1_900_000_000;
export const rm054ProviderFailureAddress = "RM054_PROVIDER_FAILURE";

const frozenTables = [
  "moderation_history",
  "favorites",
  "listing_amenities",
  "listing_images",
  "listings",
  "amenities",
  "property_types",
  "users"
] as const;

const frozenTypes = ["listing_status", "user_role"] as const;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type Rm054Preset = "empty" | "public";

export interface Rm054SeededScenario {
  readonly preset: Rm054Preset;
  readonly listingId?: number;
  readonly landlordId?: number;
}

export interface Rm054ProviderCall {
  readonly kind: "upload" | "remove" | "geocode";
  readonly value: string;
}

export interface Rm054BrowserFixture {
  readonly pool: Pool;
  readonly migrationsDirectory: string;
  readonly providerCalls: readonly Rm054ProviderCall[];
  readonly bootstrapFromCleanDatabase: () => Promise<DatabaseBootstrapResult>;
  readonly createApp: () => Promise<Express>;
  readonly close: () => Promise<void>;
  readonly currentDatabaseName: () => Promise<string>;
  readonly resetScenario: (preset: Rm054Preset) => Promise<Rm054SeededScenario>;
}

interface Rm054LoggerEntry {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message: string;
  readonly context?: LogContext;
}

function isPng(buffer: Buffer): boolean {
  return buffer.length >= pngSignature.length && buffer.subarray(0, pngSignature.length).equals(pngSignature);
}

export function assertRm054TestDatabaseName(databaseName: string): void {
  if (databaseName !== rm054TestDatabaseName) {
    throw new TestDatabaseConfigurationError(
      "RM-054 browser tests require the dedicated rentmate_test_rm054 database."
    );
  }
}

function configuredRm054DatabaseName(source: NodeJS.ProcessEnv): string {
  const url = new URL(readTestDatabaseUrl(source));
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  assertRm054TestDatabaseName(databaseName);
  return databaseName;
}

function createRecordingLogger(entries: Rm054LoggerEntry[]): Logger {
  return {
    debug: (message, context) => entries.push({ level: "debug", message, context }),
    info: (message, context) => entries.push({ level: "info", message, context }),
    warn: (message, context) => entries.push({ level: "warn", message, context }),
    error: (message, context) => entries.push({ level: "error", message, context })
  };
}

function createAllowAllRateLimitStore(): RateLimitStore {
  return Object.freeze({
    consume: async () => Object.freeze({ allowed: true })
  });
}

export function createRm054CloudinaryMock(calls: Rm054ProviderCall[]): CloudinaryClient {
  let successfulUploadCount = 0;

  return Object.freeze({
    async uploadImage(
      input: Readonly<{ buffer: Buffer; mimeType: ListingImageMimeType }>
    ): Promise<CloudinaryUploadedImage> {
      calls.push({ kind: "upload", value: input.mimeType });
      if (input.mimeType === "image/png" && isPng(input.buffer)) throw new CloudinaryClientError();

      successfulUploadCount += 1;
      const format = input.mimeType === "image/webp" ? "webp" : "jpg";
      return Object.freeze({
        publicId: `rm054/browser/${successfulUploadCount}`,
        secureUrl: `https://res.cloudinary.com/rentmate/image/upload/v1/rm054/browser-${successfulUploadCount}.${format}`,
        format,
        width: 2,
        height: 2,
        byteSize: input.buffer.length
      });
    },

    async removeImage(publicId: string): Promise<void> {
      calls.push({ kind: "remove", value: publicId });
    }
  });
}

export function createRm054NominatimMock(calls: Rm054ProviderCall[]): NominatimClient {
  const successfulCandidate: readonly NominatimCandidate[] = Object.freeze([
    Object.freeze({
      displayName: "Chợ Bến Thành, Quận 1, Thành phố Hồ Chí Minh",
      latitude: 10.7724,
      longitude: 106.6981
    })
  ]);

  return Object.freeze({
    async forwardGeocode(addressText: string): Promise<readonly NominatimCandidate[]> {
      calls.push({ kind: "geocode", value: addressText });
      if (addressText.includes(rm054ProviderFailureAddress)) throw new NominatimClientError();
      return successfulCandidate;
    }
  });
}

export interface Rm054MutableDataExecutor {
  query(statement: string): Promise<unknown>;
}

export async function resetRm054MutableData(pool: Rm054MutableDataExecutor): Promise<void> {
  await pool.query("DELETE FROM moderation_history");
  await pool.query("DELETE FROM favorites");
  await pool.query("DELETE FROM listing_amenities");
  await pool.query("DELETE FROM listing_images");
  await pool.query("DELETE FROM listings");
  await pool.query("DELETE FROM users WHERE role <> 'ADMIN'");
  await pool.query("UPDATE property_types SET is_active = true");
  await pool.query("UPDATE amenities SET is_active = true");
}

async function seedPublicScenario(pool: Pool): Promise<Rm054SeededScenario> {
  const landlord = await pool.query<{ id: number }>(
    "INSERT INTO users (role, email, phone_e164, password_hash) VALUES ('LANDLORD', $1, $2, $3) RETURNING id",
    [
      "rm054.public.landlord@example.test",
      "+84901111111",
      "$2b$04$Rm054BrowserFixtureHashPlaceholder00000000000000000000000000000000000"
    ]
  );
  const propertyType = await pool.query<{ id: number }>("SELECT id FROM property_types WHERE code = 'ROOM'");
  const amenity = await pool.query<{ id: number }>("SELECT id FROM amenities WHERE code = 'WIFI'");
  const landlordId = landlord.rows[0]?.id;
  const propertyTypeId = propertyType.rows[0]?.id;
  const amenityId = amenity.rows[0]?.id;
  if (!landlordId || !propertyTypeId || !amenityId)
    throw new Error("RM-054 browser lookup seed could not be prepared.");

  const listing = await pool.query<{ id: number }>(
    `
      INSERT INTO listings (
        landlord_id, property_type_id, status, title, description, monthly_rent, room_area_sqm,
        address_text, area_name, latitude, longitude
      ) VALUES ($1, $2, 'APPROVED', $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `,
    [
      landlordId,
      propertyTypeId,
      "Phòng RM054 công khai",
      "Phòng thử nghiệm công khai cho luồng tìm kiếm và quyền riêng tư.",
      5_200_000,
      24,
      "12 Đường RM054, Quận 1",
      "Quận 1",
      10.7724,
      106.6981
    ]
  );
  const listingId = listing.rows[0]?.id;
  if (!listingId) throw new Error("RM-054 browser public listing could not be prepared.");

  await pool.query("INSERT INTO listing_amenities (listing_id, amenity_id) VALUES ($1, $2)", [listingId, amenityId]);
  await pool.query(
    `
      INSERT INTO listing_images (
        listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order, alt_text
      ) VALUES ($1, $2, $3, 'jpg', 2, 2, 512, 1, $4)
    `,
    [
      listingId,
      `rm054/seed/${listingId}`,
      `https://res.cloudinary.com/rentmate/image/upload/v1/rm054/seed-${listingId}.jpg`,
      "Ảnh phòng RM054"
    ]
  );

  return Object.freeze({ preset: "public", listingId, landlordId });
}

export function createRm054BrowserFixture(source: NodeJS.ProcessEnv = process.env): Rm054BrowserFixture {
  configuredRm054DatabaseName(source);
  const pool = createTestDatabasePool(source, { max: 6 });
  const migrationsDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url));
  const providerCalls: Rm054ProviderCall[] = [];
  const loggerEntries: Rm054LoggerEntry[] = [];
  const logger = createRecordingLogger(loggerEntries);

  const currentDatabaseName = async (): Promise<string> => {
    const result = await pool.query<{ databaseName: string }>('SELECT current_database() AS "databaseName"');
    const databaseName = result.rows[0]?.databaseName;
    if (!databaseName) throw new Error("The RM-054 browser test database name could not be read.");
    return databaseName;
  };

  const requireDedicatedDatabase = async (): Promise<void> => {
    assertRm054TestDatabaseName(await currentDatabaseName());
  };

  const dropKnownFrozenSchema = async (): Promise<void> => {
    await requireDedicatedDatabase();
    for (const table of frozenTables) await pool.query(`DROP TABLE IF EXISTS ${table}`);
    for (const type of frozenTypes) await pool.query(`DROP TYPE IF EXISTS ${type}`);
  };

  return Object.freeze({
    pool,
    migrationsDirectory,
    providerCalls,

    async bootstrapFromCleanDatabase(): Promise<DatabaseBootstrapResult> {
      await dropKnownFrozenSchema();
      return bootstrapDatabase({
        pool,
        migrationsDirectory,
        adminInput: {
          email: rm054AdminEmail,
          password: rm054AdminPassword,
          phoneE164: null,
          bcryptCost: 4
        }
      });
    },

    async createApp(): Promise<Express> {
      const cloudinaryClient = createRm054CloudinaryMock(providerCalls);
      const nominatimClient = createRm054NominatimMock(providerCalls);
      const rateLimitStore = createAllowAllRateLimitStore();
      const transactionRunner: TransactionRunner = async <Value>(
        operation: (executor: SqlExecutor) => Promise<Value>
      ): Promise<Value> => withTransaction(pool, logger, operation);

      return createBackendApp({
        frontendOrigin: rm054FrontendOrigin,
        logger,
        checkDatabaseConnection: async () => {
          await pool.query("SELECT 1");
        },
        sqlExecutor: createSqlExecutor(pool),
        jwtSecret: rm054JwtSecret,
        bcryptCost: 4,
        cookieSecure: false,
        publicListingSearchConfig: {
          deploymentRegion: "HO_CHI_MINH_CITY_VN",
          maximumSearchRadiusKm: 50
        },
        sessionTokenClock: () => rm054NowSeconds,
        authRateLimitClock: () => 0,
        authRateLimitStore: rateLimitStore,
        geocodingUserRateLimitStore: rateLimitStore,
        geocodingUserRateLimitClock: () => 0,
        nominatimProviderRateLimitStore: rateLimitStore,
        nominatimProviderRateLimitClock: () => 0,
        transactionRunner,
        cloudinaryClient,
        nominatimClient
      });
    },

    currentDatabaseName,

    async resetScenario(preset: Rm054Preset): Promise<Rm054SeededScenario> {
      await requireDedicatedDatabase();
      await resetRm054MutableData(pool);
      providerCalls.splice(0, providerCalls.length);
      loggerEntries.splice(0, loggerEntries.length);
      if (preset === "public") return seedPublicScenario(pool);
      return Object.freeze({ preset: "empty" });
    },

    async close(): Promise<void> {
      await closeDatabasePool(pool);
    }
  });
}
