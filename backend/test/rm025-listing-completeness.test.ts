import { describe, expect, it } from "vitest";
import { findMissingListingCompletenessFields } from "../src/modules/listings/listing-completeness.js";

const complete = Object.freeze({
  propertyType: { code: "STUDIO" },
  title: "Studio",
  description: "Complete",
  monthlyRent: 5_000_000,
  roomAreaSqm: 25,
  addressText: "Private address",
  areaName: "District",
  latitude: 10.75,
  longitude: 106.67
});

describe("RM-025 listing completeness", () => {
  it("accepts all nine non-null values", () => {
    expect(findMissingListingCompletenessFields(complete)).toStrictEqual([]);
  });

  it.each(Object.keys(complete) as (keyof typeof complete)[])("reports a missing %s", (field) => {
    expect(findMissingListingCompletenessFields({ ...complete, [field]: null })).toStrictEqual([field]);
  });

  it("uses the frozen deterministic field order including separate coordinates", () => {
    const missing = findMissingListingCompletenessFields({
      ...complete,
      longitude: null,
      propertyType: null,
      monthlyRent: null,
      latitude: null,
      title: null
    });
    expect(missing).toStrictEqual(["propertyType", "title", "monthlyRent", "latitude", "longitude"]);
    expect(Object.isFrozen(missing)).toBe(true);
  });

  it("treats falsey non-null values as present", () => {
    expect(
      findMissingListingCompletenessFields({
        ...complete,
        title: "",
        monthlyRent: 0,
        latitude: 0,
        longitude: 0
      })
    ).toStrictEqual([]);
  });
});
