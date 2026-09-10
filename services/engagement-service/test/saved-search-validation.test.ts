import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCreateSavedSearchBody,
  validateUpdateSavedSearchBody
} from "../src/modules/saved-searches/validations/saved-search-validation.js";

test("normalizes an ordinary saved search and removes duplicate amenity codes", () => {
  assert.deepEqual(
    validateCreateSavedSearchBody({
      name: "  Gần trường  ",
      query: {
        q: " phòng sáng ",
        minMonthlyRent: 2_000_000,
        maxMonthlyRent: 5_000_000,
        propertyType: "apartment",
        amenities: ["wifi", "WIFI", "air_conditioning"],
        mode: "ordinary",
        sort: "rent_asc"
      }
    }),
    {
      name: "Gần trường",
      isActive: true,
      query: {
        q: "phòng sáng",
        areaName: null,
        minMonthlyRent: 2_000_000,
        maxMonthlyRent: 5_000_000,
        minRoomAreaSqm: null,
        maxRoomAreaSqm: null,
        minOccupants: null,
        propertyType: "APARTMENT",
        amenities: ["AIR_CONDITIONING", "WIFI"],
        mode: "ordinary",
        north: null,
        south: null,
        east: null,
        west: null,
        centerLat: null,
        centerLng: null,
        radiusKm: null,
        sort: "rent_asc"
      }
    }
  );
});

test("accepts a complete radius search and enforces the configured 50 km boundary", () => {
  assert.equal(
    validateCreateSavedSearchBody({
      query: { mode: "radius", centerLat: 10.7769, centerLng: 106.7009, radiusKm: 12 }
    }).query.sort,
    "distance_asc"
  );
  assert.throws(
    () =>
      validateCreateSavedSearchBody({
        query: { mode: "radius", centerLat: 10.7769, centerLng: 106.7009, radiusKm: 51 }
      }),
    /invalid data/i
  );
});

test("rejects mixed geographic fields, unknown fields, and empty patches", () => {
  assert.throws(
    () =>
      validateCreateSavedSearchBody({
        query: { mode: "bounds", north: 11, south: 10, east: 107, west: 106, radiusKm: 5 }
      }),
    /invalid data/i
  );
  assert.throws(() => validateCreateSavedSearchBody({ query: { mode: "ordinary", page: 2 } }), /invalid data/i);
  assert.throws(() => validateUpdateSavedSearchBody({}), /invalid data/i);
});

test("keeps Search text limits aligned with Saved Search storage", () => {
  const result = validateCreateSavedSearchBody({
    query: {
      mode: "ordinary",
      q: "q".repeat(160),
      areaName: "a".repeat(120)
    }
  });

  assert.equal(result.query.q?.length, 160);
  assert.equal(result.query.areaName?.length, 120);
  assert.throws(
    () =>
      validateCreateSavedSearchBody({
        query: { mode: "ordinary", q: "q".repeat(161) }
      }),
    /invalid data/i
  );
  assert.throws(
    () =>
      validateCreateSavedSearchBody({
        query: { mode: "ordinary", areaName: "a".repeat(121) }
      }),
    /invalid data/i
  );
});

test("rejects unknown property types, amenities, and sort values", () => {
  assert.throws(
    () => validateCreateSavedSearchBody({ query: { mode: "ordinary", propertyType: "PROPERTY_XYZ" } }),
    /invalid data/i
  );
  assert.throws(
    () => validateCreateSavedSearchBody({ query: { mode: "ordinary", amenities: ["AMENITY_XYZ"] } }),
    /invalid data/i
  );
  assert.throws(() => validateCreateSavedSearchBody({ query: { mode: "ordinary", sort: "popular" } }), /invalid data/i);
  assert.doesNotThrow(() =>
    validateCreateSavedSearchBody({
      query: {
        mode: "ordinary",
        propertyType: "studio",
        amenities: ["wifi", "washing_machine"],
        sort: "rent_asc"
      }
    })
  );
});
