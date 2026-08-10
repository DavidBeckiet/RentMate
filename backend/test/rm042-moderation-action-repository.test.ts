import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { RepositoryInvariantError } from "../src/db/repository-primitives.js";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createModerationActionRepository } from "../src/modules/listings/moderation-action-repository.js";

const createdAt = "2026-08-10T00:00:00.000Z";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}

class Recorder implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  lockRows: QueryResultRow[] = [{ id: 42, status: "PENDING" }];
  updateCount = 1;
  historyRows: QueryResultRow[] = [
    {
      id: 301,
      listing_id: 42,
      admin_id: 3,
      previous_status: "PENDING",
      new_status: "REJECTED",
      reason: "reason",
      created_at: createdAt
    }
  ];

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FOR UPDATE OF l")) return result(this.lockRows as Row[]);
    if (query.text.startsWith("UPDATE listings")) return result([] as Row[], this.updateCount);
    if (query.text.startsWith("INSERT INTO moderation_history")) return result(this.historyRows as Row[]);
    throw new Error("Unexpected RM-042 repository query.");
  }
}

describe("RM-042 moderation action repository", () => {
  it("locks only listing id/status without ownership, visibility, or private data", async () => {
    const executor = new Recorder();
    await expect(createModerationActionRepository(executor).lockListing(42)).resolves.toStrictEqual({
      id: 42,
      status: "PENDING"
    });
    expect(executor.queries[0]).toStrictEqual({
      text: "SELECT l.id, l.status FROM listings AS l WHERE l.id = $1 FOR UPDATE OF l",
      values: [42]
    });
    expect(executor.queries[0]!.text).not.toMatch(/landlord|active|image|amenit|address|latitude|password/i);
  });

  it("uses a fixed expected-state update with CURRENT_TIMESTAMP", async () => {
    const executor = new Recorder();
    await expect(
      createModerationActionRepository(executor).transitionStatus(42, {
        expectedStatus: "PENDING",
        nextStatus: "APPROVED"
      })
    ).resolves.toBe(true);
    expect(executor.queries[0]).toStrictEqual({
      text: "UPDATE listings SET status = $2::listing_status, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = $3::listing_status",
      values: [42, "APPROVED", "PENDING"]
    });
  });

  it("inserts exactly the five history values and maps the seven-field return", async () => {
    const executor = new Recorder();
    const item = await createModerationActionRepository(executor).insertHistory({
      listingId: 42,
      adminId: 3,
      previousStatus: "PENDING",
      newStatus: "REJECTED",
      reason: "reason"
    });
    expect(item).toMatchObject({ id: 301, listingId: 42, adminId: 3, reason: "reason" });
    expect(executor.queries[0]!.values).toStrictEqual([42, 3, "PENDING", "REJECTED", "reason"]);
    expect(executor.queries[0]!.text).toBe(
      "INSERT INTO moderation_history (listing_id, admin_id, previous_status, new_status, reason) VALUES ($1, $2, $3::listing_status, $4::listing_status, $5) RETURNING id, listing_id, admin_id, previous_status, new_status, reason, created_at"
    );
    expect(executor.queries[0]!.text).not.toMatch(/UPDATE moderation_history|DELETE FROM moderation_history/i);
  });

  it("distinguishes zero update and rejects impossible counts or malformed rows", async () => {
    const zero = new Recorder();
    zero.updateCount = 0;
    await expect(
      createModerationActionRepository(zero).transitionStatus(42, {
        expectedStatus: "PENDING",
        nextStatus: "APPROVED"
      })
    ).resolves.toBe(false);
    const invalid = new Recorder();
    invalid.updateCount = 2;
    await expect(
      createModerationActionRepository(invalid).transitionStatus(42, {
        expectedStatus: "PENDING",
        nextStatus: "APPROVED"
      })
    ).rejects.toBeInstanceOf(RepositoryInvariantError);
    invalid.historyRows = [{ id: 1 }];
    await expect(
      createModerationActionRepository(invalid).insertHistory({
        listingId: 42,
        adminId: 3,
        previousStatus: "PENDING",
        newStatus: "APPROVED",
        reason: null
      })
    ).rejects.toThrow("Moderation history representation is invalid.");
  });

  it("returns null for missing lock and rejects malformed or duplicate lock rows", async () => {
    const missing = new Recorder();
    missing.lockRows = [];
    await expect(createModerationActionRepository(missing).lockListing(42)).resolves.toBeNull();
    for (const rows of [
      [{ id: 0, status: "PENDING" }],
      [{ id: 42, status: "UNKNOWN" }],
      [
        { id: 42, status: "PENDING" },
        { id: 43, status: "PENDING" }
      ]
    ]) {
      const executor = new Recorder();
      executor.lockRows = rows;
      await expect(createModerationActionRepository(executor).lockListing(42)).rejects.toBeInstanceOf(
        RepositoryInvariantError
      );
    }
  });

  it("never targets unrelated product tables", async () => {
    const executor = new Recorder();
    const repository = createModerationActionRepository(executor);
    await repository.lockListing(42);
    await repository.transitionStatus(42, { expectedStatus: "PENDING", nextStatus: "REJECTED" });
    await repository.insertHistory({
      listingId: 42,
      adminId: 3,
      previousStatus: "PENDING",
      newStatus: "REJECTED",
      reason: "reason"
    });
    expect(executor.queries.map((query) => query.text).join("\n")).not.toMatch(
      /favorites|users|listing_images|listing_amenities|property_types|amenities/i
    );
  });
});
