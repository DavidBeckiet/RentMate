import dotenv from "dotenv";
import path from "node:path";
import type { QueryResultRow } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { closeDatabasePool, createPostgresPool } from "../src/db/pool.js";
import { executeCommand, queryExactlyOne, queryMany, queryOptional } from "../src/db/repository-primitives.js";
import { createSqlExecutor } from "../src/db/sql-executor.js";
import { withTransaction } from "../src/db/transaction.js";
import { mapPgScaleTwoNumeric, mapPgTimestamptz, mapPgWholeNumeric } from "../src/db/value-mappers.js";
import type { Logger } from "../src/shared/logging/logger.js";
import { readTestDatabaseUrl } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const testDatabaseUrl = readTestDatabaseUrl();
const parsedTestDatabaseUrl = new URL(testDatabaseUrl);
const pool = createPostgresPool(
  {
    host: parsedTestDatabaseUrl.hostname,
    port: parsedTestDatabaseUrl.port ? Number(parsedTestDatabaseUrl.port) : 5432,
    database: decodeURIComponent(parsedTestDatabaseUrl.pathname.slice(1)),
    user: decodeURIComponent(parsedTestDatabaseUrl.username),
    password: decodeURIComponent(parsedTestDatabaseUrl.password),
    max: 4,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000
  },
  silentLogger()
);
const executor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const testCodes = ["RM009_COMMIT_PROPERTY", "RM009_ROLLBACK_PROPERTY"] as const;
const testAmenityCodes = ["RM009_COMMIT_AMENITY"] as const;

interface CountRow extends QueryResultRow {
  readonly count: number;
}

function silentLogger(): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  };
}

