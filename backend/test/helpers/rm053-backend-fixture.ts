import path from "node:path";
import type { Express } from "express";
import type { Pool } from "pg";
import { bootstrapDatabase, type DatabaseBootstrapResult } from "../../src/db/bootstrap/bootstrap-database.js";
import { closeDatabasePool } from "../../src/db/pool.js";
import { createSqlExecutor, type SqlExecutor } from "../../src/db/sql-executor.js";
import { withTransaction } from "../../src/db/transaction.js";
import { createSessionTokenService } from "../../src/modules/auth/session-token.js";
import type { TransactionRunner } from "../../src/modules/listings/listing-create-service.js";
import { createBackendApp } from "../../src/server-composition.js";
import type { UserRole } from "../../src/shared/types/authentication.js";
import {
  createRecordingCloudinary,
  createRecordingLogger,
  rm032Jpeg,
  type RecordingCloudinary,
  type RecordingLogger
} from "./rm032-image-fixture.js";
import { createRecordingProvider } from "./rm034-geocoding-fixture.js";
import { createTestDatabasePool } from "../support/test-database.js";

export const rm053Origin = "http://localhost:3000";
export const rm053JwtSecret = "rm053-test-only-jwt-secret-not-for-production";
export const rm053NowSeconds = 1_900_000_000;
export const rm053AdminEmail = "rm053.admin@example.test";
export const rm053AdminPassword = "Rm053AdminPass123";
export const rm053Jpeg = rm032Jpeg;

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

export interface Rm053AppFixture {
  readonly app: Express;
  readonly cloudinary: RecordingCloudinary;
  readonly logger: RecordingLogger;
  readonly nominatim: ReturnType<typeof createRecordingProvider>;
}

export interface Rm053DatabaseFixture {
  readonly pool: Pool;
  readonly migrationsDirectory: string;
  readonly bootstrap: () => Promise<DatabaseBootstrapResult>;
  readonly close: () => Promise<void>;
  readonly createApp: () => Promise<Rm053AppFixture>;
  readonly currentDatabaseName: () => Promise<string>;
  readonly dropKnownFrozenSchema: () => Promise<void>;
  readonly resetMutableData: () => Promise<void>;
  readonly signCookie: (userId: number, role: UserRole) => Promise<string>;
}

export function createRm053DatabaseFixture(source: NodeJS.ProcessEnv = process.env): Rm053DatabaseFixture {
  const pool = createTestDatabasePool(source, { max: 4 });
  const migrationsDirectory = path.resolve(process.cwd(), "migrations");

  return {
    pool,
    migrationsDirectory,

    async bootstrap(): Promise<DatabaseBootstrapResult> {
      return bootstrapDatabase({
        pool,
        migrationsDirectory,
        adminInput: {
          email: rm053AdminEmail,
          password: rm053AdminPassword,
          phoneE164: null,
          bcryptCost: 4
        }
      });
    },

    async close(): Promise<void> {
      await closeDatabasePool(pool);
    },

    async createApp(): Promise<Rm053AppFixture> {
      const cloudinary = createRecordingCloudinary();
      const logger = createRecordingLogger();
      const nominatim = createRecordingProvider();
      const transactionRunner: TransactionRunner = async <Value>(
        operation: (executor: SqlExecutor) => Promise<Value>
      ): Promise<Value> => withTransaction(pool, logger, operation);
      const app = await createBackendApp({
        frontendOrigin: rm053Origin,
        logger,
        checkDatabaseConnection: async () => {
          await pool.query("SELECT 1");
        },
        sqlExecutor: createSqlExecutor(pool),
        jwtSecret: rm053JwtSecret,
        bcryptCost: 4,
        cookieSecure: false,
        publicListingSearchConfig: {
          deploymentRegion: "HO_CHI_MINH_CITY_VN",
          maximumSearchRadiusKm: 50
        },
        sessionTokenClock: () => rm053NowSeconds,
        authRateLimitClock: () => 0,
        transactionRunner,
        cloudinaryClient: cloudinary.client,
        nominatimClient: nominatim.client
      });
      return { app, cloudinary, logger, nominatim };
    },

    async currentDatabaseName(): Promise<string> {
      const result = await pool.query<{ databaseName: string }>('SELECT current_database() AS "databaseName"');
      const databaseName = result.rows[0]?.databaseName;
      if (typeof databaseName !== "string" || databaseName.length === 0) {
        throw new Error("The RM-053 test database name could not be read.");
      }
      return databaseName;
    },

    async dropKnownFrozenSchema(): Promise<void> {
      for (const table of frozenTables) {
        await pool.query(`DROP TABLE IF EXISTS ${table}`);
      }
      for (const type of frozenTypes) {
        await pool.query(`DROP TYPE IF EXISTS ${type}`);
      }
    },

    async resetMutableData(): Promise<void> {
      await pool.query("DELETE FROM moderation_history");
      await pool.query("DELETE FROM favorites");
      await pool.query("DELETE FROM listing_amenities");
      await pool.query("DELETE FROM listing_images");
      await pool.query("DELETE FROM listings");
      await pool.query("DELETE FROM users WHERE role <> 'ADMIN'");
      await pool.query("UPDATE property_types SET is_active = true");
      await pool.query("UPDATE amenities SET is_active = true");
    },

    async signCookie(userId: number, role: UserRole): Promise<string> {
      const token = await createSessionTokenService({
        secret: rm053JwtSecret,
        nowSeconds: () => rm053NowSeconds
      }).sign({ userId, role });
      return `rentmate_session=${token}`;
    }
  };
}
