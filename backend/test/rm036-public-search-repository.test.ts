import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { createPublicListingSearchRepository } from "../src/modules/listings/public-listing-search-repository.js";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { validatePublicListingSearch } from "../src/modules/listings/public-listing-search-validation.js";

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

class RecordingExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    return result([] as Row[]);
  }
}

describe("RM-036 public listing search repository", () => {
  it("uses inclusive exact-coordinate bounds with the shared public filters and aggregate projection", async () => {
    const executor = new RecordingExecutor();
    const search = validatePublicListingSearch({
      north: "11",
      south: "10",
      east: "107",
      west: "106",
      q: "district",
      minMonthlyRent: "4000000",
      amenities: "wifi,parking",
      pageSize: "2",
      sort: "rent_asc"
    });
    if (search.mode !== "bounds") throw new Error("Expected bounds search.");

    await createPublicListingSearchRepository(executor).findBoundsPage(search);
    const query = executor.queries[0]!;
    expect(query.text).toContain("l.status = 'APPROVED'");
    expect(query.text).toContain("landlord.is_active = true");
    expect(query.text).toContain("l.latitude >= $1");
    expect(query.text).toContain("l.latitude <= $2");
    expect(query.text).toContain("l.longitude >= $3");
    expect(query.text).toContain("l.longitude <= $4");
    expect(query.text).toContain("NOT EXISTS");
    expect(query.text).toContain("unnest($7::text[])");
    expect(query.text).toContain("LEFT JOIN LATERAL");
    expect(query.text).toContain("jsonb_agg");
    expect(query.text).toContain("LIMIT $8");
    expect(query.text).not.toContain("distance_km");
    expect(query.text).not.toMatch(/COUNT\s*\(/i);
    expect(query.values).toStrictEqual([10, 11, 106, 107, "district", 4_000_000, ["PARKING", "WIFI"], 3, 0]);
  });

  it("calculates one staged Haversine distance after the bounding-box candidate filter", async () => {
    const executor = new RecordingExecutor();
    const search = validatePublicListingSearch({
      centerLat: "10.772341",
      centerLng: "106.697912",
      radiusKm: "5",
      page: "2",
      pageSize: "3"
    });
    if (search.mode !== "radius") throw new Error("Expected radius search.");

    await createPublicListingSearchRepository(executor).findRadiusPage(search, {
      south: 10.7,
      north: 10.8,
      west: 106.6,
      east: 106.8
    });
    const query = executor.queries[0]!;
    expect(query.text).toContain("filtered_candidates AS");
    expect(query.text).toContain("distance_candidates AS MATERIALIZED");
    expect(query.text).toContain("radius_matches AS");
    expect(query.text).toContain("WHERE distance_km <= $7");
    expect(query.text).toContain("ORDER BY distance_km ASC, id ASC");
    expect(query.text).toContain("LEAST(\n              1.0,");
    expect(query.text.match(/6371\.0088/g)).toHaveLength(1);
    expect(query.text.match(/AS distance_km/g)).toHaveLength(1);
    expect(query.text).toContain("pc.distance_km");
    expect(query.text).toContain("LEFT JOIN LATERAL");
    expect(query.text).toContain("jsonb_agg");
    expect(query.text).not.toMatch(/COUNT\s*\(/i);
    expect(query.values.slice(0, 7)).toStrictEqual([10.7, 10.8, 106.6, 106.8, 10.772341, 106.697912, 5]);
  });
});