async function cleanFrozenSchema(): Promise<void> {
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

async function cleanTestRows(): Promise<void> {
  await pool.query({
    text: "DELETE FROM amenities WHERE code = ANY($1::text[])",
    values: [[...testAmenityCodes]]
  });
  await pool.query({
    text: "DELETE FROM property_types WHERE code = ANY($1::text[])",
    values: [[...testCodes]]
  });
}

function expectAllClientsReleased(): void {
  expect(pool.waitingCount).toBe(0);
  expect(pool.idleCount).toBe(pool.totalCount);
}

beforeAll(async () => {
  await cleanFrozenSchema();
  const migrations = await discoverMigrations(migrationDirectory);
  await executeMigrationPlan(pool, createMigrationPlan("clean", migrations));
});

beforeEach(async () => {
  await cleanTestRows();
});

afterEach(async () => {
  await cleanTestRows();
  expectAllClientsReleased();
});

afterAll(async () => {
  await cleanTestRows();
  await cleanFrozenSchema();
  await closeDatabasePool(pool);
});

describe("RM-009 PostgreSQL pool integration", () => {
  it("sets UTC on more than one checked-out connection", async () => {
    const first = await pool.connect();
    const second = await pool.connect();

    try {
      const [firstZone, secondZone] = await Promise.all([
        first.query<{ TimeZone: string }>("SHOW TIME ZONE"),
        second.query<{ TimeZone: string }>("SHOW TIME ZONE")
      ]);

      expect(["UTC", "Etc/UTC"]).toContain(firstZone.rows[0]?.TimeZone);
      expect(["UTC", "Etc/UTC"]).toContain(secondZone.rows[0]?.TimeZone);
    } finally {
      first.release();
      second.release();
    }
  });
});

describe("RM-009 checked-out-client transaction integration", () => {
  it("commits multiple writes on one backend connection and returns the callback result", async () => {
    const result = await withTransaction(pool, silentLogger(), async (transaction) => {
      const firstPid = await queryExactlyOne<{ pid: number }, number>(
        transaction,
        { text: "SELECT pg_backend_pid() AS pid", values: [] },
        (row) => row.pid
      );
      await executeCommand(transaction, {
        text: "INSERT INTO property_types (code, label) VALUES ($1, $2)",
        values: ["RM009_COMMIT_PROPERTY", "RM-009 commit property"]
      });
      await executeCommand(transaction, {
        text: "INSERT INTO amenities (code, label) VALUES ($1, $2)",
        values: ["RM009_COMMIT_AMENITY", "RM-009 commit amenity"]
      });
      const secondPid = await queryExactlyOne<{ pid: number }, number>(
        transaction,
        { text: "SELECT pg_backend_pid() AS pid", values: [] },
        (row) => row.pid
      );

      expect(secondPid).toBe(firstPid);
      return { backendPid: firstPid, writes: 2 };
    });

    expect(result.writes).toBe(2);
    const visibleRows = await pool.query<CountRow>({
      text: `
        SELECT (
          (SELECT count(*) FROM property_types WHERE code = $1) +
          (SELECT count(*) FROM amenities WHERE code = $2)
        )::integer AS count
      `,
      values: ["RM009_COMMIT_PROPERTY", "RM009_COMMIT_AMENITY"]
    });
    expect(visibleRows.rows[0]?.count).toBe(2);
    await pool.query({ text: "SELECT pg_backend_pid()", values: [] });
    expectAllClientsReleased();
  });

  it("rolls back all writes, preserves the original error, and leaves the pool usable", async () => {
    const primary = new Error("controlled RM-009 rollback");

    await expect(
      withTransaction(pool, silentLogger(), async (transaction) => {
        await executeCommand(transaction, {
          text: "INSERT INTO property_types (code, label) VALUES ($1, $2)",
          values: ["RM009_ROLLBACK_PROPERTY", "RM-009 rollback property"]
        });
        throw primary;
      })
    ).rejects.toBe(primary);

    const count = await pool.query<CountRow>({
      text: "SELECT count(*)::integer AS count FROM property_types WHERE code = $1",
      values: ["RM009_ROLLBACK_PROPERTY"]
    });
    expect(count.rows[0]?.count).toBe(0);
    await expect(pool.query({ text: "SELECT 1", values: [] })).resolves.toBeDefined();
    expectAllClientsReleased();
  });
});

describe("RM-009 repository primitive integration", () => {
  it("uses bound values as data and preserves repository cardinality behavior", async () => {
    const metacharacterValue = "value'); DROP TABLE users; --";
    const many = await queryMany<{ position: number; value: string }, string>(
      executor,
      {
        text: `
          SELECT input.position, input.value
          FROM unnest($1::integer[], $2::text[]) AS input(position, value)
          ORDER BY input.position
        `,
        values: [
          [2, 1],
          [metacharacterValue, "plain"]
        ]
      },
      (row) => row.value
    );

    expect(many).toEqual(["plain", metacharacterValue]);
    await expect(
      queryOptional<{ value: string }>(executor, {
        text: "SELECT $1::text AS value WHERE false",
        values: [metacharacterValue]
      })
    ).resolves.toBeNull();
    await expect(
      queryExactlyOne<{ value: string }, string>(
        executor,
        {
          text: "SELECT $1::text AS value",
          values: [metacharacterValue]
        },
        (row) => row.value
      )
    ).resolves.toBe(metacharacterValue);
    await expect(pool.query({ text: "SELECT 1 FROM users LIMIT 1", values: [] })).resolves.toBeDefined();
  });
});

describe("RM-009 PostgreSQL value mapping integration", () => {
  it("keeps numeric values as text until explicit whole and scale-two mapping", async () => {
    const row = await queryExactlyOne<{
      rent: string;
      area: string;
      unrelated: string;
    }>(executor, {
      text: `
        SELECT
          999999999999::numeric(12, 0) AS rent,
          12.34::numeric(8, 2) AS area,
          123.45::numeric AS unrelated
      `,
      values: []
    });

    expect(typeof row.rent).toBe("string");
    expect(typeof row.area).toBe("string");
    expect(typeof row.unrelated).toBe("string");
    expect(mapPgWholeNumeric(row.rent, "monthly_rent")).toBe(999_999_999_999);
    expect(mapPgScaleTwoNumeric(row.area, "room_area_sqm")).toBe(12.34);
  });

  it("maps a known timestamptz to the exact UTC instant", async () => {
    const row = await queryExactlyOne<{ instant: Date }>(executor, {
      text: "SELECT $1::timestamptz AS instant",
      values: ["2026-07-31T15:15:30.123+07:00"]
    });
    const mapped = mapPgTimestamptz(row.instant, "created_at");

    expect(row.instant).toBeInstanceOf(Date);
    expect(mapped).not.toBe(row.instant);
    expect(mapped.toISOString()).toBe("2026-07-31T08:15:30.123Z");
  });
});
