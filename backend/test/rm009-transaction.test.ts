import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { withTransaction } from "../src/db/transaction.js";

function emptyResult(): QueryResult<QueryResultRow> {
  return {
    command: "COMMAND",
    rowCount: 0,
    oid: 0,
    fields: [],
    rows: []
  };
}

interface FakeTransaction {
  readonly pool: Pick<Pool, "connect"> & { query: ReturnType<typeof vi.fn> };
  readonly client: PoolClient;
  readonly query: ReturnType<typeof vi.fn>;
  readonly release: ReturnType<typeof vi.fn>;
  readonly sequence: string[];
}

function fakeTransaction(failures: Partial<Record<"BEGIN" | "COMMIT" | "ROLLBACK", Error>> = {}): FakeTransaction {
  const sequence: string[] = [];
  const release = vi.fn(() => {
    sequence.push("release");
  });
  const query = vi.fn(async (queryConfig: ParameterizedQuery) => {
    sequence.push(queryConfig.text);
    const failure = failures[queryConfig.text as keyof typeof failures];
    if (failure) {
      throw failure;
    }

    return emptyResult();
  });
  const client = { query, release } as unknown as PoolClient;
  const poolQuery = vi.fn();
  const pool = {
    query: poolQuery,
    connect: vi.fn(async () => {
      sequence.push("connect");
      return client;
    })
  };

  return { pool, client, query, release, sequence };
}

const silentLogger = {
  error: vi.fn()
};

async function callbackQuery(executor: SqlExecutor, sequence: string[]): Promise<void> {
  sequence.push("callback");
  await executor.query({
    text: "INSERT INTO property_types (code, label) VALUES ($1, $2)",
    values: ["RM009", "RM-009"]
  });
}

describe("RM-009 checked-out-client transaction helper", () => {
  it("uses one client in exact success order, hides release, and preserves callback results", async () => {
    const fake = fakeTransaction();
    const expected = { id: 42 };

    const actual = await withTransaction(fake.pool, silentLogger, async (transaction) => {
      expect("release" in transaction).toBe(false);
      await callbackQuery(transaction, fake.sequence);
      return expected;
    });

    expect(actual).toBe(expected);
    expect(fake.sequence).toEqual([
      "connect",
      "BEGIN",
      "callback",
      "INSERT INTO property_types (code, label) VALUES ($1, $2)",
      "COMMIT",
      "release"
    ]);
    expect(fake.release).toHaveBeenCalledOnce();
    expect(fake.pool.query).not.toHaveBeenCalled();
  });

  it.each([
    ["primitive", 7],
    ["undefined", undefined]
  ])("preserves a %s callback result", async (_description, expected) => {
    const fake = fakeTransaction();

    await expect(withTransaction(fake.pool, silentLogger, async () => expected)).resolves.toBe(expected);
    expect(fake.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases exactly once after callback failure", async () => {
    const fake = fakeTransaction();
    const primary = new Error("callback failed");

    await expect(
      withTransaction(fake.pool, silentLogger, async (transaction) => {
        await callbackQuery(transaction, fake.sequence);
        throw primary;
      })
    ).rejects.toBe(primary);

    expect(fake.sequence).toEqual([
      "connect",
      "BEGIN",
      "callback",
      "INSERT INTO property_types (code, label) VALUES ($1, $2)",
      "ROLLBACK",
      "release"
    ]);
    expect(fake.release).toHaveBeenCalledOnce();
  });

  it("releases without rollback when BEGIN fails", async () => {
    const beginFailure = new Error("begin failed");
    const fake = fakeTransaction({ BEGIN: beginFailure });

    await expect(withTransaction(fake.pool, silentLogger, async () => undefined)).rejects.toBe(beginFailure);
    expect(fake.sequence).toEqual(["connect", "BEGIN", "release"]);
    expect(fake.release).toHaveBeenCalledOnce();
  });

  it("rolls back after COMMIT failure and preserves that failure", async () => {
    const commitFailure = new Error("commit failed");
    const fake = fakeTransaction({ COMMIT: commitFailure });

    await expect(withTransaction(fake.pool, silentLogger, async () => "result")).rejects.toBe(commitFailure);
    expect(fake.sequence).toEqual(["connect", "BEGIN", "COMMIT", "ROLLBACK", "release"]);
    expect(fake.release).toHaveBeenCalledOnce();
  });

  it("preserves the primary failure and safely logs a rollback failure", async () => {
    const primary = new Error("primary secret SQL SELECT * FROM users");
    const rollbackFailure = new Error("rollback contained private-value");
    const fake = fakeTransaction({ ROLLBACK: rollbackFailure });
    const logger = { error: vi.fn() };

    await expect(
      withTransaction(fake.pool, logger, async () => {
        throw primary;
      })
    ).rejects.toBe(primary);

    expect(fake.sequence).toEqual(["connect", "BEGIN", "ROLLBACK", "release"]);
    expect(logger.error).toHaveBeenCalledWith("PostgreSQL transaction rollback failed", {
      errorType: "Error"
    });
    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).not.toContain("private-value");
    expect(logged).not.toContain("SELECT * FROM users");
    expect(fake.release).toHaveBeenCalledOnce();
  });

  it("propagates connect failure without a client release attempt", async () => {
    const connectFailure = new Error("connection failed");
    const pool = {
      connect: vi.fn().mockRejectedValue(connectFailure)
    };

    await expect(withTransaction(pool, silentLogger, async () => undefined)).rejects.toBe(connectFailure);
  });
});
