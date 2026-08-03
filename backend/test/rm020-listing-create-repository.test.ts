import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createListingCreateRepository } from "../src/modules/listings/listing-create-repository.js";

function result<Row extends QueryResultRow>(rows: Row[], command = "SELECT", rowCount = rows.length): QueryResult<Row> {
  return { command, rowCount, oid: 0, fields: [], rows };
}

class QueuedExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  readonly #results: QueryResult<QueryResultRow>[];

  constructor(...results: QueryResult<QueryResultRow>[]) {
    this.#results = results;
  }

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    const next = this.#results.shift();
    if (!next) {
      throw new Error("Unexpected RM-020 repository query.");
    }
    return next as QueryResult<Row>;
  }
}

const createdRow = {
  id: 42,
  status: "DRAFT",
  title: "Studio",
  description: null,
  monthly_rent: "7500000",
  room_area_sqm: "28.50",
  address_text: null,
  area_name: "District 1",
  latitude: 10.772341,
  longitude: 106.697912,
  created_at: "2026-08-04T01:00:00.000Z",
  updated_at: "2026-08-04T01:00:00.000Z"
};

describe("RM-020 listing-create repository", () => {
  it("resolves one active property type with narrow parameterized SQL", async () => {
    const executor = new QueuedExecutor(result([{ id: 2, code: "STUDIO", label: "Studio" }]));
    const repository = createListingCreateRepository(executor);

    await expect(repository.findActivePropertyTypeByCode("STUDIO")).resolves.toStrictEqual({
      id: 2,
      code: "STUDIO",
      label: "Studio"
    });
    expect(executor.queries).toHaveLength(1);
    expect(executor.queries[0]?.values).toStrictEqual(["STUDIO"]);
    expect(executor.queries[0]?.text).toMatch(/FROM property_types/);
    expect(executor.queries[0]?.text).toMatch(/is_active = true/);
    expect(executor.queries[0]?.text).not.toMatch(/SELECT\s+\*/);
  });

  it("resolves all amenities with one set-based ordered query and skips an empty request", async () => {
    const executor = new QueuedExecutor(
      result([
        { id: 3, code: "FURNISHED", label: "Furnished" },
        { id: 2, code: "WIFI", label: "Wi-Fi" }
      ])
    );
    const repository = createListingCreateRepository(executor);

    await expect(repository.findActiveAmenitiesByCodes([])).resolves.toStrictEqual([]);
    await expect(repository.findActiveAmenitiesByCodes(["WIFI", "FURNISHED"])).resolves.toHaveLength(2);
    expect(executor.queries).toHaveLength(1);
    expect(executor.queries[0]?.values).toStrictEqual([["WIFI", "FURNISHED"]]);
    expect(executor.queries[0]?.text).toMatch(/code = ANY\(\$1::text\[\]\)/);
    expect(executor.queries[0]?.text).toMatch(/ORDER BY\s+label ASC,\s+code ASC/s);
  });

  it("uses one explicit parameterized DRAFT insert and maps its returned row", async () => {
    const executor = new QueuedExecutor(result([createdRow], "INSERT", 1));
    const repository = createListingCreateRepository(executor);
    const listing = await repository.insertDraft({
      landlordId: 17,
      propertyTypeId: 2,
      title: "Studio",
      description: null,
      monthlyRent: 7_500_000,
      roomAreaSqm: 28.5,
      addressText: null,
      areaName: "District 1",
      latitude: 10.772341,
      longitude: 106.697912
    });

    expect(listing).toMatchObject({ id: 42, status: "DRAFT", monthlyRent: 7_500_000, roomAreaSqm: 28.5 });
    expect(executor.queries).toHaveLength(1);
    expect(executor.queries[0]?.text).toMatch(/INSERT INTO listings/);
    expect(executor.queries[0]?.text).toMatch(/VALUES \(\$1, \$2, 'DRAFT', \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10\)/);
    expect(executor.queries[0]?.values).toStrictEqual([
      17,
      2,
      "Studio",
      null,
      7_500_000,
      28.5,
      null,
      "District 1",
      10.772341,
      106.697912
    ]);
    expect(executor.queries[0]?.text).not.toMatch(/UPDATE|DELETE|listing_images|moderation_history|favorites/);
  });

  it("skips empty junction writes and uses one fixed UNNEST insert for nonempty IDs", async () => {
    const executor = new QueuedExecutor(result([], "INSERT", 2));
    const repository = createListingCreateRepository(executor);

    await repository.insertListingAmenities(42, []);
    await repository.insertListingAmenities(42, [2, 3]);

    expect(executor.queries).toHaveLength(1);
    expect(executor.queries[0]?.values).toStrictEqual([42, [2, 3]]);
    expect(executor.queries[0]?.text).toMatch(/INSERT INTO listing_amenities/);
    expect(executor.queries[0]?.text).toMatch(/UNNEST\(\$2::smallint\[\]\)/);
    expect(executor.queries[0]?.text).not.toMatch(/\$3|VALUES\s*\(/);
  });
});
