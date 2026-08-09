import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createPublicListingSearchRepository } from "../src/modules/listings/public-listing-search-repository.js";
import type { OrdinaryPublicListingSearch } from "../src/modules/listings/public-listing-search-validation.js";

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  rows: QueryResultRow[] = [];
  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    return result(this.rows as Row[]);
  }
}

function search(overrides: Partial<OrdinaryPublicListingSearch> = {}): OrdinaryPublicListingSearch {
  return {
    mode: "ordinary",
    q: null,
    areaName: null,
    minMonthlyRent: null,
    maxMonthlyRent: null,
    minRoomAreaSqm: null,
    maxRoomAreaSqm: null,
    propertyType: null,
    amenities: [],
    page: 1,
    pageSize: 20,
    offset: 0,
    sort: "newest",
    ...overrides
  };
}

describe("RM-035 public listing search repository", () => {
  it("uses one combined, inactive-inclusive known-code query", async () => {
    const executor = new Executor();
    executor.rows = [
      { kind: "property_type", code: "STUDIO" },
      { kind: "amenity", code: "WIFI" }
    ];
    const known = await createPublicListingSearchRepository(executor).findKnownSearchCodes({
      propertyType: "STUDIO",
      amenities: ["WIFI"]
    });
    expect(known).toStrictEqual({ propertyTypes: ["STUDIO"], amenities: ["WIFI"] });
    expect(executor.queries).toHaveLength(1);
    expect(executor.queries[0]?.text).toMatch(/FROM property_types[\s\S]*UNION ALL[\s\S]*FROM amenities/);
    expect(executor.queries[0]?.text).not.toMatch(/is_active/);
    expect(executor.queries[0]?.values).toStrictEqual([["STUDIO"], ["WIFI"]]);
  });

  it("builds one narrow aggregate ordinary query with literal public visibility and no private projection", async () => {
    const executor = new Executor();
    await createPublicListingSearchRepository(executor).findOrdinaryPage(
      search({
        q: "%_\\",
        areaName: "District",
        minMonthlyRent: 1,
        maxMonthlyRent: 9_000_000,
        minRoomAreaSqm: 10,
        maxRoomAreaSqm: 50,
        propertyType: "STUDIO",
        amenities: ["PARKING", "WIFI"],
        page: 2,
        pageSize: 3,
        offset: 3,
        sort: "rent_asc"
      })
    );
    expect(executor.queries).toHaveLength(1);
    const query = executor.queries[0]!;
    expect(query.text).toMatch(/l\.status = 'APPROVED'[\s\S]*landlord\.is_active = true/);
    expect(query.text).toMatch(/JOIN users AS landlord ON landlord\.id = l\.landlord_id/);
    expect(query.text).toMatch(/strpos\(lower\(l\.title\), lower\(\$1\)\) > 0/);
    expect(query.text).toMatch(/strpos\(lower\(l\.area_name\), lower\(\$1\)\) > 0/);
    expect(query.text).toMatch(/NOT EXISTS[\s\S]*unnest\(\$8::text\[\]\)[\s\S]*NOT EXISTS/);
    expect(query.text).toMatch(/ORDER BY l\.monthly_rent ASC, l\.id ASC/);
    expect(query.text).toMatch(/ORDER BY pc\.monthly_rent ASC, pc\.id ASC/);
    expect(query.text).toMatch(/LEFT JOIN LATERAL[\s\S]*ORDER BY display_order ASC, id ASC[\s\S]*jsonb_agg/);
    expect(query.text).not.toMatch(
      /address_text|description|password_hash|cloudinary_public_id|moderation_history|COUNT\s*\(|Haversine|distance_km|radians\(/i
    );
    expect(query.values).toStrictEqual(["%_\\", "District", 1, 9_000_000, 10, 50, "STUDIO", ["PARKING", "WIFI"], 4, 3]);
  });

  it.each([
    ["newest", /ORDER BY l\.updated_at DESC, l\.id DESC/],
    ["rent_asc", /ORDER BY l\.monthly_rent ASC, l\.id ASC/],
    ["rent_desc", /ORDER BY l\.monthly_rent DESC, l\.id DESC/]
  ] as const)("hard-codes %s order and limit-plus-one", async (sort, pattern) => {
    const executor = new Executor();
    await createPublicListingSearchRepository(executor).findOrdinaryPage(search({ sort, pageSize: 100 }));
    expect(executor.queries[0]?.text).toMatch(pattern);
    expect(executor.queries[0]?.values).toStrictEqual([101, 0]);
  });
});
