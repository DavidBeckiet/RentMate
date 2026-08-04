import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createListingUpdateRepository } from "../src/modules/listings/listing-update-repository.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}
class Recorder implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    return result(
      [],
      query.text.includes("UPDATE listings") ? 1 : query.text.includes("INSERT INTO listing_amenities") ? 2 : 0
    ) as QueryResult<Row>;
  }
}

describe("RM-023 listing update repository", () => {
  it("uses owner-scoped row locking and set-wise controlled lookups", async () => {
    const executor = new Recorder();
    const repository = createListingUpdateRepository(executor);
    await repository.lockOwnedListing(7, 9);
    await repository.findCurrentAmenities(7);
    await repository.findActivePropertyTypeByCode("STUDIO");
    await repository.findAmenitiesByCodes(["WIFI", "AC"]);
    expect(executor.queries[0]!.text).toMatch(/WHERE l\.id = \$1 AND l\.landlord_id = \$2 FOR UPDATE OF l/);
    expect(executor.queries[0]!.values).toStrictEqual([7, 9]);
    expect(executor.queries[3]!.text).toContain("ANY($1::text[])");
    expect(executor.queries[3]!.text).not.toContain("is_active = true");
  });

  it("uses one fixed conditional update and full set-based amenity replacement", async () => {
    const executor = new Recorder();
    const repository = createListingUpdateRepository(executor);
    const updated = await repository.updateListingContent({
      listingId: 7,
      landlordId: 9,
      expectedStatus: "APPROVED",
      status: "PENDING",
      propertyTypeId: 2,
      title: "T",
      description: "D",
      monthlyRent: 1,
      roomAreaSqm: 2,
      addressText: "A",
      areaName: "N",
      latitude: 10,
      longitude: 20
    });
    await repository.replaceAmenities(7, [2, 3]);
    expect(updated).toBe(true);
    expect(executor.queries[0]!.text).toMatch(/updated_at = CURRENT_TIMESTAMP[\s\S]*status = \$3::listing_status/);
    expect(executor.queries[0]!.text).not.toMatch(/updated_at\s*=/gim.toString());
    expect(executor.queries[1]!.text).toMatch(/DELETE FROM listing_amenities/);
    expect(executor.queries[2]!.text).toContain("UNNEST($2::smallint[])");
  });

  it("deletes only when the desired amenity set is empty", async () => {
    const executor = new Recorder();
    await createListingUpdateRepository(executor).replaceAmenities(7, []);
    expect(executor.queries).toHaveLength(1);
    expect(executor.queries[0]!.text).toContain("DELETE FROM listing_amenities");
  });
});
