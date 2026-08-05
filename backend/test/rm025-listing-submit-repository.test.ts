import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { RepositoryInvariantError } from "../src/db/repository-primitives.js";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createListingSubmitRepository } from "../src/modules/listings/listing-submit-repository.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}

const completeRow = {
  id: 7,
  status: "DRAFT",
  property_type_present: true,
  property_type_known: true,
  property_type_code: "STUDIO",
  property_type_label: "Studio",
  title: "Title",
  description: "Description",
  monthly_rent: "5000000",
  room_area_sqm: "25.50",
  address_text: "Address",
  area_name: "Area",
  latitude: 10.75,
  longitude: 106.67,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z"
};

class Recorder implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  constructor(private readonly malformed = false) {}
  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FOR UPDATE OF l")) {
      return result([
        this.malformed ? { ...completeRow, property_type_known: "yes" } : completeRow
      ] as unknown as Row[]);
    }
    if (query.text.includes("NOT EXISTS")) return result([{ result: true }] as unknown as Row[]);
    if (query.text.includes("SELECT EXISTS")) return result([{ result: true }] as unknown as Row[]);
    if (query.text.includes("UPDATE listings")) return result([] as Row[], 1);
    throw new Error("Unexpected repository query");
  }
}

describe("RM-025 listing submit repository", () => {
  it("locks the owner row and maps completeness/reference projections without active filtering", async () => {
    const executor = new Recorder();
    const listing = await createListingSubmitRepository(executor).lockOwnedListing(7, 9);
    expect(listing).toMatchObject({ id: 7, status: "DRAFT", propertyTypePresent: true, propertyTypeKnown: true });
    expect(executor.queries[0]!.values).toStrictEqual([7, 9]);
    expect(executor.queries[0]!.text).toMatch(/WHERE l\.id = \$1 AND l\.landlord_id = \$2 FOR UPDATE OF l/);
    expect(executor.queries[0]!.text).toContain("property_type_present");
    expect(executor.queries[0]!.text).toContain("property_type_known");
    expect(executor.queries[0]!.text).not.toMatch(/is_active/);
  });

  it("uses bounded set-based amenity and persisted-image existence queries", async () => {
    const executor = new Recorder();
    const repository = createListingSubmitRepository(executor);
    expect(await repository.areAmenityReferencesKnown(7)).toBe(true);
    expect(await repository.hasPersistedImage(7)).toBe(true);
    expect(executor.queries[0]!.text).toMatch(/NOT EXISTS[\s\S]*LEFT JOIN amenities/);
    expect(executor.queries[1]!.text).toMatch(/SELECT EXISTS[\s\S]*FROM listing_images/);
    expect(executor.queries.every((query) => query.values.length === 1 && query.values[0] === 7)).toBe(true);
  });

  it("uses one fixed conditional status/timestamp update with locked source parameters", async () => {
    const executor = new Recorder();
    expect(await createListingSubmitRepository(executor).transitionToPending(7, 9, "HIDDEN")).toBe(true);
    expect(executor.queries[0]!.values).toStrictEqual([7, 9, "HIDDEN"]);
    expect(executor.queries[0]!.text).toBe(
      "UPDATE listings SET status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND landlord_id = $2 AND status = $3::listing_status"
    );
    expect(executor.queries[0]!.text).not.toMatch(/moderation_history|listing_images|listing_amenities/i);
  });

  it("fails closed on malformed mapped results", async () => {
    await expect(createListingSubmitRepository(new Recorder(true)).lockOwnedListing(7, 9)).rejects.toBeInstanceOf(
      RepositoryInvariantError
    );

    const malformedBoolean: SqlExecutor = {
      async query<Row extends QueryResultRow>(): Promise<QueryResult<Row>> {
        return result([{ result: "true" }] as unknown as Row[]);
      }
    };
    await expect(createListingSubmitRepository(malformedBoolean).areAmenityReferencesKnown(7)).rejects.toBeInstanceOf(
      RepositoryInvariantError
    );

    const malformedCommand: SqlExecutor = {
      async query<Row extends QueryResultRow>(): Promise<QueryResult<Row>> {
        return result([] as Row[], 2);
      }
    };
    await expect(
      createListingSubmitRepository(malformedCommand).transitionToPending(7, 9, "DRAFT")
    ).rejects.toBeInstanceOf(RepositoryInvariantError);
  });
});
