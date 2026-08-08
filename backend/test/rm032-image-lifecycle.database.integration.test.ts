import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";
import { createPhase4DatabaseFixture, type Phase4DatabaseFixture } from "./helpers/listings-phase4-fixture.js";
import {
  createRecordingCloudinary,
  createRm032App,
  deleteRm032Image,
  insertRm032Image,
  insertRm032Listing,
  insertRm032ModerationHistory,
  rm032BaselineTimestamp,
  storedRm032History,
  storedRm032Images,
  storedRm032Listing,
  uploadRm032Image
} from "./helpers/rm032-image-fixture.js";

const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const lifecycleCases = [
  ["DRAFT", "DRAFT"],
  ["PENDING", "PENDING"],
  ["REJECTED", "DRAFT"],
  ["APPROVED", "PENDING"],
  ["INACTIVE", "PENDING"],
  ["HIDDEN", "HIDDEN"]
] as const satisfies readonly (readonly [ListingStatus, ListingStatus])[];

let fixture: Phase4DatabaseFixture;
let sequence = 0;

async function seedHistoryWhenApplicable(listingId: number, status: ListingStatus): Promise<void> {
  if (status !== "REJECTED" && status !== "HIDDEN") return;
  const adminId = await fixture.insertUser("ADMIN", ++sequence);
  await insertRm032ModerationHistory(fixture, listingId, adminId, status);
}

beforeAll(async () => {
  fixture = createPhase4DatabaseFixture(migrationDirectory);
  await fixture.rebuildSchema();
});

beforeEach(async () => {
  await fixture.resetData();
});

afterAll(async () => {
  await fixture.dropSchema();
  await fixture.close();
});

describe("RM-032 image lifecycle PostgreSQL verification", () => {
  it.each(lifecycleCases)("persists image-add lifecycle %s -> %s atomically", async (source, target) => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, source);
    await seedHistoryWhenApplicable(listingId, source);
    const historyBefore = await storedRm032History(fixture, listingId);
    const application = await createRm032App(fixture);
    const token = await fixture.signToken(landlordId);

    const response = await uploadRm032Image(application.app, token, listingId).expect(201);

    const listing = await storedRm032Listing(fixture, listingId);
    const images = await storedRm032Images(fixture, listingId);
    expect(listing?.status).toBe(target);
    expect(listing!.updated_at.getTime()).toBeGreaterThan(rm032BaselineTimestamp.getTime());
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      id: response.body.data.id,
      cloudinary_public_id: application.provider.uploads[0]!.publicId,
      display_order: 1,
      alt_text: "RM-032 upload"
    });
    expect(await storedRm032History(fixture, listingId)).toStrictEqual(historyBefore);
    expect(application.provider.uploads).toHaveLength(1);
    expect(application.provider.removals).toHaveLength(0);
  });

  it.each(lifecycleCases)("persists image-delete lifecycle %s -> %s atomically", async (source, target) => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, source);
    await seedHistoryWhenApplicable(listingId, source);
    const targetImage = await insertRm032Image(fixture, listingId, 2);
    const survivor = await insertRm032Image(fixture, listingId, 4);
    const historyBefore = await storedRm032History(fixture, listingId);
    let cleanupObservedCommittedState = false;
    const provider = createRecordingCloudinary({
      onRemove: async (publicId) => {
        const listing = await storedRm032Listing(fixture, listingId);
        const images = await storedRm032Images(fixture, listingId);
        expect(publicId).toBe(targetImage.publicId);
        expect(listing?.status).toBe(target);
        expect(images.map((image) => image.id)).toStrictEqual([survivor.id]);
        cleanupObservedCommittedState = true;
      }
    });
    const application = await createRm032App(fixture, { provider });
    const token = await fixture.signToken(landlordId);

    await deleteRm032Image(application.app, token, listingId, targetImage.id).expect(204);

    const listing = await storedRm032Listing(fixture, listingId);
    const images = await storedRm032Images(fixture, listingId);
    expect(listing?.status).toBe(target);
    expect(listing!.updated_at.getTime()).toBeGreaterThan(rm032BaselineTimestamp.getTime());
    expect(images).toStrictEqual([
      expect.objectContaining({ id: survivor.id, display_order: 4, cloudinary_public_id: survivor.publicId })
    ]);
    expect(await storedRm032History(fixture, listingId)).toStrictEqual(historyBefore);
    expect(provider.removals).toStrictEqual([targetImage.publicId]);
    expect(cleanupObservedCommittedState).toBe(true);
  });

  it.each([
    [[], 1],
    [[1], 2],
    [[1, 2], 3],
    [[1, 2, 4], 3],
    [[2, 3], 1],
    [[1, 3, 5, 7], 2],
    [[2, 3, 4, 5, 6, 7, 8], 1],
    [[1, 2, 3, 4, 5, 6, 7], 8]
  ] as const)("assigns the smallest unused slot for %j -> %s", async (initialOrders, expectedOrder) => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "DRAFT");
    for (const displayOrder of initialOrders) await insertRm032Image(fixture, listingId, displayOrder);
    const application = await createRm032App(fixture);
    const token = await fixture.signToken(landlordId);

    const response = await uploadRm032Image(application.app, token, listingId).expect(201);

    const orders = (await storedRm032Images(fixture, listingId)).map((image) => image.display_order);
    expect(response.body.data.displayOrder).toBe(expectedOrder);
    expect(orders).toContain(expectedOrder);
    expect(new Set(orders).size).toBe(orders.length);
    expect(orders.every((order) => order >= 1 && order <= 8)).toBe(true);
    expect(application.provider.removals).toHaveLength(0);
  });

  it.each([
    [[1, 2, 3], 2, [1, 3]],
    [[1, 2, 4], 2, [1, 4]],
    [[2, 4, 7], 4, [2, 7]]
  ] as const)("preserves delete gaps %j minus %s -> %j", async (initialOrders, removedOrder, expectedOrders) => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "DRAFT");
    const images = [];
    for (const displayOrder of initialOrders) {
      images.push(await insertRm032Image(fixture, listingId, displayOrder));
    }
    const target = images.find((image) => image.displayOrder === removedOrder)!;
    const application = await createRm032App(fixture);
    const token = await fixture.signToken(landlordId);

    await deleteRm032Image(application.app, token, listingId, target.id).expect(204);

    expect((await storedRm032Images(fixture, listingId)).map((image) => image.display_order)).toStrictEqual(
      expectedOrders
    );
    expect(application.provider.removals).toStrictEqual([target.publicId]);
  });
});
