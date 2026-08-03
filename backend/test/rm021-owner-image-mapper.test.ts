import { describe, expect, it } from "vitest";
import {
  mapOwnerImageRow,
  mapOwnerImageToDto,
  OwnerImageMappingError,
  type OwnerImageRow
} from "../src/modules/listings/owner-image-mapper.js";

const row: OwnerImageRow = {
  id: 91,
  secure_url: "https://cdn.example.test/listing.webp",
  format: "webp",
  width: 1600,
  height: 1200,
  byte_size: 384210,
  display_order: 1,
  alt_text: "Bright room",
  created_at: "2026-07-28T05:00:00.000Z"
};

describe("RM-021 owner image mapper", () => {
  it("maps the exact private owner image without provider identifiers", () => {
    const snapshot = structuredClone(row);
    const image = mapOwnerImageRow(row);
    const dto = mapOwnerImageToDto(image);

    expect(dto).toStrictEqual({
      id: 91,
      url: "https://cdn.example.test/listing.webp",
      format: "webp",
      width: 1600,
      height: 1200,
      byteSize: 384210,
      displayOrder: 1,
      altText: "Bright room",
      createdAt: "2026-07-28T05:00:00.000Z"
    });
    expect(Object.keys(dto)).toStrictEqual([
      "id",
      "url",
      "format",
      "width",
      "height",
      "byteSize",
      "displayOrder",
      "altText",
      "createdAt"
    ]);
    expect(row).toStrictEqual(snapshot);
    expect(Object.isFrozen(image)).toBe(true);
    expect(Object.isFrozen(dto)).toBe(true);
    expect(JSON.stringify(dto)).not.toMatch(/listingId|listing_id|cloudinary|secureUrl|secure_url|byte_size/i);
  });

  it("supports nullable alt text", () => {
    expect(mapOwnerImageToDto(mapOwnerImageRow({ ...row, alt_text: null })).altText).toBeNull();
  });

  it.each([
    { ...row, id: 0 },
    { ...row, secure_url: "http://insecure.test/image.jpg" },
    { ...row, format: "WEBP" },
    { ...row, width: 0 },
    { ...row, height: -1 },
    { ...row, byte_size: 5242881 },
    { ...row, display_order: 9 },
    { ...row, alt_text: "   " },
    { ...row, created_at: "not-a-time" }
  ])("rejects invalid row representation without row leakage", (invalid) => {
    expect(() => mapOwnerImageRow(invalid)).toThrow(OwnerImageMappingError);
    try {
      mapOwnerImageRow(invalid);
    } catch (error) {
      expect(String(error)).not.toContain(JSON.stringify(invalid));
    }
  });
});
