import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createAdminUserRepository } from "../src/modules/users/admin-user-repository.js";

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

const row = {
  id: 42,
  role: "LANDLORD",
  email: "owner@example.com",
  phone_e164: "+84901234567",
  is_active: false,
  created_at: "2026-08-09T07:15:00.000Z",
  updated_at: "2026-08-10T07:15:00.000Z"
};

function fixture(...results: QueryResult<QueryResultRow>[]) {
  const queries: ParameterizedQuery[] = [];
  const executor = {
    query: vi.fn(async (query: ParameterizedQuery) => {
      queries.push(query);
      const next = results.shift();
      if (!next) throw new Error("Unexpected query.");
      return next;
    })
  } as unknown as SqlExecutor;
  return { repository: createAdminUserRepository(executor), queries };
}

function normalized(query: ParameterizedQuery): string {
  return query.text.replace(/\s+/g, " ").trim();
}

describe("RM-043 admin user repository", () => {
  it("uses one narrow parameterized list query with optional filters and stable limit-plus-one ordering", async () => {
    const test = fixture(result([row]));
    await expect(
      test.repository.findUserPage({ role: "LANDLORD", isActive: false, limit: 21, offset: 40 })
    ).resolves.toMatchObject([{ id: 42, role: "LANDLORD", isActive: false }]);
    expect(test.queries).toHaveLength(1);
    expect(test.queries[0]!.values).toStrictEqual(["LANDLORD", false, 21, 40]);
    const sql = normalized(test.queries[0]!);
    expect(sql).toContain("($1::user_role IS NULL OR role = $1::user_role)");
    expect(sql).toContain("($2::boolean IS NULL OR is_active = $2::boolean)");
    expect(sql).toContain("ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4");
    expect(sql).not.toMatch(/password_hash|COUNT\s*\(|SELECT \*|\b(?:INSERT|UPDATE|DELETE|FOR UPDATE)\b/i);
  });

  it("locks one target with the canonical profile projection", async () => {
    const test = fixture(result([row]));
    await expect(test.repository.lockActivationTarget(42)).resolves.toMatchObject({ id: 42, isActive: false });
    expect(test.queries[0]!.values).toStrictEqual([42]);
    const sql = normalized(test.queries[0]!);
    expect(sql).toContain("FROM users WHERE id = $1 FOR UPDATE");
    expect(sql).not.toMatch(/password_hash|JOIN|listings|favorites|moderation_history/i);
  });

  it("updates only a distinct allowed locked role and returns one mapped profile", async () => {
    const test = fixture(result([{ ...row, is_active: true }]));
    await expect(
      test.repository.updateActivation({ userId: 42, isActive: true, lockedRole: "LANDLORD" })
    ).resolves.toMatchObject({ id: 42, role: "LANDLORD", isActive: true });
    expect(test.queries[0]!.values).toStrictEqual([42, true, "LANDLORD"]);
    const sql = normalized(test.queries[0]!);
    expect(sql).toContain("SET is_active = $2, updated_at = CURRENT_TIMESTAMP");
    expect(sql).toContain("role = $3::user_role");
    expect(sql).toContain("role IN ('TENANT', 'LANDLORD')");
    expect(sql).toContain("is_active IS DISTINCT FROM $2");
    expect(sql).not.toMatch(/password_hash|listings|favorites|moderation_history/i);
  });

  it("treats a zero-row meaningful update as a repository invariant failure", async () => {
    const test = fixture(result([]));
    await expect(
      test.repository.updateActivation({ userId: 42, isActive: true, lockedRole: "LANDLORD" })
    ).rejects.toMatchObject({ name: "RepositoryInvariantError" });
  });
});
