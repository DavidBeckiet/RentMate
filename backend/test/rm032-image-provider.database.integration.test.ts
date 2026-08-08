import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPhase4DatabaseFixture, type Phase4DatabaseFixture } from "./helpers/listings-phase4-fixture.js";
import {
  createRecordingCloudinary,
  createRecordingLogger,
  createRm032App,
  deleteRm032Image,
  hardDeleteRm032Listing,
  insertRm032Image,
  insertRm032Listing,
  insertRm032ModerationHistory,
  storedRm032History,
  storedRm032Images,
  storedRm032Listing,
  uploadRm032Image
} from "./helpers/rm032-image-fixture.js";

const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
let fixture: Phase4DatabaseFixture;
let sequence = 0;

async function listingChildCount(table: "listing_images" | "listing_amenities" | "favorites", listingId: number) {
  const result = await fixture.pool.query<{ count: number }>({
    text: `SELECT count(*)::integer AS count FROM ${table} WHERE listing_id = $1`,
    values: [listingId]
  });
  return result.rows[0]!.count;
}

function expectSafeWarnings(serializedWarnings: string, forbiddenPublicIds: readonly string[]): void {
  for (const publicId of forbiddenPublicIds) expect(serializedWarnings).not.toContain(publicId);
  expect(serializedWarnings).not.toMatch(
    /https?:\/\/|raw RM-032 provider|credential detail|secure.?url|authorization|jwt|cookie|password|secret|stack/i
  );
}

