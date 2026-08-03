import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import { validateCreateListingDraftInput } from "../src/modules/listings/listing-create-validation.js";

function expectValidationFailure(value: unknown, field?: string): ApplicationError {
  try {
    validateCreateListingDraftInput(value);
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    const applicationError = error as ApplicationError;
    expect(applicationError).toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
    if (field) {
      expect(applicationError.details.some((detail) => detail.field === field)).toBe(true);
    }
    return applicationError;
  }

  throw new Error("Expected listing-create validation to fail.");
}

describe("RM-020 listing-create validation", () => {
  it("normalizes an empty object into a frozen empty draft", () => {
    const input = validateCreateListingDraftInput({});

    expect(input).toStrictEqual({
      title: null,
      description: null,
      monthlyRent: null,
      propertyTypeCode: null,
      roomAreaSqm: null,
      addressText: null,
      areaName: null,
      latitude: null,
      longitude: null,
      amenityCodes: []
    });
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.amenityCodes)).toBe(true);
  });

  it("trims nullable strings, preserves internal whitespace, and normalizes controlled codes", () => {
    const input = validateCreateListingDraftInput({
      title: "  Bright   studio  ",
      description: "  Natural light\nwith balcony.  ",
      propertyTypeCode: " studio ",
      addressText: "  101 Example Street  ",
      areaName: "  District 1  ",
      amenityCodes: [" wifi ", "Furnished"]
    });

    expect(input).toMatchObject({
      title: "Bright   studio",
      description: "Natural light\nwith balcony.",
      propertyTypeCode: "STUDIO",
      addressText: "101 Example Street",
      areaName: "District 1",
      amenityCodes: ["WIFI", "FURNISHED"]
    });
  });

  it("maps explicit nullable scalars and blank nullable strings to null", () => {
    const input = validateCreateListingDraftInput({
      title: "   ",
      description: null,
      monthlyRent: null,
      propertyTypeCode: "  ",
      roomAreaSqm: null,
      addressText: "\t",
      areaName: null,
      latitude: null,
      longitude: null,
      amenityCodes: []
    });

    expect(input).toStrictEqual({
      title: null,
      description: null,
      monthlyRent: null,
      propertyTypeCode: null,
      roomAreaSqm: null,
      addressText: null,
      areaName: null,
      latitude: null,
      longitude: null,
      amenityCodes: []
    });
  });

  it.each([undefined, null, [], "text", 42, true])("rejects a non-object body: %j", (body) => {
    expectValidationFailure(body, "body");
  });

  it("rejects unknown and protected fields without silently ignoring them", () => {
    const error = expectValidationFailure({ landlordId: 17, status: "DRAFT", unexpected: true });
    expect(error.details.map((detail) => detail.field)).toStrictEqual(["landlordId", "status", "unexpected"]);
    expect(error.details.every((detail) => detail.code === "UNKNOWN_FIELD")).toBe(true);
  });

  it("rejects null amenities, invalid items, and duplicates after normalization", () => {
    expectValidationFailure({ amenityCodes: null }, "amenityCodes");
    expectValidationFailure({ amenityCodes: ["WIFI", 4] }, "amenityCodes[1]");
    expectValidationFailure({ amenityCodes: ["   "] }, "amenityCodes[0]");
    const duplicate = expectValidationFailure({ amenityCodes: ["wifi", " WIFI "] }, "amenityCodes");
    expect(duplicate.details).toContainEqual(
      expect.objectContaining({ field: "amenityCodes", code: "DUPLICATE_VALUE" })
    );
  });

  it("accepts exact rent and room-area boundaries and rejects invalid numeric representations", () => {
    expect(validateCreateListingDraftInput({ monthlyRent: 1, roomAreaSqm: 0.01 })).toMatchObject({
      monthlyRent: 1,
      roomAreaSqm: 0.01
    });
    expect(validateCreateListingDraftInput({ monthlyRent: 999_999_999_999, roomAreaSqm: 999_999.99 })).toMatchObject({
      monthlyRent: 999_999_999_999,
      roomAreaSqm: 999_999.99
    });

    for (const value of [0, -1, 1.5, 1_000_000_000_000, "7500000", Number.POSITIVE_INFINITY]) {
      expectValidationFailure({ monthlyRent: value }, "monthlyRent");
    }
    for (const value of [0, -1, 1.001, 1_000_000, "28.5", Number.NaN]) {
      expectValidationFailure({ roomAreaSqm: value }, "roomAreaSqm");
    }
  });

  it("enforces string-length boundaries after trimming", () => {
    expect(validateCreateListingDraftInput({ title: "x".repeat(160) }).title).toHaveLength(160);
    expect(validateCreateListingDraftInput({ description: "x".repeat(5_000) }).description).toHaveLength(5_000);
    expect(validateCreateListingDraftInput({ addressText: "x".repeat(500) }).addressText).toHaveLength(500);
    expect(validateCreateListingDraftInput({ areaName: "x".repeat(120) }).areaName).toHaveLength(120);

    expectValidationFailure({ title: "x".repeat(161) }, "title");
    expectValidationFailure({ description: "x".repeat(5_001) }, "description");
    expectValidationFailure({ addressText: "x".repeat(501) }, "addressText");
    expectValidationFailure({ areaName: "x".repeat(121) }, "areaName");
  });

  it("accepts omitted, null-pair, and exact coordinate pairs", () => {
    expect(validateCreateListingDraftInput({})).toMatchObject({ latitude: null, longitude: null });
    expect(validateCreateListingDraftInput({ latitude: null, longitude: null })).toMatchObject({
      latitude: null,
      longitude: null
    });
    expect(validateCreateListingDraftInput({ latitude: 10.772341, longitude: 106.697912 })).toMatchObject({
      latitude: 10.772341,
      longitude: 106.697912
    });
  });

  it("rejects missing, mixed, invalid-type, and out-of-range coordinate pairs", () => {
    expectValidationFailure({ latitude: 10.7 }, "longitude");
    expectValidationFailure({ longitude: 106.7 }, "latitude");
    expectValidationFailure({ latitude: null, longitude: 106.7 }, "latitude");
    expectValidationFailure({ latitude: 10.7, longitude: null }, "longitude");
    expectValidationFailure({ latitude: "10.7", longitude: 106.7 }, "latitude");
    expectValidationFailure({ latitude: 91, longitude: 106.7 }, "latitude");
    expectValidationFailure({ latitude: 10.7, longitude: 181 }, "longitude");
  });

  it("does not echo complete private text in validation errors", () => {
    const privateAddress = "123 Private Exact Address";
    const privateDescription = "private description that must not be echoed";
    const error = expectValidationFailure({
      addressText: privateAddress,
      description: privateDescription,
      amenityCodes: null
    });
    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain(privateAddress);
    expect(serialized).not.toContain(privateDescription);
  });
});
