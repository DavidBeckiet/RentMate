import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import { validatePublicListingSearch } from "../src/modules/listings/public-listing-search-validation.js";

function invalid(query: Record<string, unknown>): ApplicationError {
  try {
    validatePublicListingSearch(query);
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    return error as ApplicationError;
  }
  throw new Error("Expected validation failure.");
}

describe("RM-035 unified public search validation", () => {
  it("normalizes the empty ordinary query and text filters", () => {
    expect(validatePublicListingSearch({})).toStrictEqual({
      mode: "ordinary",
      q: null,
      areaName: null,
      minMonthlyRent: null,
      maxMonthlyRent: null,
      minRoomAreaSqm: null,
      maxRoomAreaSqm: null,
      propertyType: null,
      amenities: [],
      page: 1,
      pageSize: 20,
      offset: 0,
      sort: "newest"
    });
    const normalized = validatePublicListingSearch({ q: "  50%_\\ room ", areaName: "  District 1  " });
    expect(normalized).toMatchObject({ q: "50%_\\ room", areaName: "District 1" });
    expect(validatePublicListingSearch({ q: "  ", areaName: "" })).toMatchObject({ q: null, areaName: null });
  });

  it.each(["1", "0001", "999999999999"])("accepts rent boundary %s", (value) => {
    expect(validatePublicListingSearch({ minMonthlyRent: value })).toMatchObject({ minMonthlyRent: Number(value) });
  });

  it.each(["", "0", "-1", "1.5", " 1", "1e3", "NaN", "Infinity", "1x", "1000000000000"])(
    "rejects invalid rent %s",
    (value) => expect(invalid({ minMonthlyRent: value }).code).toBe("VALIDATION_FAILED")
  );

  it("rejects an inverted rent range", () => {
    expect(invalid({ minMonthlyRent: "2", maxMonthlyRent: "1" }).details[0]?.field).toBe("maxMonthlyRent");
  });

  it.each(["1", "1.5", "1.50", "0.01", "999999.99"])("accepts room area %s", (value) => {
    expect(validatePublicListingSearch({ minRoomAreaSqm: value })).toMatchObject({ minRoomAreaSqm: Number(value) });
  });

  it.each(["", "0", "-1", "+1", "1.", ".5", "1.234", "1e3", " 1", "1x", "1000000"])(
    "rejects invalid room area %s",
    (value) => expect(invalid({ minRoomAreaSqm: value }).code).toBe("VALIDATION_FAILED")
  );

  it("rejects an inverted room-area range", () => {
    expect(invalid({ minRoomAreaSqm: "2", maxRoomAreaSqm: "1" }).details[0]?.field).toBe("maxRoomAreaSqm");
  });

  it("normalizes controlled codes and rejects empty amenity tokens", () => {
    expect(
      validatePublicListingSearch({ propertyType: " studio ", amenities: "wifi,WIFI, parking ,WIFI" })
    ).toMatchObject({
      propertyType: "STUDIO",
      amenities: ["PARKING", "WIFI"]
    });
    for (const amenities of ["", ",", "WIFI,", ",WIFI", "WIFI,,PARKING"]) {
      expect(invalid({ amenities }).details[0]?.field).toBe("amenities");
    }
    expect(invalid({ propertyType: "  " }).details[0]?.field).toBe("propertyType");
  });

  it("validates pagination, safe offset, ordinary sort, and unknown keys", () => {
    expect(validatePublicListingSearch({ page: "3", pageSize: "100", sort: "rent_desc" })).toMatchObject({
      page: 3,
      pageSize: 100,
      offset: 200,
      sort: "rent_desc"
    });
    for (const query of [
      { page: "0" },
      { pageSize: "101" },
      { page: String(Number.MAX_SAFE_INTEGER) },
      { sort: "distance_asc" },
      { sort: "other" },
      { unknown: "x" },
      { page: ["1", "2"] }
    ]) {
      expect(invalid(query).code).toBe("VALIDATION_FAILED");
    }
  });

  it("recognizes complete bounds and radius modes without calculating execution data", () => {
    expect(validatePublicListingSearch({ north: "11", south: "10", east: "107", west: "106" })).toMatchObject({
      mode: "bounds",
      north: 11,
      south: 10,
      east: 107,
      west: 106,
      sort: "newest"
    });
    expect(validatePublicListingSearch({ centerLat: "10.75", centerLng: "106.67", radiusKm: "5" })).toMatchObject({
      mode: "radius",
      centerLat: 10.75,
      centerLng: 106.67,
      radiusKm: 5,
      sort: "distance_asc"
    });
  });

  it.each([
    { north: "11" },
    { centerLat: "10" },
    { north: "11", south: "10", east: "107", west: "106", centerLat: "10", centerLng: "106", radiusKm: "5" },
    { north: "10", south: "10", east: "107", west: "106" },
    { north: "11", south: "10", east: "106", west: "107" },
    { north: "91", south: "10", east: "107", west: "106" },
    { centerLat: "10", centerLng: "106", radiusKm: "0" },
    { north: "11", south: "10", east: "107", west: "106", sort: "distance_asc" },
    { centerLat: "10", centerLng: "106", radiusKm: "5", sort: "rent_asc" }
  ])("rejects invalid geographic grammar %#", (query) => {
    expect(invalid(query).code).toBe("VALIDATION_FAILED");
  });
});
