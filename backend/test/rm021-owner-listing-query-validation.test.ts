import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import { parsePathId } from "../src/shared/validation/parsing.js";
import {
  validateOwnerListingCollectionQuery,
  validateOwnerListingReadBody
} from "../src/modules/listings/owner-listing-read-validation.js";

function expectValidation(operation: () => unknown, field?: string): void {
  try {
    operation();
  } catch (error) {
    expect(error).toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
    if (field) {
      expect((error as ApplicationError).details.some((detail) => detail.field === field)).toBe(true);
    }
    return;
  }
  throw new Error("Expected validation failure.");
}

describe("RM-021 owner collection query validation", () => {
  it("applies frozen defaults and returns an immutable model", () => {
    const query = validateOwnerListingCollectionQuery({});
    expect(query).toStrictEqual({ status: null, page: 1, pageSize: 20, offset: 0 });
    expect(Object.isFrozen(query)).toBe(true);
  });

  it.each(["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"])("accepts listing status %s", (status) => {
    expect(validateOwnerListingCollectionQuery({ status }).status).toBe(status);
  });

  it("trims and uppercases status while preserving custom pagination", () => {
    expect(validateOwnerListingCollectionQuery({ status: " rejected ", page: "3", pageSize: "25" })).toStrictEqual({
      status: "REJECTED",
      page: 3,
      pageSize: 25,
      offset: 50
    });
  });

  it.each(["", "   ", "UNKNOWN", "DRAFT,PENDING"])("rejects invalid status %#", (status) => {
    expectValidation(() => validateOwnerListingCollectionQuery({ status }), "status");
  });

  it.each([
    { status: ["DRAFT", "PENDING"] },
    { page: ["1", "2"] },
    { pageSize: ["20", "30"] },
    { status: { value: "DRAFT" } },
    { anything: "value" }
  ])("rejects repeated, nested, or unknown query values %#", (query) => {
    expectValidation(() => validateOwnerListingCollectionQuery(query));
  });

  it.each(["", "0", "-1", "1.5", "1e2", "abc"])("rejects invalid page %#", (page) => {
    expectValidation(() => validateOwnerListingCollectionQuery({ page }), "page");
  });

  it.each(["", "0", "-1", "1.5", "1e2", "101", "abc"])("rejects invalid pageSize %#", (pageSize) => {
    expectValidation(() => validateOwnerListingCollectionQuery({ pageSize }), "pageSize");
  });

  it("accepts pageSize bounds and the largest safely representable offset", () => {
    expect(validateOwnerListingCollectionQuery({ pageSize: "1" }).pageSize).toBe(1);
    expect(validateOwnerListingCollectionQuery({ pageSize: "100" }).pageSize).toBe(100);
    const page = Math.floor(Number.MAX_SAFE_INTEGER / 100) + 1;
    const query = validateOwnerListingCollectionQuery({ page: String(page), pageSize: "100" });
    expect(Number.isSafeInteger(query.offset)).toBe(true);
  });

  it("rejects an unsafe offset without imposing a 32-bit page cap", () => {
    const overflowingPage = Math.floor(Number.MAX_SAFE_INTEGER / 100) + 2;
    expectValidation(
      () => validateOwnerListingCollectionQuery({ page: String(overflowingPage), pageSize: "100" }),
      "page"
    );
    expect(validateOwnerListingCollectionQuery({ page: "2147483648", pageSize: "1" }).page).toBe(2_147_483_648);
  });
});

describe("RM-021 owner-read body and path validation", () => {
  it("accepts an omitted body and rejects every parsed JSON body", () => {
    expect(validateOwnerListingReadBody(undefined)).toBeUndefined();
    for (const body of [{}, null, [], "text", 123, true]) {
      expectValidation(() => validateOwnerListingReadBody(body), "body");
    }
  });

  it("preserves the existing positive 32-bit path parser and leading-zero behavior", () => {
    expect(parsePathId("1", "listingId")).toBe(1);
    expect(parsePathId("00042", "listingId")).toBe(42);
    expect(parsePathId("2147483647", "listingId")).toBe(2_147_483_647);
  });

  it.each(["", " ", "0", "-1", "1.5", "abc", " 1", "1 ", "1x", "2147483648"])(
    "rejects invalid listing ID %#",
    (value) => expectValidation(() => parsePathId(value, "listingId"), "listingId")
  );
});
