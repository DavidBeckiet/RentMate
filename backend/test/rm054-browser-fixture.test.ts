import { describe, expect, it } from "vitest";
import {
  assertRm054TestDatabaseName,
  createRm054CloudinaryMock,
  createRm054NominatimMock,
  resetRm054MutableData,
  rm054ProviderFailureAddress
} from "./helpers/rm054-browser-fixture.js";

describe("RM-054 browser fixture safety", () => {
  it("accepts only the dedicated RM-054 test database name", () => {
    expect(() => assertRm054TestDatabaseName("rentmate_test_rm054")).not.toThrow();
    expect(() => assertRm054TestDatabaseName("rentmate")).toThrow(/dedicated/i);
    expect(() => assertRm054TestDatabaseName("rentmate_test_rm053")).toThrow(/dedicated/i);
  });

  it("resets only mutable product rows in dependency order", async () => {
    const statements: string[] = [];
    await resetRm054MutableData({
      query: async (statement: string) => {
        statements.push(statement);
        return { rows: [] };
      }
    });

    expect(statements).toEqual([
      "DELETE FROM moderation_history",
      "DELETE FROM favorites",
      "DELETE FROM listing_amenities",
      "DELETE FROM listing_images",
      "DELETE FROM listings",
      "DELETE FROM users WHERE role <> 'ADMIN'",
      "UPDATE property_types SET is_active = true",
      "UPDATE amenities SET is_active = true"
    ]);
  });

  it("uses deterministic local provider mocks without a network client", async () => {
    const calls: { kind: "upload" | "remove" | "geocode"; value: string }[] = [];
    const cloudinary = createRm054CloudinaryMock(calls);
    const nominatim = createRm054NominatimMock(calls);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await expect(
      cloudinary.uploadImage({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), mimeType: "image/jpeg" })
    ).resolves.toMatchObject({ publicId: "rm054/browser/1", format: "jpg", width: 2, height: 2 });
    await expect(cloudinary.uploadImage({ buffer: png, mimeType: "image/png" })).rejects.toThrow();
    await cloudinary.removeImage("rm054/browser/1");

    await expect(nominatim.forwardGeocode("12 Duong RM054, Quan 1")).resolves.toEqual([
      expect.objectContaining({ latitude: 10.7724, longitude: 106.6981 })
    ]);
    await expect(nominatim.forwardGeocode(rm054ProviderFailureAddress)).rejects.toThrow();
    expect(calls).toEqual([
      { kind: "upload", value: "image/jpeg" },
      { kind: "upload", value: "image/png" },
      { kind: "remove", value: "rm054/browser/1" },
      { kind: "geocode", value: "12 Duong RM054, Quan 1" },
      { kind: "geocode", value: rm054ProviderFailureAddress }
    ]);
  });
});
