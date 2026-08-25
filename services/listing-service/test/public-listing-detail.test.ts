import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { ParameterizedQuery, SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createPublicListingDetailRepository } from "../src/modules/listings/repositories/public-listing-detail-repository.js";
import { createPublicListingDetailService } from "../src/modules/listings/services/public-listing-detail-service.js";

const similarRow = {
  id: 51,
  landlord_id: 7,
  business_status: "AVAILABLE",
  title: "Phòng sáng gần chợ",
  monthly_rent: "5500000",
  room_area_sqm: "24.00",
  max_occupants: 2,
  area_name: "Quận 3",
  latitude: 10.78,
  longitude: 106.69,
  property_type_code: "STUDIO",
  property_type_label: "Studio",
  amenities: [],
  cover_image_url: "https://example.com/room.webp",
  cover_image_alt_text: null,
  cover_image_display_order: 1,
  updated_at: "2026-08-25T00:00:00.000Z"
} as const;

test("similar public listings stay public-safe, capped, and batch landlord verification", async () => {
  const queries: ParameterizedQuery[] = [];
  const executor: SqlExecutor = {
    async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
      queries.push(query);
      return { rows: [similarRow] as unknown as Row[], command: "SELECT", rowCount: 1, oid: 0, fields: [] };
    }
  };
  const requestedActiveLandlordIds: number[][] = [];
  const requestedIds: number[][] = [];
  const repository = createPublicListingDetailRepository(executor, {
    loadActiveLandlordIds: async () => {
      requestedActiveLandlordIds.push([7]);
      return [7];
    },
    loadVerifiedLandlordIds: async (ids) => {
      requestedIds.push([...ids]);
      return [7];
    }
  });

  const result = await repository.findSimilarPublicListings(42, 3);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.landlordVerified, true);
  assert.equal("landlord_id" in (result[0] ?? {}), false);
  assert.deepEqual(requestedActiveLandlordIds, [[7]]);
  assert.deepEqual(requestedIds, [[7]]);
  assert.deepEqual(queries[0]?.values, [42, 3, [7]]);
  assert.doesNotMatch(queries[0]?.text ?? "", /JOIN users/);
  assert.match(queries[0]?.text ?? "", /current_listing\.status = 'APPROVED'/);
  assert.match(queries[0]?.text ?? "", /current_listing\.landlord_id = ANY\(\$3::integer\[\]\)/);
  assert.match(queries[0]?.text ?? "", /l\.area_name = current_listing\.area_name/);
  assert.match(queries[0]?.text ?? "", /LIMIT \$2/);
});

test("similar listing service keeps the UI contract at three suggestions", async () => {
  let requestedLimit = 0;
  const service = createPublicListingDetailService({
    findPublicDetailById: async () => null,
    findSimilarPublicListings: async (_listingId, limit) => {
      requestedLimit = limit;
      return Object.freeze([]);
    }
  });

  assert.deepEqual(await service.getSimilarListings(42), []);
  assert.equal(requestedLimit, 3);
});
