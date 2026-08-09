import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createPublicListingDetailRepository } from "../src/modules/listings/public-listing-detail-repository.js";

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

const detailRow = {
  id: 42,
  title: "Studio",
  description: "Description",
  monthly_rent: "7500000",
  room_area_sqm: "28.50",
  area_name: "District 1",
  latitude: 10.772549,
  longitude: 106.697912,
  property_type_code: "STUDIO",
  property_type_label: "Studio",
  amenities: [{ code: "WIFI", label: "Wi-Fi" }],
  images: [{ url: "https://cdn.example.test/a.webp", altText: null, displayOrder: 1 }],
  updated_at: "2026-07-29T07:15:00.000Z"
};

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  rows: QueryResultRow[] = [];

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    return result(this.rows as Row[]);
  }
}

describe("RM-037 public listing detail repository", () => {
  it("runs one parameterized public-safe aggregate statement for the base path", async () => {
    const executor = new Executor();
    executor.rows = [detailRow];
    const found = await createPublicListingDetailRepository(executor).findPublicDetailById(42, false);

    expect(found?.landlordContact).toBeNull();
    expect(executor.queries).toHaveLength(1);
    const query = executor.queries[0]!;
    expect(query.values).toStrictEqual([42]);
    expect(query.text).toMatch(/WHERE l\.id = \$1[\s\S]*l\.status = 'APPROVED'[\s\S]*landlord\.is_active = true/);
    expect(query.text).toMatch(/JOIN users AS landlord[\s\S]*landlord\.id = l\.landlord_id/);
    expect(query.text).toMatch(/pt\.code AS property_type_code[\s\S]*pt\.label AS property_type_label/);
    expect(query.text).toMatch(/jsonb_agg[\s\S]*ORDER BY a\.label ASC, a\.code ASC/);
    expect(query.text).toMatch(/jsonb_agg[\s\S]*ORDER BY li\.display_order ASC, li\.id ASC/);
    expect(query.text).not.toMatch(
      /landlord\.email|phone_e164|address_text|cloudinary_public_id|moderation_history|password_hash|COUNT\s*\(|FOR UPDATE/i
    );
    expect(query.text).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
  });

  it("runs one tenant statement that adds exactly the two narrow contact columns", async () => {
    const executor = new Executor();
    executor.rows = [{ ...detailRow, landlord_email: "owner@example.com", landlord_phone: "+84901234567" }];
    const found = await createPublicListingDetailRepository(executor).findPublicDetailById(42, true);

    expect(found?.landlordContact).toStrictEqual({ email: "owner@example.com", phone: "+84901234567" });
    expect(executor.queries).toHaveLength(1);
    const query = executor.queries[0]!;
    expect(query.text.match(/landlord\.email AS landlord_email/g)).toHaveLength(1);
    expect(query.text.match(/landlord\.phone_e164 AS landlord_phone/g)).toHaveLength(1);
    expect(query.text).not.toMatch(/landlord\.id\s+AS|l\.landlord_id\s+AS|address_text|cloudinary_public_id/i);
    expect(query.values).toStrictEqual([42]);
  });

  it("returns null from one query when the target is not publicly visible", async () => {
    const executor = new Executor();
    await expect(createPublicListingDetailRepository(executor).findPublicDetailById(99, false)).resolves.toBeNull();
    expect(executor.queries).toHaveLength(1);
  });
});
