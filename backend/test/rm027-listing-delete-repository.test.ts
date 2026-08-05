import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import { RepositoryInvariantError } from "../src/db/repository-primitives.js";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createListingDeleteRepository } from "../src/modules/listings/listing-delete-repository.js";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}

interface RecorderOptions {
  readonly lockRows?: QueryResultRow[];
  readonly historyRows?: QueryResultRow[];
  readonly publicIdRows?: QueryResultRow[];
  readonly deleteCount?: number | null;
}

class Recorder implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];

  constructor(private readonly options: RecorderOptions = {}) {}

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FOR UPDATE OF l")) {
      return result((this.options.lockRows ?? [{ id: 7, status: "DRAFT" }]) as Row[]);
    }
    if (query.text.includes("SELECT EXISTS")) {
      return result((this.options.historyRows ?? [{ has_moderation_history: false }]) as Row[]);
    }
    if (query.text.includes("SELECT cloudinary_public_id")) {
      return result((this.options.publicIdRows ?? []) as Row[]);
    }
    if (query.text.includes("DELETE FROM listings")) {
      return {
        ...result([] as Row[], 0),
        rowCount: this.options.deleteCount === undefined ? 1 : this.options.deleteCount
      };
    }
    throw new Error("Unexpected RM-027 repository query");
  }
}

describe("RM-027 listing delete repository", () => {
  it("locks only an owner-scoped listing ID and status", async () => {
    const executor = new Recorder();
    const target = await createListingDeleteRepository(executor).lockOwnedListing(7, 9);
    expect(target).toStrictEqual({ id: 7, status: "DRAFT" });
    expect(Object.isFrozen(target)).toBe(true);
    expect(executor.queries[0]).toStrictEqual({
      text: "SELECT l.id, l.status FROM listings AS l WHERE l.id = $1 AND l.landlord_id = $2 FOR UPDATE OF l",
      values: [7, 9]
    });
    expect(executor.queries[0]!.text).not.toMatch(/landlord_id\s*,|title|address|latitude|amenit|image|history/i);
  });

  it("returns null when absent and fails closed on malformed or multiple lock rows", async () => {
    await expect(
      createListingDeleteRepository(new Recorder({ lockRows: [] })).lockOwnedListing(7, 9)
    ).resolves.toBeNull();
    for (const lockRows of [
      [{ id: 0, status: "DRAFT" }],
      [{ id: 7, status: "UNKNOWN" }],
      [
        { id: 7, status: "DRAFT" },
        { id: 8, status: "DRAFT" }
      ]
    ]) {
      await expect(
        createListingDeleteRepository(new Recorder({ lockRows })).lockOwnedListing(7, 9)
      ).rejects.toBeInstanceOf(RepositoryInvariantError);
    }
  });

  it("uses one listing-scoped EXISTS query and requires exactly one boolean row", async () => {
    const executor = new Recorder({ historyRows: [{ has_moderation_history: true }] });
    await expect(createListingDeleteRepository(executor).hasModerationHistory(7)).resolves.toBe(true);
    expect(executor.queries[0]).toStrictEqual({
      text: "SELECT EXISTS (SELECT 1 FROM moderation_history WHERE listing_id = $1) AS has_moderation_history",
      values: [7]
    });
    for (const historyRows of [
      [],
      [{ has_moderation_history: "false" }],
      [{ has_moderation_history: false }, { has_moderation_history: true }]
    ]) {
      await expect(
        createListingDeleteRepository(new Recorder({ historyRows })).hasModerationHistory(7)
      ).rejects.toBeInstanceOf(RepositoryInvariantError);
    }
  });

  it("captures an ordered immutable set of public IDs without unrelated image data", async () => {
    const executor = new Recorder({
      publicIdRows: [{ cloudinary_public_id: "rentmate/a" }, { cloudinary_public_id: "rentmate/b" }]
    });
    const publicIds = await createListingDeleteRepository(executor).findCloudinaryPublicIds(7);
    expect(publicIds).toStrictEqual(["rentmate/a", "rentmate/b"]);
    expect(Object.isFrozen(publicIds)).toBe(true);
    expect(executor.queries[0]).toStrictEqual({
      text: "SELECT cloudinary_public_id FROM listing_images WHERE listing_id = $1 ORDER BY id ASC",
      values: [7]
    });
    expect(executor.queries[0]!.text).not.toMatch(/secure_url|display_order|byte_size/);
    const empty = await createListingDeleteRepository(new Recorder()).findCloudinaryPublicIds(7);
    expect(empty).toStrictEqual([]);
    expect(Object.isFrozen(empty)).toBe(true);
  });

  it.each([null, 1, "", " ", " padded", "padded "])("rejects malformed public ID %#", async (value) => {
    await expect(
      createListingDeleteRepository(
        new Recorder({ publicIdRows: [{ cloudinary_public_id: value }] })
      ).findCloudinaryPublicIds(7)
    ).rejects.toBeInstanceOf(RepositoryInvariantError);
  });

  it("conditionally deletes only the owned DRAFT listing and maps zero versus one", async () => {
    const executor = new Recorder({ deleteCount: 1 });
    await expect(createListingDeleteRepository(executor).deleteOwnedDraft(7, 9)).resolves.toBe(true);
    expect(executor.queries[0]).toStrictEqual({
      text: "DELETE FROM listings WHERE id = $1 AND landlord_id = $2 AND status = 'DRAFT'",
      values: [7, 9]
    });
    expect(executor.queries[0]!.text.match(/DELETE FROM/g)).toHaveLength(1);
    expect(executor.queries[0]!.text).not.toMatch(
      /listing_images|listing_amenities|favorites|moderation_history|BEGIN|COMMIT/
    );
    await expect(createListingDeleteRepository(new Recorder({ deleteCount: 0 })).deleteOwnedDraft(7, 9)).resolves.toBe(
      false
    );
  });

  it.each([null, -1, 2])("rejects invalid delete affected count %#", async (deleteCount) => {
    await expect(
      createListingDeleteRepository(new Recorder({ deleteCount })).deleteOwnedDraft(7, 9)
    ).rejects.toBeInstanceOf(RepositoryInvariantError);
  });
});
