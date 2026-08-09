import { describe, expect, it } from "vitest";
import {
  parseAdminListingId,
  validateAdminDetailQuery,
  validateAdminListingCollectionQuery,
  validateAdminModerationHistoryQuery,
  validateAdminReadBody
} from "../src/modules/listings/admin-listing-read-validation.js";

function expectValidation(run: () => unknown, field?: string): void {
  try {
    run();
    throw new Error("Expected validation failure.");
  } catch (error) {
    expect(error).toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
    if (field) expect((error as { details: Array<{ field: string }> }).details[0]?.field).toBe(field);
  }
}

describe("RM-041 admin listing read validation", () => {
  it("defaults queue status and pagination", () => {
    expect(validateAdminListingCollectionQuery({})).toStrictEqual({
      status: "PENDING",
      page: 1,
      pageSize: 20,
      offset: 0
    });
  });

  it.each(["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"])("accepts and normalizes %s", (status) => {
    expect(validateAdminListingCollectionQuery({ status: `  ${status.toLowerCase()}  ` }).status).toBe(status);
  });

  it("rejects unknown, duplicate, nested, and unsupported ALL status values", () => {
    for (const query of [
      { status: "ALL" },
      { status: ["PENDING", "APPROVED"] },
      { page: ["1", "2"] },
      { pageSize: { nested: "20" } },
      { unexpected: "x" }
    ]) {
      expectValidation(() => validateAdminListingCollectionQuery(query));
    }
  });

  it("uses shared pagination limits and safe offsets for queue and history", () => {
    expect(validateAdminListingCollectionQuery({ page: "2", pageSize: "100" })).toMatchObject({
      page: 2,
      pageSize: 100,
      offset: 100
    });
    expect(validateAdminModerationHistoryQuery({ page: "3", pageSize: "5" })).toStrictEqual({
      page: 3,
      pageSize: 5,
      offset: 10
    });
    expectValidation(() => validateAdminModerationHistoryQuery({ pageSize: "101" }), "pageSize");
    expectValidation(() => validateAdminModerationHistoryQuery({ status: "PENDING" }), "status");
  });

  it("reuses positive int32 path parsing including leading zeros", () => {
    expect(parseAdminListingId("00042")).toBe(42);
    for (const value of ["0", "-1", "1.5", "1e2", " 1", "x", "2147483648"]) {
      expectValidation(() => parseAdminListingId(value), "listingId");
    }
    expectValidation(() => parseAdminListingId(["1", "2"]), "listingId");
  });

  it("requires absent bodies and no detail query", () => {
    expect(() => validateAdminReadBody(undefined)).not.toThrow();
    expect(() => validateAdminDetailQuery({})).not.toThrow();
    for (const body of [{}, null, "", []]) expectValidation(() => validateAdminReadBody(body), "body");
    expectValidation(() => validateAdminDetailQuery({ page: "1" }), "page");
  });
});
