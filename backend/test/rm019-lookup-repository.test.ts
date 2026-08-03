import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createLookupRepository } from "../src/modules/listings/lookup-repository.js";

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

class CapturingExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];

  constructor(private readonly rows: readonly QueryResultRow[]) {}

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    return queryResult(this.rows as Row[]);
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function expectNarrowLookupQuery(query: ParameterizedQuery, table: "property_types" | "amenities"): void {
  const sql = normalizeSql(query.text);
  expect(sql).toMatch(/^SELECT code, label FROM /);
  expect(sql).toContain(`FROM ${table}`);
  expect(sql).toContain("WHERE is_active = true");
  expect(sql).toContain("ORDER BY label ASC, code ASC");
  expect(sql).not.toMatch(/SELECT \*|\b(?:INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|FOR UPDATE|LIMIT|OFFSET)\b/i);
  expect(sql).not.toContain(table === "property_types" ? "FROM amenities" : "FROM property_types");
  expect(query.values).toStrictEqual([]);
}

describe("RM-019 lookup repository", () => {
  it("executes two explicit active-only, label/code-ordered queries with safe mapping", async () => {
    const executor = new CapturingExecutor([{ code: "STUDIO", label: "Studio", id: 3, is_active: true }]);
    const repository = createLookupRepository(executor);

    const propertyTypes = await repository.findActivePropertyTypes();
    const amenities = await repository.findActiveAmenities();

    expect(executor.queries).toHaveLength(2);
    expectNarrowLookupQuery(executor.queries[0] as ParameterizedQuery, "property_types");
    expectNarrowLookupQuery(executor.queries[1] as ParameterizedQuery, "amenities");
    expect(propertyTypes).toStrictEqual([{ code: "STUDIO", label: "Studio" }]);
    expect(amenities).toStrictEqual([{ code: "STUDIO", label: "Studio" }]);
    expect(Object.keys(propertyTypes[0] ?? {})).toStrictEqual(["code", "label"]);
  });

  it("returns empty arrays for empty database results", async () => {
    const repository = createLookupRepository(new CapturingExecutor([]));

    await expect(repository.findActivePropertyTypes()).resolves.toStrictEqual([]);
    await expect(repository.findActiveAmenities()).resolves.toStrictEqual([]);
  });
});
