import { describe, expect, it } from "vitest";
import { ApplicationError, type ValidationDetail } from "../src/shared/errors/application-error.js";
import { ValidationIssueCollector, validationDetail } from "../src/shared/validation/issues.js";
import {
  parseFiniteQueryDecimal,
  parsePagination,
  parsePathId,
  parsePositiveQueryInteger
} from "../src/shared/validation/parsing.js";
import {
  readScalarQueryValue,
  requirePlainJsonObject,
  validateBodyFields,
  validateQueryKeys
} from "../src/shared/validation/request.js";

function captureValidationError(operation: () => unknown): ApplicationError {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
    return error as ApplicationError;
  }

  throw new Error("Expected validation to fail");
}

function detailsFor(operation: () => unknown): readonly ValidationDetail[] {
  return captureValidationError(operation).details;
}

describe("RM-010 validation issue collection and body shape", () => {
  it("collects multiple immutable issues in deterministic insertion order", () => {
    const collector = new ValidationIssueCollector();
    collector.add(validationDetail("email", "REQUIRED", "email is required."));
    collector.add(validationDetail("phone", "INVALID_VALUE", "phone is invalid."));

    expect(collector.details.map(({ field }) => field)).toEqual(["email", "phone"]);
    expect(() => collector.throwIfAny()).toThrow(ApplicationError);
    expect(detailsFor(() => collector.throwIfAny()).map(({ field }) => field)).toEqual(["email", "phone"]);
  });

  it.each([null, [], "body", 1, true, new Date()])("rejects non-plain body value %#", (value) => {
    expect(detailsFor(() => requirePlainJsonObject(value))).toEqual([
      { field: "body", code: "INVALID_TYPE", message: "body must be a JSON object." }
    ]);
  });

  it("reports every unknown body field in stable order without mutation or values", () => {
    const body = { known: "keep", zeta: "private-z", alpha: "private-a" };
    const snapshot = structuredClone(body);
    const error = captureValidationError(() => validateBodyFields(body, ["known"]));

    expect(error.details).toEqual([
      { field: "alpha", code: "UNKNOWN_FIELD", message: "alpha is not an allowed body field." },
      { field: "zeta", code: "UNKNOWN_FIELD", message: "zeta is not an allowed body field." }
    ]);
    expect(body).toEqual(snapshot);
    expect(JSON.stringify(error)).not.toContain("private-a");
    expect(JSON.stringify(error)).not.toContain("private-z");
  });
});

describe("RM-010 query shape and scalar parsing", () => {
  it("reports unknown, repeated, and nested query parameters without mutation", () => {
    const query = {
      page: ["1", "2"],
      filter: { nested: "private" },
      unknown: "private-value"
    };
    const snapshot = structuredClone(query);
    const error = captureValidationError(() => validateQueryKeys(query, ["page", "filter"]));

    expect(error.details).toEqual([
      { field: "filter", code: "INVALID_TYPE", message: "filter must be a scalar query parameter." },
      { field: "page", code: "INVALID_TYPE", message: "page must be provided exactly once." },
      { field: "unknown", code: "UNKNOWN_FIELD", message: "unknown is not an allowed query parameter." }
    ]);
    expect(query).toEqual(snapshot);
    expect(JSON.stringify(error)).not.toContain("private-value");
    expect(JSON.stringify(error)).not.toContain("private");
  });

  it("allows an array only when the caller explicitly declares that parameter", () => {
    const query = { amenities: ["WIFI", "PARKING"] };

    expect(validateQueryKeys(query, ["amenities"], { arrayParameters: ["amenities"] })).toBe(query);
  });

  it("distinguishes missing, scalar, repeated, nested, and unsupported query values", () => {
    expect(readScalarQueryValue(undefined, "page")).toBeUndefined();
    expect(readScalarQueryValue("2", "page")).toBe("2");
    expect(() => readScalarQueryValue(["1", "2"], "page")).toThrow(ApplicationError);
    expect(() => readScalarQueryValue({ value: "1" }, "page")).toThrow(ApplicationError);
    expect(() => readScalarQueryValue(1, "page")).toThrow(ApplicationError);
  });
});

describe("RM-010 strict path, query, and pagination parsing", () => {
  it.each([
    ["1", 1],
    ["2147483647", 2_147_483_647]
  ])("parses path ID %s", (input, expected) => {
    expect(parsePathId(input, "listingId")).toBe(expected);
  });

  it.each(["", " ", " 1", "1 ", "0", "-1", "1.5", "1e2", "0x10", "10abc", "2147483648"])(
    "rejects malformed path ID %s",
    (input) => {
      expect(() => parsePathId(input, "listingId")).toThrow(ApplicationError);
    }
  );

  it("strictly parses positive query integers", () => {
    expect(parsePositiveQueryInteger(undefined, "page")).toBeUndefined();
    expect(parsePositiveQueryInteger("10", "page")).toBe(10);

    for (const invalid of ["", " 10", "10 ", "0", "-1", "1.5", "1e2", "10abc", ["1", "2"], {}]) {
      expect(() => parsePositiveQueryInteger(invalid, "page")).toThrow(ApplicationError);
    }
  });

  it("strictly parses ordinary finite query decimals without rounding", () => {
    expect(parseFiniteQueryDecimal(undefined, "north")).toBeUndefined();
    expect(parseFiniteQueryDecimal("12.34", "north")).toBe(12.34);
    expect(parseFiniteQueryDecimal("-0.5", "north")).toBe(-0.5);

    for (const invalid of ["", " 1", "1 ", ".5", "1.", "1e2", "NaN", "Infinity", ["1"], {}]) {
      expect(() => parseFiniteQueryDecimal(invalid, "north")).toThrow(ApplicationError);
    }
  });

  it("applies exact pagination defaults and limits", () => {
    expect(parsePagination({})).toStrictEqual({ page: 1, pageSize: 20 });
    expect(parsePagination({ page: "3", pageSize: "100" })).toStrictEqual({ page: 3, pageSize: 100 });

    for (const query of [
      { page: "" },
      { page: "0" },
      { page: "1.5" },
      { page: "1e2" },
      { page: ["1", "2"] },
      { pageSize: "0" },
      { pageSize: "101" },
      { pageSize: "20.5" },
      { pageSize: ["20", "30"] }
    ]) {
      expect(() => parsePagination(query)).toThrow(ApplicationError);
    }
  });
});
