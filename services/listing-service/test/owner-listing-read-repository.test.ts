import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { ParameterizedQuery, SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createOwnerListingReadRepository } from "../src/modules/listings/repositories/owner-listing-read-repository.js";

function createRepositoryResult(value: boolean) {
  const queries: ParameterizedQuery[] = [];
  const executor: SqlExecutor = {
    async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
      queries.push(query);
      return {
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [{ has_ever_approved_listing: value }] as unknown as Row[]
      };
    }
  };

  return { repository: createOwnerListingReadRepository(executor), queries };
}

test("approval history is owner-scoped and remains true after the listing's current status changes", async () => {
  const { repository, queries } = createRepositoryResult(true);

  assert.equal(await repository.hasEverApprovedListing(27), true);

  const query = queries[0];
  assert.ok(query);
  assert.match(query.text, /SELECT EXISTS/i);
  assert.match(query.text, /FROM listings AS owned_listing/i);
  assert.match(query.text, /JOIN moderation_history AS history/i);
  assert.match(query.text, /owned_listing\.landlord_id = \$1/i);
  assert.match(query.text, /history\.new_status = 'APPROVED'/i);
  assert.doesNotMatch(query.text, /owned_listing\.(?:status|business_status|availability)/i);
  assert.doesNotMatch(query.text, /LIMIT|OFFSET|page|businessStatus/i);
  assert.deepEqual(query.values, [27]);
});

test("approval history is false when no owned listing has an APPROVED history event", async () => {
  const { repository, queries } = createRepositoryResult(false);

  assert.equal(await repository.hasEverApprovedListing(27), false);
  assert.deepEqual(queries[0]?.values, [27]);
});
