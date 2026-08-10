import { describe, expect, it } from "vitest";
import {
  parseAdminUserId,
  validateAdminUserActivationBody,
  validateAdminUserActivationQuery,
  validateAdminUserCollectionQuery,
  validateAdminUserReadBody
} from "../src/modules/users/admin-user-validation.js";

function expectValidation(run: () => unknown, field?: string): void {
  try {
    run();
    throw new Error("Expected validation failure.");
  } catch (error) {
    expect(error).toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
    if (field) expect((error as { details: Array<{ field: string }> }).details[0]?.field).toBe(field);
  }
}

describe("RM-043 admin user validation", () => {
  it("defaults filters and pagination", () => {
    expect(validateAdminUserCollectionQuery({})).toStrictEqual({
      role: null,
      isActive: null,
      page: 1,
      pageSize: 20,
      offset: 0
    });
  });

  it.each([
    [" tenant ", "TENANT"],
    ["Landlord", "LANDLORD"],
    ["ADMIN", "ADMIN"]
  ] as const)("normalizes role %s", (raw, expected) => {
    expect(validateAdminUserCollectionQuery({ role: raw }).role).toBe(expected);
  });

  it("accepts only exact lowercase boolean query text", () => {
    expect(validateAdminUserCollectionQuery({ isActive: "true" }).isActive).toBe(true);
    expect(validateAdminUserCollectionQuery({ isActive: "false" }).isActive).toBe(false);
    for (const value of ["TRUE", "FALSE", "True", "False", "1", "0", "yes", "no", " true ", "false ", ""]) {
      expectValidation(() => validateAdminUserCollectionQuery({ isActive: value }), "isActive");
    }
  });

  it("rejects unsupported roles and malformed collection queries", () => {
    for (const query of [
      { role: "ALL" },
      { role: "USER" },
      { role: "OWNER" },
      { role: "" },
      { role: ["TENANT", "LANDLORD"] },
      { isActive: ["true", "false"] },
      { page: ["1", "2"] },
      { pageSize: { nested: "20" } },
      { unexpected: "x" }
    ]) {
      expectValidation(() => validateAdminUserCollectionQuery(query));
    }
  });

  it("reuses shared pagination limits and protects safe offset", () => {
    expect(validateAdminUserCollectionQuery({ page: "2", pageSize: "100" })).toMatchObject({
      page: 2,
      pageSize: 100,
      offset: 100
    });
    expectValidation(() => validateAdminUserCollectionQuery({ pageSize: "101" }), "pageSize");
    expectValidation(
      () => validateAdminUserCollectionQuery({ page: String(Number.MAX_SAFE_INTEGER), pageSize: "100" }),
      "page"
    );
  });

  it("requires an absent GET body", () => {
    expect(() => validateAdminUserReadBody(undefined)).not.toThrow();
    for (const body of [{}, null, "", []]) expectValidation(() => validateAdminUserReadBody(body), "body");
  });

  it("parses positive int32 user IDs and rejects malformed paths", () => {
    expect(parseAdminUserId("00042")).toBe(42);
    for (const value of ["0", "-1", "1.5", "1e2", " 1", "x", "2147483648"]) {
      expectValidation(() => parseAdminUserId(value), "userId");
    }
    expectValidation(() => parseAdminUserId(["1", "2"]), "userId");
  });

  it("accepts only an exact required JSON boolean activation body and no query", () => {
    expect(validateAdminUserActivationBody({ isActive: true })).toStrictEqual({ isActive: true });
    expect(validateAdminUserActivationBody({ isActive: false })).toStrictEqual({ isActive: false });
    expect(() => validateAdminUserActivationQuery({})).not.toThrow();
    for (const body of [
      {},
      null,
      [],
      "true",
      1,
      true,
      { isActive: null },
      { isActive: "true" },
      { isActive: 1 },
      { isActive: true, role: "TENANT" },
      { isActive: true, email: "x@example.com" }
    ]) {
      expectValidation(() => validateAdminUserActivationBody(body));
    }
    expectValidation(() => validateAdminUserActivationQuery({ page: "1" }), "page");
  });
});
