import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { RepositoryInvariantError } from "../src/db/repository-primitives.js";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import {
  createListingLifecycleActionRepository,
  type ListingAvailabilityTransition
} from "../src/modules/listings/listing-lifecycle-action-repository.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}

class Recorder implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  constructor(
    private readonly lockRows: QueryResultRow[] = [{ id: 7, status: "APPROVED" }],
    private readonly updateCount = 1
  ) {}

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FOR UPDATE OF l")) return result(this.lockRows as Row[]);
    if (query.text.includes("UPDATE listings")) return result([] as Row[], this.updateCount);
    throw new Error("Unexpected RM-026 repository query");
  }
}

describe("RM-026 listing lifecycle action repository", () => {
  it("locks only the owner-scoped listing ID and status", async () => {
    const executor = new Recorder();
    const listing = await createListingLifecycleActionRepository(executor).lockOwnedListing(7, 9);
    expect(listing).toStrictEqual({ id: 7, status: "APPROVED" });
    expect(Object.isFrozen(listing)).toBe(true);
    expect(executor.queries[0]).toStrictEqual({
      text: "SELECT l.id, l.status FROM listings AS l WHERE l.id = $1 AND l.landlord_id = $2 FOR UPDATE OF l",
      values: [7, 9]
    });
    expect(executor.queries[0]!.text).not.toMatch(/title|address|latitude|property|amenit|image|history/i);
  });

  it.each([
    [{ expectedStatus: "APPROVED", nextStatus: "INACTIVE" }, ["INACTIVE", 7, 9, "APPROVED"]],
    [{ expectedStatus: "INACTIVE", nextStatus: "APPROVED" }, ["APPROVED", 7, 9, "INACTIVE"]]
  ] as const)("uses the fixed correlated transition %#", async (transition, values) => {
    const executor = new Recorder();
    expect(
      await createListingLifecycleActionRepository(executor).transitionStatus(
        7,
        9,
        transition as ListingAvailabilityTransition
      )
    ).toBe(true);
    expect(executor.queries[0]!.values).toStrictEqual(values);
    expect(executor.queries[0]!.text).toBe(
      "UPDATE listings SET status = $1::listing_status, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND landlord_id = $3 AND status = $4::listing_status"
    );
    expect(executor.queries[0]!.text).not.toMatch(/moderation_history|listing_images|listing_amenities|title/i);
  });

  it("exposes zero versus one affected row and rejects malformed counts", async () => {
    expect(
      await createListingLifecycleActionRepository(new Recorder([], 0)).transitionStatus(7, 9, {
        expectedStatus: "APPROVED",
        nextStatus: "INACTIVE"
      })
    ).toBe(false);
    await expect(
      createListingLifecycleActionRepository(new Recorder([], 2)).transitionStatus(7, 9, {
        expectedStatus: "INACTIVE",
        nextStatus: "APPROVED"
      })
    ).rejects.toBeInstanceOf(RepositoryInvariantError);
  });

  it("returns null when absent and fails closed on malformed or multiple lock rows", async () => {
    await expect(createListingLifecycleActionRepository(new Recorder([])).lockOwnedListing(7, 9)).resolves.toBeNull();
    for (const rows of [
      [{ id: 0, status: "APPROVED" }],
      [{ id: 7, status: "UNKNOWN" }],
      [
        { id: 7, status: "APPROVED" },
        { id: 8, status: "INACTIVE" }
      ]
    ]) {
      await expect(
        createListingLifecycleActionRepository(new Recorder(rows)).lockOwnedListing(7, 9)
      ).rejects.toBeInstanceOf(RepositoryInvariantError);
    }
  });
});
