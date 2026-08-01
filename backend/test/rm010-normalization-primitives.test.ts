import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import {
  normalizeControlledCode,
  normalizeEmail,
  normalizeNullableString,
  normalizePhone,
  validatePasswordRepresentation
} from "../src/shared/validation/normalization.js";
import {
  textMaximumLengths,
  validateJsonIntegerId,
  validateJsonText,
  validateLatitude,
  validateLongitude,
  validateMonthlyRent,
  validateRoomArea
} from "../src/shared/validation/primitives.js";

function expectValidationFailure(operation: () => unknown): void {
  expect(operation).toThrow(ApplicationError);
  try {
    operation();
  } catch (error) {
    expect(error).toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
  }
}

describe("RM-010 normalization helpers", () => {
  it("trims, lowercases, and validates email", () => {
    expect(normalizeEmail("  Person@Example.COM  ")).toBe("person@example.com");

    for (const invalid of [undefined, null, 1, "", "   ", "not-an-email", `${"a".repeat(310)}@example.com`]) {
      expectValidationFailure(() => normalizeEmail(invalid));
    }
  });

  it("validates password representation without trimming, lowercasing, hashing, or disclosure", () => {
    const password = "  PassWord  ";
    expect(validatePasswordRepresentation(password)).toBe(password);
    expect(validatePasswordRepresentation("😀".repeat(18))).toBe("😀".repeat(18));

    expectValidationFailure(() => validatePasswordRepresentation("short"));
    expectValidationFailure(() => validatePasswordRepresentation("😀".repeat(19)));
    expectValidationFailure(() => validatePasswordRepresentation(12345678));

    const privatePassword = "PrivatePasswordThatMustNotAppear";
    try {
      validatePasswordRepresentation(privatePassword.repeat(4));
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(privatePassword);
      expect(String(error)).not.toContain(privatePassword);
    }
  });

  it("supports required and nullable E.164 phone policies", () => {
    expect(normalizePhone(" +84901234567 ", "phoneE164", "required")).toBe("+84901234567");
    expect(normalizePhone(undefined, "phoneE164", "nullable")).toBeUndefined();
    expect(normalizePhone(null, "phoneE164", "nullable")).toBeNull();
    expect(normalizePhone("   ", "phoneE164", "nullable")).toBeNull();

    for (const invalid of [undefined, null, "", "01234567", "+01234567", "+123"]) {
      expectValidationFailure(() => normalizePhone(invalid, "phoneE164", "required"));
    }
  });

  it("normalizes controlled codes against only the caller allowlist", () => {
    expect(normalizeControlledCode(" wifi ", "amenityCode", ["WIFI", "PARKING"])).toBe("WIFI");
    expectValidationFailure(() => normalizeControlledCode("ELEVATOR", "amenityCode", ["WIFI", "PARKING"]));
    expectValidationFailure(() => normalizeControlledCode(1, "amenityCode", ["WIFI"]));
  });

  it("preserves omitted, null, and blank-nullable string distinctions", () => {
    expect(normalizeNullableString(undefined, "altText")).toBeUndefined();
    expect(normalizeNullableString(null, "altText")).toBeNull();
    expect(normalizeNullableString("   ", "altText")).toBeNull();
    expect(normalizeNullableString("  Room view  ", "altText")).toBe("Room view");
    expectValidationFailure(() => normalizeNullableString(42, "altText"));
  });
});

describe("RM-010 JSON primitive validators", () => {
  it("accepts only positive signed 32-bit JSON integer IDs", () => {
    expect(validateJsonIntegerId(1, "listingId")).toBe(1);
    expect(validateJsonIntegerId(2_147_483_647, "listingId")).toBe(2_147_483_647);

    for (const invalid of ["1", 0, -1, 1.5, 2_147_483_648, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectValidationFailure(() => validateJsonIntegerId(invalid, "listingId"));
    }
  });

  it("validates monthly rent as a positive whole safe VND number", () => {
    expect(validateMonthlyRent(1)).toBe(1);
    expect(validateMonthlyRent(999_999_999_999)).toBe(999_999_999_999);

    for (const invalid of ["1", 0, -1, 1.5, 1_000_000_000_000, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectValidationFailure(() => validateMonthlyRent(invalid));
    }
  });

  it("validates room area range and scale without silent rounding", () => {
    expect(validateRoomArea(1)).toBe(1);
    expect(validateRoomArea(0.29)).toBe(0.29);
    expect(validateRoomArea(12.34)).toBe(12.34);
    expect(validateRoomArea(999_999.99)).toBe(999_999.99);

    for (const invalid of ["1", 0, -1, 1.001, 1_000_000, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectValidationFailure(() => validateRoomArea(invalid));
    }
  });

  it("validates finite latitude and longitude boundaries", () => {
    expect(validateLatitude(-90)).toBe(-90);
    expect(validateLatitude(90)).toBe(90);
    expect(validateLongitude(-180)).toBe(-180);
    expect(validateLongitude(180)).toBe(180);

    for (const invalid of [-90.01, 90.01, Number.NaN, Number.POSITIVE_INFINITY, "10"]) {
      expectValidationFailure(() => validateLatitude(invalid));
    }
    for (const invalid of [-180.01, 180.01, Number.NaN, Number.NEGATIVE_INFINITY, "10"]) {
      expectValidationFailure(() => validateLongitude(invalid));
    }
  });

  it("enforces explicit text nullability, blank, and frozen maximum-length policies", () => {
    expect(textMaximumLengths).toStrictEqual({
      title: 160,
      description: 5000,
      addressText: 500,
      areaName: 120,
      altText: 255,
      moderationReason: 1000
    });
    expect(
      validateJsonText("  Studio  ", "title", {
        maximumLength: textMaximumLengths.title,
        nullable: false,
        nonblank: true
      })
    ).toBe("Studio");
    expect(
      validateJsonText("   ", "altText", {
        maximumLength: textMaximumLengths.altText,
        nullable: true,
        nonblank: true,
        blankAsNull: true
      })
    ).toBeNull();
    expect(
      validateJsonText(null, "moderationReason", {
        maximumLength: textMaximumLengths.moderationReason,
        nullable: true,
        nonblank: true
      })
    ).toBeNull();

    expectValidationFailure(() =>
      validateJsonText("   ", "title", {
        maximumLength: textMaximumLengths.title,
        nullable: false,
        nonblank: true
      })
    );
    expectValidationFailure(() =>
      validateJsonText("x".repeat(161), "title", {
        maximumLength: textMaximumLengths.title,
        nullable: false,
        nonblank: true
      })
    );
    expectValidationFailure(() =>
      validateJsonText(null, "title", {
        maximumLength: textMaximumLengths.title,
        nullable: false,
        nonblank: true
      })
    );
  });
});
