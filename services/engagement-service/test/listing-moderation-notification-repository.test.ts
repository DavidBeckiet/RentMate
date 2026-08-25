import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { ParameterizedQuery, SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createContactRepository } from "../src/modules/contact/repositories/contact-repository.js";

function result<Row extends QueryResultRow>(rowCount = 1): QueryResult<Row> {
  return { command: "INSERT", rowCount, oid: 0, fields: [], rows: [] };
}

test("inserts listing moderation notifications with a history-based dedupe key", async () => {
  const queries: ParameterizedQuery[] = [];
  const executor: SqlExecutor = {
    query: async (query) => {
      queries.push(query);
      return result();
    }
  };

  await createContactRepository().createListingModerationNotification(executor, {
    recipientId: 30,
    listingId: 42,
    moderationHistoryId: 301,
    eventType: "LISTING_REJECTED"
  });

  assert.deepEqual(queries[0]?.values, [
    30,
    "LISTING_REJECTED",
    42,
    "/landlord/listings/42",
    "listing-moderation:301"
  ]);
  assert.match(queries[0]?.text ?? "", /ON CONFLICT DO NOTHING/);
  assert.match(queries[0]?.text ?? "", /dedupe_key/);
});