async function seedEightImages(listingId: number) {
  const images = [];
  for (let displayOrder = 1; displayOrder <= 8; displayOrder += 1) {
    images.push(await insertRm032Image(fixture, listingId, displayOrder));
  }
  return images;
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

describe("RM-032 hard-delete provider acceptance", () => {
  it("commits cascades before attempting every captured provider asset", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const tenantId = await fixture.insertUser("TENANT", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "DRAFT");
    const images = [await insertRm032Image(fixture, listingId, 1), await insertRm032Image(fixture, listingId, 2)];
    await fixture.pool.query({
      text: "INSERT INTO listing_amenities (listing_id, amenity_id) SELECT $1, id FROM amenities WHERE code = 'WIFI'",
      values: [listingId]
    });
    await fixture.pool.query({
      text: "INSERT INTO favorites (tenant_id, listing_id) VALUES ($1, $2)",
      values: [tenantId, listingId]
    });
    let committedObservations = 0;
    const provider = createRecordingCloudinary({
      onRemove: async () => {
        expect(await storedRm032Listing(fixture, listingId)).toBeNull();
        expect(await listingChildCount("listing_images", listingId)).toBe(0);
        committedObservations += 1;
      }
    });
    const application = await createRm032App(fixture, { provider });
    const token = await fixture.signToken(landlordId);

    await hardDeleteRm032Listing(application.app, token, listingId).expect(204);

    expect(await storedRm032Listing(fixture, listingId)).toBeNull();
    expect(await listingChildCount("listing_images", listingId)).toBe(0);
    expect(await listingChildCount("listing_amenities", listingId)).toBe(0);
    expect(await listingChildCount("favorites", listingId)).toBe(0);
    expect(provider.removals.sort()).toStrictEqual(images.map((image) => image.publicId).sort());
    expect(committedObservations).toBe(images.length);
    expect(application.logger.warnings).toHaveLength(0);
  });

  it("keeps 204 and committed deletion after one cleanup removal fails", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "DRAFT");
    const images = [
      await insertRm032Image(fixture, listingId, 1),
      await insertRm032Image(fixture, listingId, 2),
      await insertRm032Image(fixture, listingId, 3)
    ];
    const provider = createRecordingCloudinary({ removeFailureIds: [images[1]!.publicId] });
    const logger = createRecordingLogger();
    const application = await createRm032App(fixture, { provider, logger });
    const token = await fixture.signToken(landlordId);

    await hardDeleteRm032Listing(application.app, token, listingId).expect(204);

    expect(await storedRm032Listing(fixture, listingId)).toBeNull();
    expect(provider.removals.sort()).toStrictEqual(images.map((image) => image.publicId).sort());
    expect(new Set(provider.removals).size).toBe(images.length);
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]).toMatchObject({
      message: "Listing delete cleanup handoff failed after database commit.",
      context: { listingId, assetCount: 3, errorType: "ListingDeleteCloudinaryCleanupError" }
    });
    expectSafeWarnings(
      JSON.stringify(logger.warnings),
      images.map((image) => image.publicId)
    );
  });

  it("keeps 204 and attempts each asset once when every cleanup removal fails", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "DRAFT");
    const images = [await insertRm032Image(fixture, listingId, 1), await insertRm032Image(fixture, listingId, 2)];
    const provider = createRecordingCloudinary({ removeFailureIds: images.map((image) => image.publicId) });
    const logger = createRecordingLogger();
    const application = await createRm032App(fixture, { provider, logger });
    const token = await fixture.signToken(landlordId);

    await hardDeleteRm032Listing(application.app, token, listingId).expect(204);

    expect(await storedRm032Listing(fixture, listingId)).toBeNull();
    expect(provider.removals.sort()).toStrictEqual(images.map((image) => image.publicId).sort());
    expect(new Set(provider.removals).size).toBe(images.length);
    expect(logger.warnings).toHaveLength(1);
    expectSafeWarnings(
      JSON.stringify(logger.warnings),
      images.map((image) => image.publicId)
    );
  });

  it("rejects a DRAFT with moderation history before provider cleanup", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const adminId = await fixture.insertUser("ADMIN", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "DRAFT");
    const image = await insertRm032Image(fixture, listingId, 1);
    await insertRm032ModerationHistory(fixture, listingId, adminId, "REJECTED");
    const historyBefore = await storedRm032History(fixture, listingId);
    const application = await createRm032App(fixture);
    const token = await fixture.signToken(landlordId);

    const response = await hardDeleteRm032Listing(application.app, token, listingId).expect(409);

    expect(response.body.error.code).toBe("LISTING_DELETE_NOT_ALLOWED");
    expect(await storedRm032Listing(fixture, listingId)).not.toBeNull();
    expect((await storedRm032Images(fixture, listingId)).map((stored) => stored.id)).toStrictEqual([image.id]);
    expect(await storedRm032History(fixture, listingId)).toStrictEqual(historyBefore);
    expect(application.provider.removals).toHaveLength(0);
  });
});

