import type { Express } from "express";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import { expect } from "vitest";
import { discoverMigrations } from "../../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../../src/db/migrations/execution.js";
import { createMigrationPlan } from "../../src/db/migrations/planning.js";
import { closeDatabasePool } from "../../src/db/pool.js";
import { createSqlExecutor, type ParameterizedQuery, type SqlExecutor } from "../../src/db/sql-executor.js";
import { withTransaction } from "../../src/db/transaction.js";
import { createSessionTokenService } from "../../src/modules/auth/session-token.js";
import type { TransactionRunner } from "../../src/modules/listings/listing-create-service.js";
import { createBackendApp } from "../../src/server-composition.js";
import type { Logger } from "../../src/shared/logging/logger.js";
import type { UserRole } from "../../src/shared/types/authentication.js";
import { createTestDatabasePool } from "../support/test-database.js";

export const phase4Origin = "http://localhost:3000";
export const phase4JwtSecret = "rm022-phase4-test-only-secret-not-for-production";
export const phase4NowSeconds = 1_900_000_000;

export const ownerDetailKeys = Object.freeze([
  "id",
  "status",
  "title",
  "description",
  "monthlyRent",
  "roomAreaSqm",
  "addressText",
  "areaName",
  "latitude",
  "longitude",
  "propertyType",
  "amenities",
  "images",
  "currentModerationReason",
  "createdAt",
  "updatedAt"
] as const);

export const ownerSummaryKeys = Object.freeze([
  "id",
  "status",
  "title",
  "monthlyRent",
  "areaName",
  "propertyType",
  "coverImage",
  "currentModerationReason",
  "updatedAt"
] as const);

export const ownerImageKeys = Object.freeze([
  "id",
  "url",
  "format",
  "width",
  "height",
  "byteSize",
  "displayOrder",
  "altText",
  "createdAt"
] as const);

export function expectExactKeys(value: unknown, expectedKeys: readonly string[]): void {
  expect(value).not.toBeNull();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  expect(Object.keys(value as object).sort()).toStrictEqual([...expectedKeys].sort());
}

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

export type Phase4CreateFault = "junction" | "mapping";
export type Phase4UpdateFault = "conditional-update" | "amenity-delete" | "amenity-insert" | "detail-read";
export type Phase4Fault = Phase4CreateFault | Phase4UpdateFault;
export type OwnerReadKind = "collection" | "detail" | "amenities" | "images" | "reason";

export interface Phase4FaultState {
  attemptedListingId: number | null;
  readonly statements: ParameterizedQuery[];
}

export interface Phase4AppFixture {
  readonly app: Express;
  readonly ownerReads: OwnerReadKind[];
  readonly faultState: Phase4FaultState;
  readonly resetOwnerReads: () => void;
}

export interface Phase4DatabaseFixture {
  readonly pool: Pool;
  readonly rebuildSchema: () => Promise<void>;
  readonly dropSchema: () => Promise<void>;
  readonly resetData: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly createApp: (options?: Readonly<{ fault?: Phase4Fault }>) => Promise<Phase4AppFixture>;
  readonly insertUser: (role: "LANDLORD" | "TENANT" | "ADMIN", sequence: number) => Promise<number>;
  readonly signToken: (userId: number, role?: UserRole) => Promise<string>;
  readonly tableCount: (table: Phase4TableName) => Promise<number>;
  readonly stateSnapshot: () => Promise<Record<Phase4TableName, readonly QueryResultRow[]>>;
}

type Phase4TableName =
  | "users"
  | "property_types"
  | "amenities"
  | "listings"
  | "listing_images"
  | "listing_amenities"
  | "favorites"
  | "moderation_history";

const phase4Tables: readonly Phase4TableName[] = Object.freeze([
  "users",
  "property_types",
  "amenities",
  "listings",
  "listing_images",
  "listing_amenities",
  "favorites",
  "moderation_history"
]);

function classifyOwnerRead(query: ParameterizedQuery): OwnerReadKind | null {
  if (query.text.includes("FROM listings AS l") && query.text.includes("LIMIT $3")) return "collection";
  if (query.text.includes("FROM listings AS l") && query.text.includes("l.landlord_id = $2")) return "detail";
  if (query.text.includes("FROM listing_amenities AS la")) return "amenities";
  if (query.text.includes("FROM listing_images")) return "images";
  if (query.text.includes("FROM moderation_history")) return "reason";
  return null;
}

function createCountingExecutor(delegate: SqlExecutor, ownerReads: OwnerReadKind[]): SqlExecutor {
  return {
    async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
      const kind = classifyOwnerRead(query);
      if (kind !== null) ownerReads.push(kind);
      return delegate.query<Row>(query);
    }
  };
}

