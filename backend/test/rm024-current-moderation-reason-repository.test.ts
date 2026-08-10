import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import { RepositoryInvariantError } from "../src/db/repository-primitives.js";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createCurrentModerationReasonRepository } from "../src/modules/listings/current-moderation-reason-repository.js";

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

function fixture(rows: QueryResultRow[]) {
  const statements: ParameterizedQuery[] = [];
  const query = vi.fn(async (statement: ParameterizedQuery) => {
    statements.push(statement);
    return result(rows);
  });
  return { executor: { query } as unknown as SqlExecutor, statements, query };
}

describe("RM-024 current moderation reason repository", () => {
  it.each(["REJECTED", "HIDDEN"] as const)("uses the supplied executor for latest %s reason", async (status) => {
    const test = fixture([{ reason: "Current private reason" }]);
    const repository = createCurrentModerationReasonRepository(test.executor);

    await expect(repository.findLatestReason(42, status)).resolves.toBe("Current private reason");
    expect(test.query).toHaveBeenCalledTimes(1);
    expect(test.statements).toHaveLength(1);
    const statement = test.statements[0]!;
    const sql = statement.text.replace(/\s+/g, " ").trim();
    expect(statement.values).toStrictEqual([42, status]);
    expect(sql).toMatch(/^SELECT reason FROM moderation_history/);
    expect(sql).toContain("WHERE listing_id = $1 AND new_status = $2");
    expect(sql).toContain("ORDER BY created_at DESC, id DESC LIMIT 1");
    expect(sql).not.toMatch(/SELECT \*|listing_id\s*,|admin_id|previous_status|new_status\s*,|created_at\s*,/i);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|FOR UPDATE)\b/i);
    expect(sql).not.toContain(status);
  });

  it("returns null when no row exists", async () => {
    const test = fixture([]);
    await expect(
      createCurrentModerationReasonRepository(test.executor).findLatestReason(7, "REJECTED")
    ).resolves.toBeNull();
  });

  it.each([{ reason: null }, { reason: "" }, { reason: "   " }, { reason: 3 }, { reason: "x".repeat(1_001) }, {}])(
    "rejects malformed row data without exposing it",
    async (row) => {
      const test = fixture([row]);
      await expect(
        createCurrentModerationReasonRepository(test.executor).findLatestReason(99, "HIDDEN")
      ).rejects.toThrow(RepositoryInvariantError);
      await expect(
        createCurrentModerationReasonRepository(fixture([row]).executor).findLatestReason(99, "HIDDEN")
      ).rejects.not.toThrow(/99|HIDDEN|\s{3}|1001/);
    }
  );

  it("returns only the reason string rather than history metadata", async () => {
    const test = fixture([{ reason: "Projected only", id: 90, admin_id: 12, new_status: "HIDDEN" }]);
    const value = await createCurrentModerationReasonRepository(test.executor).findLatestReason(1, "HIDDEN");
    expect(value).toBe("Projected only");
    expect(typeof value).toBe("string");
  });

  it("accepts 1000 astral code points and rejects 1001", async () => {
    const maximum = "😀".repeat(1_000);
    await expect(
      createCurrentModerationReasonRepository(fixture([{ reason: maximum }]).executor).findLatestReason(1, "HIDDEN")
    ).resolves.toBe(maximum);
    await expect(
      createCurrentModerationReasonRepository(fixture([{ reason: `${maximum}😀` }]).executor).findLatestReason(
        1,
        "HIDDEN"
      )
    ).rejects.toBeInstanceOf(RepositoryInvariantError);
  });
});
