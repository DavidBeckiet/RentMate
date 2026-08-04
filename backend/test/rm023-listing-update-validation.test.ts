import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import { validateListingUpdateInput } from "../src/modules/listings/listing-update-validation.js";

describe("RM-023 listing update validation", () => {
  it("keeps omission distinct from explicit null and deeply freezes normalized input", () => {
    const empty = validateListingUpdateInput({});
    expect(empty.title).toStrictEqual({ provided: false });
    expect(empty.coordinates).toStrictEqual({ provided: false });
    const input = validateListingUpdateInput({
      title: "  Useful  title  ",
      propertyTypeCode: " studio ",
      latitude: null,
      longitude: null,
      amenityCodes: [" wifi "]
    });
    expect(input.title).toStrictEqual({ provided: true, value: "Useful  title" });
    expect(input.propertyTypeCode).toStrictEqual({ provided: true, value: "STUDIO" });
    expect(input.coordinates).toStrictEqual({ provided: true, value: { latitude: null, longitude: null } });
    expect(input.amenityCodes).toStrictEqual({ provided: true, value: ["WIFI"] });
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.coordinates)).toBe(true);
    expect(input.coordinates.provided && Object.isFrozen(input.coordinates.value)).toBe(true);
  });

  it.each([undefined, null, [], "body", 1])("rejects a missing or non-object body", (body) => {
    expect(() => validateListingUpdateInput(body)).toThrowError(ApplicationError);
  });

  it.each([
    { amenityCodes: null },
    { amenityCodes: ["WIFI", " wifi "] },
    { latitude: 10 },
    { longitude: 20 },
    { latitude: null, longitude: 20 },
    { id: 9 },
    { status: "APPROVED" },
    { title: "x".repeat(201) }
  ])("rejects invalid, duplicate, protected, or incomplete fields", (body) => {
    expect(() => validateListingUpdateInput(body)).toThrowError(ApplicationError);
  });

  it("does not echo sensitive text in validation errors", () => {
    const privateValue = "private-address-should-not-echo";
    try {
      validateListingUpdateInput({ addressText: privateValue.repeat(30) });
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(privateValue);
    }
  });
});
