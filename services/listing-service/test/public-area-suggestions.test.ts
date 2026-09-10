import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { ParameterizedQuery, SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createLookupRepository } from "../src/modules/listings/repositories/lookup-repository.js";

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

test("public area suggestions are distinct, bounded, deterministic, and public-safe", async () => {
  const queries: ParameterizedQuery[] = [];
  const executor: SqlExecutor = {
    async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
      queries.push(query);
      return result([{ area_name: "Binh Thanh" }, { area_name: "Quan 1" }] as unknown as Row[]);
    }
  };

  const areas = await createLookupRepository(executor).findPublicAreaNames([11, 12]);

  assert.deepEqual(areas, ["Binh Thanh", "Quan 1"]);
  assert.equal(queries.length, 1);
  assert.match(queries[0]?.text ?? "", /SELECT DISTINCT btrim\(l\.area_name\)/);
  assert.match(queries[0]?.text ?? "", /l\.status = 'APPROVED'/);
  assert.match(queries[0]?.text ?? "", /l\.business_status IN \('AVAILABLE', 'UNKNOWN'\)/);
  assert.match(queries[0]?.text ?? "", /l\.landlord_id = ANY\(\$1::integer\[\]\)/);
  assert.match(queries[0]?.text ?? "", /LIMIT \$2/);
  assert.deepEqual(queries[0]?.values, [[11, 12], 100]);
});
