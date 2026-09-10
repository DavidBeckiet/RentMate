import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { ParameterizedQuery, SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createContactRepository } from "../src/modules/contact/repositories/contact-repository.js";

function result<Row extends QueryResultRow>(rowCount = 1): QueryResult<Row> {
  return { command: "INSERT", rowCount, oid: 0, fields: [], rows: [] };
}

function rowsResult<Row extends QueryResultRow>(rows: readonly Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows: [...rows] };
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

  assert.deepEqual(queries[0]?.values, [30, "LISTING_REJECTED", 42, "/landlord/listings/42", "listing-moderation:301"]);
  assert.match(queries[0]?.text ?? "", /ON CONFLICT DO NOTHING/);
  assert.match(queries[0]?.text ?? "", /dedupe_key/);
});

test("loads one authoritative latest message per inquiry with viewer-aware read state", async () => {
  const queries: ParameterizedQuery[] = [];
  const executor: SqlExecutor = {
    query: async (query) => {
      queries.push(query);
      return rowsResult([
        {
          inquiry_id: 9,
          id: 31,
          sender_role: "LANDLORD",
          body: "Phòng vẫn còn.",
          tenant_read_at: null,
          landlord_read_at: new Date("2026-09-04T10:00:00.000Z"),
          created_at: new Date("2026-09-04T10:00:00.000Z")
        }
      ]);
    }
  };

  const messages = await createContactRepository().listLatestMessages(executor, [9, 10], "TENANT");

  assert.deepEqual(queries[0]?.values, [[9, 10]]);
  assert.match(queries[0]?.text ?? "", /DISTINCT ON \(inquiry_id\)/);
  assert.match(queries[0]?.text ?? "", /created_at DESC, id DESC/);
  assert.deepEqual(messages, [
    {
      inquiryId: 9,
      id: 31,
      senderRole: "LANDLORD",
      body: "Phòng vẫn còn.",
      isRead: false,
      createdAt: "2026-09-04T10:00:00.000Z"
    }
  ]);
});
