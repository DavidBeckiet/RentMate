import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  executeCommand,
  queryExactlyOne,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../src/db/repository-primitives.js";
import { createSqlExecutor, type ParameterizedQuery, type SqlExecutor } from "../src/db/sql-executor.js";

interface TestRow extends QueryResultRow {
  readonly id: number;
  readonly label: string;
}

function result<Row extends QueryResultRow>(rows: Row[], rowCount: number | null = rows.length): QueryResult<Row> {
  return {
    command: "SELECT",
    rowCount,
    oid: 0,
    fields: [],
    rows
  };
}

function executorReturning<Row extends QueryResultRow>(
  queryResult: QueryResult<Row>
): { executor: SqlExecutor; query: ReturnType<typeof vi.fn> } {
  const query = vi.fn().mockResolvedValue(queryResult);
  return {
    executor: { query } as unknown as SqlExecutor,
    query
  };
}

const parameterizedQuery: ParameterizedQuery = {
  text: "SELECT id, label FROM property_types WHERE code = $1",
  values: ["ROOM"]
};

describe("RM-009 parameterized SQL executor", () => {
  it("forwards text and values as one query object, including an empty values array", async () => {
    const pgQuery = vi.fn().mockResolvedValue(result([]));
    const executor = createSqlExecutor({ query: pgQuery } as never);

    await executor.query(parameterizedQuery);
    await executor.query({ text: "SELECT 1", values: [] });

    expect(pgQuery).toHaveBeenNthCalledWith(1, {
      text: parameterizedQuery.text,
      values: ["ROOM"]
    });
    expect(pgQuery).toHaveBeenNthCalledWith(2, {
      text: "SELECT 1",
      values: []
    });
  });
});

describe("RM-009 repository primitives", () => {
  const rows: TestRow[] = [
    { id: 2, label: "second" },
    { id: 1, label: "first" }
  ];
  const copyRow = (row: Readonly<TestRow>): TestRow => ({ id: row.id, label: row.label });

  it("queryMany preserves row order and maps each row exactly once", async () => {
    const { executor } = executorReturning(result(rows));
    const mapper = vi.fn((row: TestRow) => `${row.id}:${row.label}`);

    await expect(queryMany(executor, parameterizedQuery, mapper)).resolves.toEqual(["2:second", "1:first"]);
    expect(mapper).toHaveBeenCalledTimes(2);
    expect(mapper.mock.calls[0]).toStrictEqual([rows[0]]);
    expect(mapper.mock.calls[1]).toStrictEqual([rows[1]]);
  });

  it("queryOptional handles zero and one row", async () => {
    const empty = executorReturning(result<TestRow>([])).executor;
    const one = executorReturning(result([rows[0]])).executor;

    await expect(queryOptional(empty, parameterizedQuery, copyRow)).resolves.toBeNull();
    await expect(queryOptional(one, parameterizedQuery, (row) => row.label)).resolves.toBe("second");
  });

  it("queryOptional rejects multiple rows with a sanitized invariant", async () => {
    const { executor } = executorReturning(result(rows));

    await expect(queryOptional(executor, parameterizedQuery, copyRow)).rejects.toBeInstanceOf(RepositoryInvariantError);
    await expect(queryOptional(executor, parameterizedQuery, copyRow)).rejects.not.toThrow(parameterizedQuery.text);
    await expect(queryOptional(executor, parameterizedQuery, copyRow)).rejects.not.toThrow("ROOM");
  });

  it("queryExactlyOne handles exactly one row and rejects every other cardinality", async () => {
    const empty = executorReturning(result<TestRow>([])).executor;
    const one = executorReturning(result([rows[0]])).executor;
    const many = executorReturning(result(rows)).executor;

    await expect(queryExactlyOne(one, parameterizedQuery, (row) => row.id)).resolves.toBe(2);
    await expect(queryExactlyOne(empty, parameterizedQuery, copyRow)).rejects.toBeInstanceOf(RepositoryInvariantError);
    await expect(queryExactlyOne(many, parameterizedQuery, copyRow)).rejects.toBeInstanceOf(RepositoryInvariantError);
  });

  it("executeCommand returns affected rows and rejects unavailable row counts", async () => {
    const affected = executorReturning(result<TestRow>([], 3)).executor;
    const unavailable = executorReturning(result<TestRow>([], null)).executor;

    await expect(executeCommand(affected, parameterizedQuery)).resolves.toBe(3);
    await expect(executeCommand(unavailable, parameterizedQuery)).rejects.toBeInstanceOf(RepositoryInvariantError);
  });
});
