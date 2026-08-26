import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { ParameterizedQuery, SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createPublicListingSearchRepository } from "../src/modules/listings/repositories/public-listing-search-repository.js";
import type {
  BoundsPublicListingSearch,
  OrdinaryPublicListingSearch,
  RadiusPublicListingSearch
} from "../src/modules/listings/validations/public-listing-search-validation.js";
import { validatePublicListingSearch } from "../src/modules/listings/validations/public-listing-search-validation.js";
import type { RadiusBoundingBox } from "../src/modules/listings/public-listing-search-bounding-box.js";

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

class QueryRecorder implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    return result([]);
  }
}

function ordinary(overrides: Partial<OrdinaryPublicListingSearch> = {}): OrdinaryPublicListingSearch {
  return {
    mode: "ordinary",
    q: null,
    areaName: null,
    minMonthlyRent: null,
    maxMonthlyRent: null,
    minRoomAreaSqm: null,
    maxRoomAreaSqm: null,
    minOccupants: null,
    propertyType: null,
    amenities: [],
    page: 1,
    pageSize: 20,
    offset: 0,
    sort: "newest",
    ...overrides
  };
}

const bounds: BoundsPublicListingSearch = {
  ...ordinary(),
  mode: "bounds",
  north: 11,
  south: 10,
  east: 107,
  west: 106
};

const radius: RadiusPublicListingSearch = {
  ...ordinary(),
  mode: "radius",
  centerLat: 10.75,
  centerLng: 106.67,
  radiusKm: 5,
  sort: "distance_asc"
};

const boundingBox: RadiusBoundingBox = {
  north: 10.8,
  south: 10.7,
  east: 106.8,
  west: 106.6
};

test("validates all supported public search sorting modes", () => {
  assert.equal(validatePublicListingSearch({}).sort, "newest");
  assert.equal(validatePublicListingSearch({ sort: "rent_asc" }).sort, "rent_asc");
  assert.equal(validatePublicListingSearch({ sort: "rent_desc" }).sort, "rent_desc");
  const boundsQuery = { north: "11", south: "10", east: "107", west: "106" };
  assert.equal(validatePublicListingSearch(boundsQuery).sort, "newest");
  assert.equal(validatePublicListingSearch({ ...boundsQuery, sort: "rent_asc" }).sort, "rent_asc");
  const radiusQuery = { centerLat: "10.75", centerLng: "106.67", radiusKm: "5" };
  assert.equal(validatePublicListingSearch(radiusQuery).sort, "distance_asc");
  assert.throws(() => validatePublicListingSearch({ ...radiusQuery, sort: "rent_asc" }), /invalid data/i);
  assert.throws(() => validatePublicListingSearch({ sort: "distance_asc" }), /invalid data/i);
});

test("uses deterministic price and newest tie-breakers for ordinary and bounds search", async () => {
  const cases = [
    ["newest", /ORDER BY l\.updated_at DESC, l\.id DESC/, /ORDER BY pc\.updated_at DESC, pc\.id DESC/],
    ["rent_asc", /ORDER BY l\.monthly_rent ASC, l\.id ASC/, /ORDER BY pc\.monthly_rent ASC, pc\.id ASC/],
    ["rent_desc", /ORDER BY l\.monthly_rent DESC, l\.id DESC/, /ORDER BY pc\.monthly_rent DESC, pc\.id DESC/]
  ] as const;

  for (const [sort, candidateOrder, pageOrder] of cases) {
    const ordinaryExecutor = new QueryRecorder();
    await createPublicListingSearchRepository(ordinaryExecutor).findOrdinaryPage(ordinary({ sort }));
    assert.match(ordinaryExecutor.queries[0]?.text ?? "", candidateOrder);
    assert.match(ordinaryExecutor.queries[0]?.text ?? "", pageOrder);

    const boundsExecutor = new QueryRecorder();
    await createPublicListingSearchRepository(boundsExecutor).findBoundsPage({ ...bounds, sort });
    assert.match(boundsExecutor.queries[0]?.text ?? "", candidateOrder);
    assert.match(boundsExecutor.queries[0]?.text ?? "", pageOrder);
  }
});

test("uses distance and id tie-breakers for radius search", async () => {
  const executor = new QueryRecorder();
  await createPublicListingSearchRepository(executor).findRadiusPage(radius, boundingBox);

  const query = executor.queries[0];
  assert.match(query?.text ?? "", /ORDER BY distance_km ASC, id ASC/);
  assert.match(query?.text ?? "", /ORDER BY pc\.distance_km ASC, pc\.id ASC/);
  assert.deepEqual(query?.values.slice(-2), [21, 0]);
});
