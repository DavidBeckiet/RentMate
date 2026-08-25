import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { ParameterizedQuery, SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createPublicListingSearchRepository } from "../src/modules/listings/repositories/public-listing-search-repository.js";

const publicSearch = {
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
  sort: "newest"
} as const;

test("public search maps verification to a boolean badge in one batched Identity lookup", async () => {
  const queries: ParameterizedQuery[] = [];
  const row = {
    id: 42,
    landlord_id: 7,
    business_status: "AVAILABLE",
    title: "Studio sáng",
    monthly_rent: "7500000",
    room_area_sqm: "28.00",
    max_occupants: null,
    area_name: "Quận 1",
    latitude: 10.772,
    longitude: 106.698,
    property_type_code: "STUDIO",
    property_type_label: "Studio",
    amenities: [],
    cover_image_url: "https://example.com/cover.webp",
    cover_image_alt_text: null,
    cover_image_display_order: 1,
    updated_at: "2026-08-25T00:00:00.000Z"
  };
  const executor: SqlExecutor = {
    async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
      queries.push(query);
      return { rows: [row] as unknown as Row[], command: "SELECT", rowCount: 1, oid: 0, fields: [] };
    }
  };
  const requestedIds: number[][] = [];
  const repository = createPublicListingSearchRepository(executor, {
    loadVerifiedLandlordIds: async (ids) => {
      requestedIds.push([...ids]);
      return [7];
    }
  });

  const [summary] = await repository.findOrdinaryPage(publicSearch);

  assert.equal(summary?.landlordVerified, true);
  assert.equal("landlord_id" in (summary ?? {}), false);
  assert.deepEqual(requestedIds, [[7]]);
  assert.match(queries[0]?.text ?? "", /pc\.landlord_id/);
});
