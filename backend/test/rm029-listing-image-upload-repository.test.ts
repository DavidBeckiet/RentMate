import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { RepositoryInvariantError } from "../src/db/repository-primitives.js";
import {
  createListingImageUploadRepository,
  findSmallestUnusedDisplayOrder
} from "../src/modules/listings/listing-image-upload-repository.js";

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

const imageRow = {
  id: 31,
  secure_url: "https://provider.test/image.jpg",
  format: "jpg",
  width: 1200,
  height: 800,
  byte_size: 100_000,
  display_order: 3,
  alt_text: "Room",
  created_at: new Date("2026-08-08T00:00:00Z")
};

describe("RM-029 listing image upload repository", () => {
  it("uses a bounded owner-scoped preliminary count query and safely maps it", async () => {
    const executor = new QueueExecutor([result([{ id: 7, image_count: 3 }])]);
    const repository = createListingImageUploadRepository(executor);
    await expect(repository.findOwnedImageCount(7, 9)).resolves.toStrictEqual({ listingId: 7, imageCount: 3 });
    expect(executor.queries[0]?.values).toStrictEqual([7, 9]);
    expect(executor.queries[0]?.text).toMatch(
      /COUNT\(\*\).*listing_images.*l\.id = \$1.*l\.landlord_id = \$2.*LIMIT 1/i
    );
    expect(executor.queries[0]?.text).not.toMatch(/FOR UPDATE/i);
  });

  it.each([
    { id: 0, image_count: 0 },
    { id: 7, image_count: -1 },
    { id: 7, image_count: 1.5 }
  ])("rejects malformed preliminary count rows", async (row) => {
    const repository = createListingImageUploadRepository(new QueueExecutor([result([row])]));
    await expect(repository.findOwnedImageCount(7, 9)).rejects.toBeInstanceOf(RepositoryInvariantError);
  });

  it("locks by owner and queries all slots in deterministic order", async () => {
    const executor = new QueueExecutor([
      result([{ id: 7, status: "INACTIVE" }]),
      result([
        { id: 2, display_order: 1 },
        { id: 4, display_order: 3 }
      ])
    ]);
    const repository = createListingImageUploadRepository(executor);
    await expect(repository.lockOwnedListing(7, 9)).resolves.toStrictEqual({ id: 7, status: "INACTIVE" });
    await expect(repository.findCurrentImageSlots(7)).resolves.toStrictEqual([
      { id: 2, displayOrder: 1 },
      { id: 4, displayOrder: 3 }
    ]);
    expect(executor.queries[0]?.text).toMatch(/l\.landlord_id = \$2 FOR UPDATE OF l/i);
    expect(executor.queries[0]?.values).toStrictEqual([7, 9]);
    expect(executor.queries[1]?.text).toMatch(/ORDER BY display_order ASC, id ASC/i);
    expect(executor.queries[1]?.values).toStrictEqual([7]);
  });

  it.each([
    [[{ id: 0, display_order: 1 }]],
    [[{ id: 1, display_order: 0 }]],
    [[{ id: 1, display_order: 9 }]],
    [
      [
        { id: 1, display_order: 1 },
        { id: 2, display_order: 1 }
      ]
    ]
  ])("rejects malformed or duplicate slot rows", async (rows) => {
    const repository = createListingImageUploadRepository(new QueueExecutor([result(rows)]));
    await expect(repository.findCurrentImageSlots(7)).rejects.toBeInstanceOf(RepositoryInvariantError);
  });

  it.each([
    [[], 1],
    [[1], 2],
    [[1, 2, 4], 3],
    [[2, 3], 1],
    [[1, 2, 3, 4, 5, 6, 7], 8],
    [[1, 2, 3, 4, 5, 6, 7, 8], null]
  ] as const)("chooses the smallest unused slot for %j", (orders, expected) => {
    expect(findSmallestUnusedDisplayOrder(orders.map((displayOrder, index) => ({ id: index + 1, displayOrder })))).toBe(
      expected
    );
  });

  it("inserts exact provider metadata and maps only the owner-safe representation", async () => {
    const executor = new QueueExecutor([result([imageRow])]);
    const repository = createListingImageUploadRepository(executor);
    const image = await repository.insertImageMetadata({
      listingId: 7,
      uploaded: {
        publicId: "private/provider-id",
        secureUrl: imageRow.secure_url,
        format: "jpg",
        width: 1200,
        height: 800,
        byteSize: 100_000
      },
      displayOrder: 3,
      altText: "Room"
    });
    expect(executor.queries[0]?.values).toStrictEqual([
      7,
      "private/provider-id",
      imageRow.secure_url,
      "jpg",
      1200,
      800,
      100_000,
      3,
      "Room"
    ]);
    expect(executor.queries[0]?.text).toMatch(/INSERT INTO listing_images.*RETURNING id, secure_url/i);
    expect(executor.queries[0]?.text).not.toMatch(/moderation_history|DELETE|display_order\s*=|BEGIN|COMMIT/i);
    expect(image).not.toHaveProperty("cloudinaryPublicId");
    expect(image).toMatchObject({ id: 31, displayOrder: 3, altText: "Room" });
  });

  it.each([
    [1, true],
    [0, false]
  ] as const)("conditionally updates status and timestamp for affected count %s", async (rowCount, expected) => {
    const executor = new QueueExecutor([result([], rowCount)]);
    const repository = createListingImageUploadRepository(executor);
    await expect(
      repository.updateListingAfterImageAddition({
        listingId: 7,
        landlordId: 9,
        currentStatus: "DRAFT",
        resultingStatus: "DRAFT"
      })
    ).resolves.toBe(expected);
    expect(executor.queries[0]?.text).toMatch(/SET status = \$1::listing_status, updated_at = CURRENT_TIMESTAMP/i);
    expect(executor.queries[0]?.text).toMatch(/id = \$2 AND landlord_id = \$3 AND status = \$4::listing_status/i);
    expect(executor.queries[0]?.values).toStrictEqual(["DRAFT", 7, 9, "DRAFT"]);
    expect(executor.queries[0]?.text).not.toMatch(/moderation_history|listing_images|BEGIN|COMMIT/i);
  });

  it.each([2, null])("rejects malformed affected counts", async (rowCount) => {
    const repository = createListingImageUploadRepository(new QueueExecutor([result([], rowCount)]));
    await expect(
      repository.updateListingAfterImageAddition({
        listingId: 7,
        landlordId: 9,
        currentStatus: "DRAFT",
        resultingStatus: "DRAFT"
      })
    ).rejects.toBeInstanceOf(RepositoryInvariantError);
  });
});
