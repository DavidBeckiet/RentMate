import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { RepositoryInvariantError } from "../src/db/repository-primitives.js";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createListingImageDeleteRepository } from "../src/modules/listings/listing-image-delete-repository.js";

function result<Row extends QueryResultRow>(rows: Row[], rowCount: number | null = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
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

describe("RM-030 listing image delete repository", () => {
  it("locks the owner-scoped listing and reads one bounded deterministic image aggregate", async () => {
    const executor = new QueueExecutor([
      result([{ id: 7, status: "INACTIVE" }]),
      result([
        { id: 31, cloudinary_public_id: "listing/31", display_order: 1 },
        { id: 33, cloudinary_public_id: "listing/33", display_order: 3 }
      ])
    ]);
    const repository = createListingImageDeleteRepository(executor);

    await expect(repository.lockOwnedListing(7, 9)).resolves.toStrictEqual({ id: 7, status: "INACTIVE" });
    await expect(repository.findCurrentImages(7)).resolves.toStrictEqual([
      { id: 31, cloudinaryPublicId: "listing/31", displayOrder: 1 },
      { id: 33, cloudinaryPublicId: "listing/33", displayOrder: 3 }
    ]);
    expect(executor.queries[0]?.text).toMatch(/l\.id = \$1 AND l\.landlord_id = \$2 FOR UPDATE OF l/i);
    expect(executor.queries[0]?.values).toStrictEqual([7, 9]);
    expect(executor.queries[1]?.text).toMatch(
      /SELECT id, cloudinary_public_id, display_order FROM listing_images WHERE listing_id = \$1 ORDER BY display_order ASC, id ASC/i
    );
    expect(executor.queries[1]?.values).toStrictEqual([7]);
  });

  it.each([
    [{ id: 0, cloudinary_public_id: "listing/31", display_order: 1 }],
    [{ id: 31, cloudinary_public_id: "", display_order: 1 }],
    [{ id: 31, cloudinary_public_id: " listing/31", display_order: 1 }],
    [{ id: 31, cloudinary_public_id: "listing/31", display_order: 0 }],
    [{ id: 31, cloudinary_public_id: "listing/31", display_order: 9 }]
  ])("rejects malformed image target row %j", async (row) => {
    const repository = createListingImageDeleteRepository(new QueueExecutor([result([row])]));
    await expect(repository.findCurrentImages(7)).rejects.toBeInstanceOf(RepositoryInvariantError);
  });

  it.each([
    [
      { id: 31, cloudinary_public_id: "listing/31", display_order: 1 },
      { id: 31, cloudinary_public_id: "listing/duplicate", display_order: 2 }
    ],
    [
      { id: 31, cloudinary_public_id: "listing/31", display_order: 1 },
      { id: 32, cloudinary_public_id: "listing/32", display_order: 1 }
    ]
  ])("rejects duplicate aggregate identity or display slots", async (...rows) => {
    const repository = createListingImageDeleteRepository(new QueueExecutor([result(rows)]));
    await expect(repository.findCurrentImages(7)).rejects.toBeInstanceOf(RepositoryInvariantError);
  });

  it("deletes exactly one nested image and never mutates display order or history", async () => {
    const executor = new QueueExecutor([result([], 1)]);
    const repository = createListingImageDeleteRepository(executor);
    await expect(repository.deleteListingImage(7, 31)).resolves.toBe(true);
    expect(executor.queries[0]).toStrictEqual({
      text: "DELETE FROM listing_images WHERE id = $1 AND listing_id = $2",
      values: [31, 7]
    });
    expect(executor.queries[0]?.text).not.toMatch(/UPDATE|display_order|moderation_history|BEGIN|COMMIT/i);
  });

  it("conditionally updates lifecycle state and timestamp even when status is unchanged", async () => {
    const executor = new QueueExecutor([result([], 1)]);
    const repository = createListingImageDeleteRepository(executor);
    await expect(
      repository.updateListingAfterImageDeletion({
        listingId: 7,
        landlordId: 9,
        currentStatus: "DRAFT",
        resultingStatus: "DRAFT"
      })
    ).resolves.toBe(true);
    expect(executor.queries[0]?.text).toMatch(/SET status = \$1::listing_status, updated_at = CURRENT_TIMESTAMP/i);
    expect(executor.queries[0]?.text).toMatch(/id = \$2 AND landlord_id = \$3 AND status = \$4::listing_status/i);
    expect(executor.queries[0]?.values).toStrictEqual(["DRAFT", 7, 9, "DRAFT"]);
    expect(executor.queries[0]?.text).not.toMatch(/listing_images|moderation_history|BEGIN|COMMIT/i);
  });

  it.each([0, 1] as const)("maps expected affected count %s", async (rowCount) => {
    const executor = new QueueExecutor([result([], rowCount), result([], rowCount)]);
    const repository = createListingImageDeleteRepository(executor);
    await expect(repository.deleteListingImage(7, 31)).resolves.toBe(rowCount === 1);
    await expect(
      repository.updateListingAfterImageDeletion({
        listingId: 7,
        landlordId: 9,
        currentStatus: "APPROVED",
        resultingStatus: "PENDING"
      })
    ).resolves.toBe(rowCount === 1);
  });

  it.each([2, null])("rejects malformed affected counts", async (rowCount) => {
    const deleteRepository = createListingImageDeleteRepository(new QueueExecutor([result([], rowCount)]));
    await expect(deleteRepository.deleteListingImage(7, 31)).rejects.toBeInstanceOf(RepositoryInvariantError);

    const updateRepository = createListingImageDeleteRepository(new QueueExecutor([result([], rowCount)]));
    await expect(
      updateRepository.updateListingAfterImageDeletion({
        listingId: 7,
        landlordId: 9,
        currentStatus: "APPROVED",
        resultingStatus: "PENDING"
      })
    ).rejects.toBeInstanceOf(RepositoryInvariantError);
  });
});
