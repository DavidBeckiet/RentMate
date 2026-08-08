import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { RepositoryInvariantError } from "../src/db/repository-primitives.js";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createListingImageOrderRepository } from "../src/modules/listings/listing-image-order-repository.js";

function result<Row extends QueryResultRow>(rows: Row[], rowCount: number | null = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}

function image(id: number, displayOrder: number) {
  return {
    id,
    secure_url: `https://provider.test/${id}.jpg`,
    format: "jpg",
    width: 800,
    height: 600,
    byte_size: 1234,
    display_order: displayOrder,
    alt_text: null,
    created_at: new Date("2026-01-01T00:00:00Z")
  };
}

class QueueExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  constructor(private readonly results: QueryResult<QueryResultRow>[]) {}
  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    const next = this.results.shift();
    if (!next) throw new Error("Unexpected query");
    return next as QueryResult<Row>;
  }
}

describe("RM-031 listing image-order repository", () => {
  it("locks by owner and reads the narrow ordered safe image projection", async () => {
    const executor = new QueueExecutor([result([{ id: 7, status: "APPROVED" }]), result([image(31, 1), image(33, 3)])]);
    const repository = createListingImageOrderRepository(executor);
    await expect(repository.lockOwnedListing(7, 9)).resolves.toStrictEqual({ id: 7, status: "APPROVED" });
    await expect(repository.findCurrentImages(7)).resolves.toMatchObject([
      { id: 31, displayOrder: 1 },
      { id: 33, displayOrder: 3 }
    ]);
    expect(executor.queries[0]).toStrictEqual({
      text: "SELECT l.id, l.status FROM listings AS l WHERE l.id = $1 AND l.landlord_id = $2 FOR UPDATE OF l",
      values: [7, 9]
    });
    expect(executor.queries[1]?.text).toContain("ORDER BY display_order ASC, id ASC");
    expect(executor.queries[1]?.text).not.toMatch(/cloudinary_public_id/i);
  });

  it.each([
    [image(31, 1), image(31, 2)],
    [image(31, 1), image(32, 1)],
    Array.from({ length: 9 }, (_, index) => image(index + 1, Math.min(index + 1, 8))),
    [{ ...image(31, 1), secure_url: "http://private" }]
  ])("rejects malformed current aggregates", async (...rows) => {
    const repository = createListingImageOrderRepository(new QueueExecutor([result(rows.flat())]));
    await expect(repository.findCurrentImages(7)).rejects.toBeInstanceOf(RepositoryInvariantError);
  });

  it("defers exactly the named constraint on the supplied executor", async () => {
    const executor = new QueueExecutor([result([], null)]);
    await createListingImageOrderRepository(executor).deferImageOrderUniqueness();
    expect(executor.queries).toStrictEqual([
      { text: "SET CONSTRAINTS uq_listing_images_listing_display_order DEFERRED", values: [] }
    ]);
  });

  it("uses one parameterized paired-unnest update and returns requested order", async () => {
    const executor = new QueueExecutor([result([image(33, 1), image(31, 2), image(32, 3)], 3)]);
    const images = await createListingImageOrderRepository(executor).reorderImages(7, [33, 31, 32]);
    expect(images?.map((item) => [item.id, item.displayOrder])).toStrictEqual([
      [33, 1],
      [31, 2],
      [32, 3]
    ]);
    expect(executor.queries[0]?.text).toMatch(/unnest\(\$2::integer\[\], \$3::smallint\[\]\)/i);
    expect(executor.queries[0]?.values).toStrictEqual([7, [33, 31, 32], [1, 2, 3]]);
    expect(executor.queries[0]?.text).not.toMatch(/\b31\b|\b32\b|\b33\b|cloudinary_public_id/i);
  });

  it("classifies a short valid update as a stale null result", async () => {
    const repository = createListingImageOrderRepository(new QueueExecutor([result([image(31, 1)], 1)]));
    await expect(repository.reorderImages(7, [31, 32])).resolves.toBeNull();
  });

  it("rejects malformed rows even when the affected count is short", async () => {
    const repository = createListingImageOrderRepository(
      new QueueExecutor([result([{ ...image(31, 1), secure_url: "http://private" }], 1)])
    );
    await expect(repository.reorderImages(7, [31, 32])).rejects.toBeInstanceOf(RepositoryInvariantError);
  });

  it.each([
    result([image(31, 1)], null),
    result([image(31, 1)], 2),
    result([image(31, 1), image(31, 2)], 2),
    result([image(31, 1), image(32, 1)], 2),
    result([image(31, 2), image(32, 1)], 2)
  ])("rejects malformed bulk results", async (queryResult) => {
    const repository = createListingImageOrderRepository(new QueueExecutor([queryResult]));
    await expect(repository.reorderImages(7, [31, 32])).rejects.toBeInstanceOf(RepositoryInvariantError);
  });

  it.each([0, 1] as const)("maps timestamp affected count %s without assigning status", async (rowCount) => {
    const executor = new QueueExecutor([result([], rowCount)]);
    await expect(
      createListingImageOrderRepository(executor).touchListingAfterImageReorder({
        listingId: 7,
        landlordId: 9,
        currentStatus: "HIDDEN"
      })
    ).resolves.toBe(rowCount === 1);
    expect(executor.queries[0]).toStrictEqual({
      text: "UPDATE listings SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND landlord_id = $2 AND status = $3::listing_status",
      values: [7, 9, "HIDDEN"]
    });
    expect(executor.queries[0]?.text).not.toMatch(/SET\s+status|moderation_history|BEGIN|COMMIT/i);
  });

  it.each([2, null])("rejects malformed timestamp affected count %s", async (rowCount) => {
    const repository = createListingImageOrderRepository(new QueueExecutor([result([], rowCount)]));
    await expect(
      repository.touchListingAfterImageReorder({ listingId: 7, landlordId: 9, currentStatus: "DRAFT" })
    ).rejects.toBeInstanceOf(RepositoryInvariantError);
  });
});
