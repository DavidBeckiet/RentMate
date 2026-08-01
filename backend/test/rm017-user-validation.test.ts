import { describe, expect, it } from "vitest";
import { validateUpdateCurrentUserInput } from "../src/modules/users/user-validation.js";
import type { UserRole } from "../src/shared/types/authentication.js";

function expectValidation(body: unknown, role: UserRole): void {
  try {
    validateUpdateCurrentUserInput(body, role);
    throw new Error("expected validation failure");
  } catch (error) {
    expect(error).toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
  }
}

describe("RM-017 current-user validation", () => {
  it("accepts an empty object as a frozen no-op", () => {
    const input = validateUpdateCurrentUserInput({}, "TENANT");

    expect(input).toStrictEqual({ phoneProvided: false, phone: null });
    expect(Object.isFrozen(input)).toBe(true);
  });

  it.each(["TENANT", "LANDLORD", "ADMIN"] as const)("normalizes a valid %s phone", (role) => {
    const input = validateUpdateCurrentUserInput({ phone: "  +84901234567  " }, role);

    expect(input).toStrictEqual({ phoneProvided: true, phone: "+84901234567" });
  });

  it.each(["TENANT", "ADMIN"] as const)("allows explicit null for %s", (role) => {
    expect(validateUpdateCurrentUserInput({ phone: null }, role)).toStrictEqual({
      phoneProvided: true,
      phone: null
    });
  });

  it.each(["TENANT", "ADMIN"] as const)("normalizes blank %s phone to null", (role) => {
    expect(validateUpdateCurrentUserInput({ phone: "   " }, role)).toStrictEqual({
      phoneProvided: true,
      phone: null
    });
  });

  it.each(["TENANT", "LANDLORD", "ADMIN"] as const)("distinguishes omitted phone for %s", (role) => {
    expect(validateUpdateCurrentUserInput({}, role)).toStrictEqual({ phoneProvided: false, phone: null });
  });

  it.each([
    ["explicit null", null],
    ["blank", ""],
    ["whitespace", " \t "]
  ] as const)("rejects landlord %s", (_label, value) => {
    expectValidation({ phone: value }, "LANDLORD");
  });

  it.each(["+123", "84901234567", "+84901234567890123", "+84 abc"] as const)(
    "rejects invalid E.164 input without echoing it",
    (phone) => {
      try {
        validateUpdateCurrentUserInput({ phone }, "TENANT");
        throw new Error("expected validation failure");
      } catch (error) {
        expect(error).toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
        expect(JSON.stringify(error)).not.toContain(phone);
      }
    }
  );

  it.each([
    "unknown",
    "email",
    "role",
    "isActive",
    "id",
    "createdAt",
    "updatedAt",
    "password",
    "passwordHash",
    "phoneE164",
    "userId"
  ] as const)("rejects protected or unknown field %s", (field) => {
    expectValidation({ [field]: "attempt" }, "TENANT");
  });

  it.each([null, [], "body", 123, true])("rejects top-level JSON %s", (body) => {
    expectValidation(body, "TENANT");
  });
});