function createFaultingExecutor(
  delegate: SqlExecutor,
  fault: Phase4Fault | undefined,
  state: Phase4FaultState
): SqlExecutor {
  return {
    async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
      state.statements.push(query);
      if (fault === "junction" && query.text.includes("INSERT INTO listing_amenities")) {
        throw new Error("synthetic RM-022 junction failure with private SQL detail");
      }
      if (fault === "amenity-delete" && query.text.includes("DELETE FROM listing_amenities"))
        throw new Error("synthetic RM-023 amenity delete failure");
      if (fault === "amenity-insert" && query.text.includes("INSERT INTO listing_amenities"))
        throw new Error("synthetic RM-023 amenity insert failure");
      if (
        fault === "detail-read" &&
        query.text.includes("FROM listings AS l") &&
        !query.text.includes("FOR UPDATE OF l")
      )
        throw new Error("synthetic RM-023 final detail failure");

      const result = await delegate.query<Row>(query);
      if (fault === "conditional-update" && query.text.includes("UPDATE listings")) return { ...result, rowCount: 0 };
      if (query.text.includes("INSERT INTO listings")) {
        const id = (result.rows[0] as { id?: unknown } | undefined)?.id;
        if (typeof id === "number") state.attemptedListingId = id;
        if (fault === "mapping") {
          return {
            ...result,
            rows: result.rows.map((row) => ({ ...row, status: "APPROVED" })) as Row[]
          };
        }
      }
      return result;
    }
  };
}

async function dropFrozenSchema(pool: Pool): Promise<void> {
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

export function createPhase4DatabaseFixture(
  migrationDirectory: string,
  source: NodeJS.ProcessEnv = process.env
): Phase4DatabaseFixture {
  const pool = createTestDatabasePool(source, { max: 4 });
  const baseExecutor = createSqlExecutor(pool);

  return {
    pool,

    async rebuildSchema(): Promise<void> {
      await dropFrozenSchema(pool);
      const migrations = await discoverMigrations(migrationDirectory);
      await executeMigrationPlan(pool, createMigrationPlan("clean", migrations));
    },

    async dropSchema(): Promise<void> {
      await dropFrozenSchema(pool);
    },

    async resetData(): Promise<void> {
      await pool.query("DELETE FROM moderation_history");
      await pool.query("DELETE FROM favorites");
      await pool.query("DELETE FROM listings");
      await pool.query("DELETE FROM users");
      await pool.query("UPDATE property_types SET is_active = true");
      await pool.query("UPDATE amenities SET is_active = true");
    },

    async close(): Promise<void> {
      await closeDatabasePool(pool);
    },

    async createApp(options = {}): Promise<Phase4AppFixture> {
      const ownerReads: OwnerReadKind[] = [];
      const faultState: Phase4FaultState = { attemptedListingId: null, statements: [] };
      const applicationExecutor = createCountingExecutor(baseExecutor, ownerReads);
      const transactionRunner: TransactionRunner = async <Value>(
        operation: (executor: SqlExecutor) => Promise<Value>
      ): Promise<Value> =>
        withTransaction(pool, silentLogger, async (transaction) =>
          operation(createFaultingExecutor(transaction, options.fault, faultState))
        );
      const app = await createBackendApp({
        frontendOrigin: phase4Origin,
        logger: silentLogger,
        checkDatabaseConnection: async () => undefined,
        sqlExecutor: applicationExecutor,
        jwtSecret: phase4JwtSecret,
        bcryptCost: 4,
        cookieSecure: false,
        sessionTokenClock: () => phase4NowSeconds,
        authRateLimitClock: () => 0,
        transactionRunner
      });
      return {
        app,
        ownerReads,
        faultState,
        resetOwnerReads: () => {
          ownerReads.length = 0;
        }
      };
    },

    async insertUser(role, sequence): Promise<number> {
      const result = await pool.query<{ id: number }>({
        text: `
          INSERT INTO users (role, email, phone_e164, password_hash)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `,
        values: [
          role,
          `rm022.${role.toLowerCase()}.${sequence}@example.com`,
          role === "LANDLORD" ? `+8492000${String(sequence).padStart(4, "0")}` : null,
          "rm022-test-only-non-authenticating-hash"
        ]
      });
      return result.rows[0]!.id;
    },

    async signToken(userId, role = "LANDLORD"): Promise<string> {
      return createSessionTokenService({ secret: phase4JwtSecret, nowSeconds: () => phase4NowSeconds }).sign({
        userId,
        role
      });
    },

    async tableCount(table): Promise<number> {
      const result = await pool.query<{ count: number }>({
        text: `SELECT count(*)::integer AS count FROM ${table}`,
        values: []
      });
      return result.rows[0]!.count;
    },

    async stateSnapshot(): Promise<Record<Phase4TableName, readonly QueryResultRow[]>> {
      const snapshot = {} as Record<Phase4TableName, readonly QueryResultRow[]>;
      for (const table of phase4Tables) {
        const result = await pool.query({
          text: `SELECT * FROM ${table} ORDER BY 1, 2 NULLS FIRST`,
          values: []
        });
        snapshot[table] = result.rows;
      }
      return snapshot;
    }
  };
}
