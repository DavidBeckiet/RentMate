import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import type { ParameterizedQuery, SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createLeadReminderNotificationRepository } from "../src/modules/leads/repositories/lead-reminder-notification-repository.js";

function result<Row extends QueryResultRow>(rows: readonly Row[], rowCount: number): QueryResult<Row> {
  return { command: "TEST", rowCount, oid: 0, rows: [...rows], fields: [] };
}

test("creates one notification per due open reminder and marks each reminder atomically", async () => {
  const queries: ParameterizedQuery[] = [];
  const executor: SqlExecutor = {
    query: async <Row extends QueryResultRow>(query: ParameterizedQuery) => {
      queries.push(query);
      if (queries.length === 1) {
        return result<Row>(
          [
            { inquiry_id: 7, landlord_id: 20 },
            { inquiry_id: 8, landlord_id: 21 }
          ] as Row[],
          2
        );
      }
      return result<Row>([], 1);
    }
  };

  const processed = await createLeadReminderNotificationRepository().createDueNotifications(
    executor,
    new Date("2026-08-25T00:00:00.000Z"),
    100
  );

  assert.equal(processed, 2);
  assert.equal(queries.length, 5);
  assert.match(queries[0]?.text ?? "", /due_notification_sent_at IS NULL/);
  assert.match(queries[0]?.text ?? "", /FOR UPDATE OF reminders, inquiries SKIP LOCKED/);
  assert.deepEqual(queries[1]?.values, [20, "LEAD_REMINDER_DUE", 7, "/inquiries/7"]);
  assert.deepEqual(queries[2]?.values, [7]);
  assert.deepEqual(queries[3]?.values, [21, "LEAD_REMINDER_DUE", 8, "/inquiries/8"]);
  assert.deepEqual(queries[4]?.values, [8]);
});
