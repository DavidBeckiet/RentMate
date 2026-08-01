import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import { validateLoginInput, validateLogoutBody } from "../src/modules/auth/login-validation.js";

function captureValidation(operation: () => unknown): ApplicationError {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
    return error as ApplicationError;
  }

  throw new Error("Expected validation to fail.");
}

describe("RM-016 login validation", () => {
  it("normalizes email while preserving an accepted password exactly", () => {
    const password = "  pass word  ";
    const input = validateLoginInput({ email: "  Tenant@Example.COM  ", password });

    expect(input).toStrictEqual({ email: "tenant@example.com", password });
    expect(Object.isFrozen(input)).toBe(true);
  });

  it.each([
    ["exactly eight characters", "12345678"],
    ["exactly 72 UTF-8 bytes", "a".repeat(72)],
    ["multibyte value at 72 UTF-8 bytes", "é".repeat(36)]
  ])("accepts %s", (_label, password) => {
    expect(validateLoginInput({ email: "user@example.com", password }).password).toBe(password);
  });

  it.each([
    ["missing email", { password: "valid-password" }],
    ["missing password", { email: "user@example.com" }],
    ["invalid email", { email: "invalid", password: "valid-password" }],
    ["oversized email", { email: `${"a".repeat(310)}@example.com`, password: "valid-password" }],
    ["seven-character password", { email: "user@example.com", password: "1234567" }],
    ["password above 72 bytes", { email: "user@example.com", password: "a".repeat(73) }],
    ["multibyte password above 72 bytes", { email: "user@example.com", password: `${"é".repeat(36)}a` }],
    ["unknown field", { email: "user@example.com", password: "valid-password", id: 1 }],
    ["attempted role", { email: "user@example.com", password: "valid-password", role: "ADMIN" }],
    ["attempted phone", { email: "user@example.com", password: "valid-password", phone: "+84123456789" }],
    ["attempted active state", { email: "user@example.com", password: "valid-password", isActive: true }],
    ["attempted password hash", { email: "user@example.com", password: "valid-password", passwordHash: "value" }],
    ["null body", null],
    ["array body", []],
    ["primitive body", "body"]
  ])("rejects %s", (_label, body) => {
    captureValidation(() => validateLoginInput(body));
  });

  it("collects deterministic safe issues without exposing password values", () => {
    const password = "seven77";
    const error = captureValidation(() =>
      validateLoginInput({ email: "invalid", password, zField: true, aField: true })
    );

    expect(error.details.map(({ field }) => field)).toEqual(["aField", "zField", "email", "password"]);
    expect(JSON.stringify(error)).not.toContain(password);
  });
});

describe("RM-016 logout body validation", () => {
  it("accepts only an omitted body", () => {
    expect(validateLogoutBody(undefined)).toBeUndefined();
  });

  it.each([{}, null, [], "body", 1, { field: true }])("rejects every parsed JSON value", (body) => {
    const error = captureValidation(() => validateLogoutBody(body));
    expect(error.details).toStrictEqual([{ field: "body", code: "INVALID_VALUE", message: "body must be omitted." }]);
  });
});
