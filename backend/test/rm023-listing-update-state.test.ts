import { describe, expect, it } from "vitest";
import { resolveListingUpdateState, type ListingContentState } from "../src/modules/listings/listing-update-state.js";
import { validateListingUpdateInput } from "../src/modules/listings/listing-update-validation.js";

const complete: ListingContentState = Object.freeze({
  status: "APPROVED",
  title: "Studio",
  description: "Description",
  monthlyRent: 7000000,
  roomAreaSqm: 30,
  addressText: "Exact",
  areaName: "D1",
  latitude: 10.7,
  longitude: 106.7,
  propertyTypeCode: "STUDIO",
  amenityCodes: ["WIFI", "AC"]
});

describe("RM-023 listing update state", () => {
  it("treats empty, normalized-equal, and reordered amenities as true no-ops", () => {
    expect(resolveListingUpdateState(complete, validateListingUpdateInput({}))).toMatchObject({
      changed: false,
      status: "APPROVED"
    });
    expect(
      resolveListingUpdateState(
        complete,
        validateListingUpdateInput({
          title: " Studio ",
          propertyTypeCode: " studio ",
          latitude: 10.7,
          longitude: 106.7,
          amenityCodes: ["AC", "WIFI"]
        })
      )
    ).toMatchObject({ changed: false, amenitiesChanged: false, status: "APPROVED" });
  });

  it.each([
    ["DRAFT", "DRAFT"],
    ["PENDING", "PENDING"],
    ["REJECTED", "DRAFT"],
    ["APPROVED", "PENDING"],
    ["INACTIVE", "PENDING"],
    ["HIDDEN", "HIDDEN"]
  ] as const)("maps a real %s edit to %s", (status, expected) => {
    expect(
      resolveListingUpdateState({ ...complete, status }, validateListingUpdateInput({ title: "Changed" })).status
    ).toBe(expected);
  });

  it("classifies order-independent amenity replacement", () => {
    const state = resolveListingUpdateState(
      complete,
      validateListingUpdateInput({ amenityCodes: ["WIFI", "PARKING"] })
    );
    expect(state).toMatchObject({
      changed: true,
      amenitiesChanged: true,
      retainedAmenityCodes: ["WIFI"],
      addedAmenityCodes: ["PARKING"],
      removedAmenityCodes: ["AC"]
    });
  });

  it("permits nullable DRAFT outcomes but rejects incomplete non-draft outcomes", () => {
    expect(
      resolveListingUpdateState(
        { ...complete, status: "REJECTED" },
        validateListingUpdateInput({ propertyTypeCode: null, latitude: null, longitude: null })
      ).status
    ).toBe("DRAFT");
    expect(() =>
      resolveListingUpdateState({ ...complete, status: "HIDDEN" }, validateListingUpdateInput({ title: null }))
    ).toThrow();
  });
});