describe("RM-032 multi-request replacement acceptance", () => {
  it("replaces below eight by uploading before deleting on APPROVED", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "APPROVED");
    const oldImage = await insertRm032Image(fixture, listingId, 1);
    const provider = createRecordingCloudinary();
    const application = await createRm032App(fixture, { provider });
    const token = await fixture.signToken(landlordId);

    const uploadResponse = await uploadRm032Image(application.app, token, listingId, "replacement B").expect(201);
    expect((await storedRm032Listing(fixture, listingId))?.status).toBe("PENDING");
    expect((await storedRm032Images(fixture, listingId)).map((image) => image.id)).toContain(oldImage.id);
    await deleteRm032Image(application.app, token, listingId, oldImage.id).expect(204);

    const finalImages = await storedRm032Images(fixture, listingId);
    expect((await storedRm032Listing(fixture, listingId))?.status).toBe("PENDING");
    expect(finalImages).toStrictEqual([
      expect.objectContaining({ id: uploadResponse.body.data.id, cloudinary_public_id: provider.uploads[0]!.publicId })
    ]);
    expect(provider.removals).toStrictEqual([oldImage.publicId]);
  });

  it("replaces at eight by deleting before uploading on APPROVED", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "APPROVED");
    const images = await seedEightImages(listingId);
    const oldImage = images[3]!;
    const provider = createRecordingCloudinary();
    const application = await createRm032App(fixture, { provider });
    const token = await fixture.signToken(landlordId);

    await deleteRm032Image(application.app, token, listingId, oldImage.id).expect(204);
    expect(await storedRm032Images(fixture, listingId)).toHaveLength(7);
    expect((await storedRm032Listing(fixture, listingId))?.status).toBe("PENDING");
    const uploadResponse = await uploadRm032Image(application.app, token, listingId).expect(201);

    const finalImages = await storedRm032Images(fixture, listingId);
    expect(finalImages).toHaveLength(8);
    expect(uploadResponse.body.data.displayOrder).toBe(4);
    expect(finalImages.map((image) => image.display_order)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect((await storedRm032Listing(fixture, listingId))?.status).toBe("PENDING");
    expect(provider.removals).toStrictEqual([oldImage.publicId]);
  });

  it("moves INACTIVE to PENDING on the first below-eight replacement request", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "INACTIVE");
    const oldImage = await insertRm032Image(fixture, listingId, 1);
    const application = await createRm032App(fixture);
    const token = await fixture.signToken(landlordId);

    await uploadRm032Image(application.app, token, listingId).expect(201);
    expect((await storedRm032Listing(fixture, listingId))?.status).toBe("PENDING");
    await deleteRm032Image(application.app, token, listingId, oldImage.id).expect(204);

    expect((await storedRm032Listing(fixture, listingId))?.status).toBe("PENDING");
    expect(await storedRm032Images(fixture, listingId)).toHaveLength(1);
    expect(application.provider.removals).toStrictEqual([oldImage.publicId]);
  });

  it("keeps HIDDEN and its moderation history throughout an eight-image replacement", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const adminId = await fixture.insertUser("ADMIN", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "HIDDEN");
    await insertRm032ModerationHistory(fixture, listingId, adminId, "HIDDEN");
    const historyBefore = await storedRm032History(fixture, listingId);
    const images = await seedEightImages(listingId);
    const oldImage = images[2]!;
    const application = await createRm032App(fixture);
    const token = await fixture.signToken(landlordId);

    await deleteRm032Image(application.app, token, listingId, oldImage.id).expect(204);
    expect((await storedRm032Listing(fixture, listingId))?.status).toBe("HIDDEN");
    const uploadResponse = await uploadRm032Image(application.app, token, listingId).expect(201);

    expect(uploadResponse.body.data.displayOrder).toBe(3);
    expect((await storedRm032Listing(fixture, listingId))?.status).toBe("HIDDEN");
    expect(await storedRm032History(fixture, listingId)).toStrictEqual(historyBefore);
    expect(await storedRm032Images(fixture, listingId)).toHaveLength(8);
  });

  it("keeps the first committed delete when the second replacement upload fails", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "APPROVED");
    const images = await seedEightImages(listingId);
    const oldImage = images[4]!;
    const provider = createRecordingCloudinary();
    const application = await createRm032App(fixture, { provider });
    const token = await fixture.signToken(landlordId);

    await deleteRm032Image(application.app, token, listingId, oldImage.id).expect(204);
    const committedAfterDelete = await storedRm032Images(fixture, listingId);
    provider.failNextUpload();
    const failedUpload = await uploadRm032Image(application.app, token, listingId).expect(502);

    expect(failedUpload.body.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(await storedRm032Images(fixture, listingId)).toStrictEqual(committedAfterDelete);
    expect(committedAfterDelete).toHaveLength(7);
    expect(committedAfterDelete.map((image) => image.id)).not.toContain(oldImage.id);
    expect((await storedRm032Listing(fixture, listingId))?.status).toBe("PENDING");
    expect(provider.uploads).toHaveLength(0);
    expect(provider.removals).toStrictEqual([oldImage.publicId]);
  });
});
