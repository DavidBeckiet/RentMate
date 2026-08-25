import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { ParameterizedQuery, SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createSavedSearchNotificationRepository } from "../src/modules/saved-searches/repositories/saved-search-notification-repository.js";

function result<Row extends QueryResultRow>(rowCount: number): QueryResult<Row> {
  return { command: "INSERT", rowCount, oid: 0, rows: [], fields: [] };
}

test("matches active saved searches with all filter dimensions and deduplicates notifications", async () => {
  const queries: ParameterizedQuery[] = [];
  const executor: SqlExecutor = {
    query: async <Row extends QueryResultRow>(query: ParameterizedQuery) => {
      queries.push(query);
      return result<Row>(3);
    }
  };

  const created = await createSavedSearchNotificationRepository().createMatchingNotifications(executor, {
    id: 42,
    title: "Studio gần Quận 3",
    monthlyRent: 4_200_000,
    roomAreaSqm: 28,
    maxOccupants: 4,
    areaName: "Quận 3",
    latitude: 10.78,
    longitude: 106.69,
    propertyTypeCode: "ROOM",
    amenityCodes: ["WIFI", "PRIVATE_BATH"]
  });

  assert.equal(created, 3);
  assert.equal(queries.length, 1);
  assert.match(queries[0]?.text ?? "", /SAVED_SEARCH_MATCHED/);
  assert.match(queries[0]?.text ?? "", /ON CONFLICT \(dedupe_key\) WHERE dedupe_key IS NOT NULL DO NOTHING/);
  assert.match(queries[0]?.text ?? "", /searches\.amenity_codes <@/);
  assert.match(queries[0]?.text ?? "", /6371\.0088/);
  assert.deepEqual(queries[0]?.values, [
    42,
    "Studio gần Quận 3",
    4_200_000,
    28,
    4,
    "Quận 3",
    "ROOM",
    ["WIFI", "PRIVATE_BATH"],
    10.78,
    106.69
  ]);
});
