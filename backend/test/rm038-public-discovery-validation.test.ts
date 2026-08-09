import { describe, expect, it } from "vitest";
import { validatePublicListingSearch } from "../src/modules/listings/public-listing-search-validation.js";
import { ApplicationError } from "../src/shared/errors/application-error.js";

function validationError(query: Readonly<Record<string, unknown>>): ApplicationError {
  try {
    validatePublicListingSearch(query);
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    return error as ApplicationError;
  }
  throw new Error("Expected public-search validation to fail.");
}

function expectInvalid(query: Readonly<Record<string, unknown>>): void {
  expect(validationError(query).code).toBe("VALIDATION_FAILED");
}

const completeBounds = Object.freeze({ north: "11", south: "10", east: "107", west: "106" });
const completeRadius = Object.freeze({ centerLat: "10.772341", centerLng: "106.697912", radiusKm: "5" });

describe("RM-038 public discovery validation verification", () => {
  it.each([
    ["q", ["a", "b"]],
    ["page", ["1", "2"]],
    ["sort", ["newest", "rent_asc"]]
  ])("rejects duplicate scalar %s represented by Express as an array", (field, value) => {
    const error = validationError({ [field]: value });
    expect(error.details).toContainEqual(
      expect.objectContaining({ field, code: "INVALID_TYPE", message: `${field} must be provided exactly once.` })
    );
  });

  it("rejects every incomplete one-, two-, and three-field bounds group", () => {
    const entries = Object.entries(completeBounds);
    for (let mask = 1; mask < 2 ** entries.length - 1; mask += 1) {
      const query = Object.fromEntries(entries.filter((_entry, index) => (mask & (1 << index)) !== 0));
      expectInvalid(query);
    }
  });

  it.each(["north", "south", "east", "west"])("rejects malformed bounds coordinate %s", (field) => {
    expectInvalid({ ...completeBounds, [field]: "invalid" });
  });

  it.each([
    { ...completeBounds, south: "11" },
    { ...completeBounds, south: "12" },
    { ...completeBounds, west: "107" },
    { ...completeBounds, west: "108" },
    { ...completeBounds, ...completeRadius }
  ])("rejects invalid or mutually exclusive bounds grammar %#", expectInvalid);

  it.each(["newest", "rent_asc", "rent_desc"])("accepts bounds sort %s", (sort) => {
    expect(validatePublicListingSearch({ ...completeBounds, sort })).toMatchObject({ mode: "bounds", sort });
  });

  it("rejects distance sort in bounds mode", () => {
    expectInvalid({ ...completeBounds, sort: "distance_asc" });
  });

  it("rejects every incomplete one- and two-field radius group", () => {
    const entries = Object.entries(completeRadius);
    for (let mask = 1; mask < 2 ** entries.length - 1; mask += 1) {
      const query = Object.fromEntries(entries.filter((_entry, index) => (mask & (1 << index)) !== 0));
      expectInvalid(query);
    }
  });

  it.each([
    ["centerLat", "malformed"],
    ["centerLng", "malformed"],
    ["radiusKm", "0"],
    ["radiusKm", "-1"],
    ["radiusKm", "1e1"],
    ["radiusKm", "1x"]
  ])("rejects invalid radius value %s=%s", (field, value) => {
    expectInvalid({ ...completeRadius, [field]: value });
  });

  it("defaults radius sorting to distance_asc and accepts it explicitly", () => {
    expect(validatePublicListingSearch(completeRadius)).toMatchObject({ mode: "radius", sort: "distance_asc" });
    expect(validatePublicListingSearch({ ...completeRadius, sort: "distance_asc" })).toMatchObject({
      mode: "radius",
      sort: "distance_asc"
    });
  });

  it.each(["newest", "rent_asc", "rent_desc"])("rejects radius sort %s", (sort) => {
    expectInvalid({ ...completeRadius, sort });
  });

  it("rejects distance sorting outside radius mode", () => {
    expectInvalid({ sort: "distance_asc" });
  });

  it("accepts pageSize 100, rejects 101, and preserves pagination defaults", () => {
    expect(validatePublicListingSearch({ pageSize: "100" })).toMatchObject({ page: 1, pageSize: 100 });
    expectInvalid({ pageSize: "101" });
    expect(validatePublicListingSearch({})).toMatchObject({ page: 1, pageSize: 20, offset: 0 });
  });

  it("accepts one-sided and equal rent ranges", () => {
    expect(validatePublicListingSearch({ minMonthlyRent: "5000000" })).toMatchObject({
      minMonthlyRent: 5_000_000,
      maxMonthlyRent: null
    });
    expect(validatePublicListingSearch({ maxMonthlyRent: "5000000" })).toMatchObject({
      minMonthlyRent: null,
      maxMonthlyRent: 5_000_000
    });
    expect(validatePublicListingSearch({ minMonthlyRent: "5", maxMonthlyRent: "5" })).toMatchObject({
      minMonthlyRent: 5,
      maxMonthlyRent: 5
    });
    expectInvalid({ minMonthlyRent: "6", maxMonthlyRent: "5" });
  });

  it.each(["0", "-1", "1.5", "1e3", "1x", "1000000000000"])(
    "rejects invalid rent boundary %s on both sides",
    (value) => {
      expectInvalid({ minMonthlyRent: value });
      expectInvalid({ maxMonthlyRent: value });
    }
  );

  it("accepts one-sided and equal room-area ranges", () => {
    expect(validatePublicListingSearch({ minRoomAreaSqm: "25.50" })).toMatchObject({
      minRoomAreaSqm: 25.5,
      maxRoomAreaSqm: null
    });
    expect(validatePublicListingSearch({ maxRoomAreaSqm: "25.50" })).toMatchObject({
      minRoomAreaSqm: null,
      maxRoomAreaSqm: 25.5
    });
    expect(validatePublicListingSearch({ minRoomAreaSqm: "25.5", maxRoomAreaSqm: "25.5" })).toMatchObject({
      minRoomAreaSqm: 25.5,
      maxRoomAreaSqm: 25.5
    });
    expectInvalid({ minRoomAreaSqm: "26", maxRoomAreaSqm: "25" });
  });

  it.each(["0", "-1", "1.234", "1e3", "1x", "1000000"])(
    "rejects invalid room-area boundary %s on both sides",
    (value) => {
      expectInvalid({ minRoomAreaSqm: value });
      expectInvalid({ maxRoomAreaSqm: value });
    }
  );
});
