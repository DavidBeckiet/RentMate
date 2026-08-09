import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createFavoriteRepository } from "../src/modules/favorites/favorite-repository.js";

function result<Row extends QueryResultRow>(rows: Row[], command = "SELECT", rowCount = rows.length): QueryResult<Row> {
  return { command, rowCount, oid: 0, fields: [], rows };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  rows: QueryResultRow[] = [];
  command = "SELECT";
  rowCount: number | null = null;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    return result(this.rows as Row[], this.command, this.rowCount ?? this.rows.length);
  }
}

describe("RM-039 favorite repository", () => {
  it("uses one public-safe limit-plus-one collection query in favorite order", async () => {
    const executor = new Executor();
    await createFavoriteRepository(executor).findPage({ tenantId: 7, pageSize: 20, offset: 40 });

    expect(executor.queries).toHaveLength(1);
    const query = executor.queries[0]!;
    expect(query.values).toStrictEqual([7, 21, 40]);
    expect(query.text).toMatch(/f\.tenant_id = \$1/);
    expect(query.text).toMatch(/l\.status = 'APPROVED'[\s\S]*landlord\.is_active = true/);
    expect(query.text).toMatch(/ORDER BY f\.created_at DESC, f\.listing_id DESC/);
    expect(query.text).toMatch(/ORDER BY pc\.favorite_created_at DESC, pc\.id DESC/);
    expect(query.text).toMatch(/LEFT JOIN LATERAL[\s\S]*listing_images[\s\S]*jsonb_agg/);
    expect(query.text).not.toMatch(
      /COUNT\s*\(|address_text|description|password_hash|cloudinary_public_id|moderation_history|landlord\.email|landlord\.phone/i
    );
  });

  it.each([
    [true, true],
    [true, false],
    [false, false]
  ])("uses one visibility-gated conflict-safe insert (%s, %s)", async (isVisible, wasInserted) => {
    const executor = new Executor();
    executor.rows = [{ is_visible: isVisible, was_inserted: wasInserted }];
    await expect(createFavoriteRepository(executor).ensurePresent(7, 42)).resolves.toStrictEqual({
      isVisible,
      wasInserted
    });
    expect(executor.queries).toHaveLength(1);
    expect(executor.queries[0]?.values).toStrictEqual([7, 42]);
    expect(executor.queries[0]?.text).toMatch(
      /WITH visible_target AS MATERIALIZED[\s\S]*l\.status = 'APPROVED'[\s\S]*landlord\.is_active = true[\s\S]*INSERT INTO favorites/
    );
    expect(executor.queries[0]?.text).toMatch(/ON CONFLICT \(tenant_id, listing_id\)[\s\S]*DO NOTHING/);
    expect(executor.queries[0]?.text).not.toMatch(/DO UPDATE|BEGIN|COMMIT/);
  });

  it("deletes by tenant and listing in one simple idempotent statement", async () => {
    const executor = new Executor();
    executor.command = "DELETE";
    executor.rowCount = 0;
    await expect(createFavoriteRepository(executor).ensureAbsent(7, 42)).resolves.toBe(0);
    expect(executor.queries).toHaveLength(1);
    expect(executor.queries[0]?.values).toStrictEqual([7, 42]);
    expect(executor.queries[0]?.text).toMatch(/DELETE FROM favorites[\s\S]*tenant_id = \$1[\s\S]*listing_id = \$2/);
    expect(executor.queries[0]?.text).not.toMatch(/JOIN|SELECT|BEGIN|COMMIT/i);
  });
});
