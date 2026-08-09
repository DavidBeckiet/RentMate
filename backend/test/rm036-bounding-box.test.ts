import { describe, expect, it } from "vitest";
import { calculateRadiusBoundingBox } from "../src/modules/listings/public-listing-search-bounding-box.js";

const centerLat = 10.772341;
const centerLng = 106.697912;

describe("RM-036 radius bounding box", () => {
  it("uses latitude degrees and cosine-adjusted longitude degrees", () => {
    const radiusKm = 5;
    const box = calculateRadiusBoundingBox(centerLat, centerLng, radiusKm);
    const latitudeDelta = radiusKm / 111.32;
    const longitudeDelta = radiusKm / (111.32 * Math.cos((centerLat * Math.PI) / 180));

    expect(box.south).toBeCloseTo(centerLat - latitudeDelta, 12);
    expect(box.north).toBeCloseTo(centerLat + latitudeDelta, 12);
    expect(box.west).toBeCloseTo(centerLng - longitudeDelta, 12);
    expect(box.east).toBeCloseTo(centerLng + longitudeDelta, 12);
    expect(centerLat).toBeGreaterThan(box.south);
    expect(centerLat).toBeLessThan(box.north);
    expect(centerLng).toBeGreaterThan(box.west);
    expect(centerLng).toBeLessThan(box.east);
  });

  it("is deterministic, finite, and expands for a larger radius", () => {
    const small = calculateRadiusBoundingBox(centerLat, centerLng, 1);
    const large = calculateRadiusBoundingBox(centerLat, centerLng, 10);

    expect(calculateRadiusBoundingBox(centerLat, centerLng, 1)).toStrictEqual(small);
    expect(Object.values(small).every((value) => Number.isFinite(value))).toBe(true);
    expect(large.south).toBeLessThan(small.south);
    expect(large.north).toBeGreaterThan(small.north);
    expect(large.west).toBeLessThan(small.west);
    expect(large.east).toBeGreaterThan(small.east);
  });
});
