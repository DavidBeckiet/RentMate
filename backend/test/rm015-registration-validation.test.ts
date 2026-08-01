import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import { validateRegistrationInput } from "../src/modules/auth/registration-validation.js";

function expectValidationError(action: () => unknown) {
  try {
    action();
    throw new Error("Expected validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as ApplicationError).code).toBe("VALIDATION_FAILED");
    return error as ApplicationError;
  }
}

describe("RM-015 registration validation", () => {
  it("normalizes tenant input while preserving the password representation", () => {
    const result = validateRegistrationInput(
      { email: "  Tenant@Example.COM ", password: "  PassWord  ", phone: "  +84901234567  " },
      "TENANT"
    );

    expect(result).toStrictEqual({
      email: "tenant@example.com",
      password: "  PassWord  ",
      phone: "+84901234567"
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("allows a tenant to omit, null, or blank-normalize its phone", () => {
    for (const body of [
      { email: "tenant@example.com", password: "valid-password" },
      { email: "tenant@example.com", password: "valid-password", phone: null },
      { email: "tenant@example.com", password: "valid-password", phone: "   " }
    ]) {
      expect(validateRegistrationInput(body, "TENANT").phone).toBeNull();
    }
  });

  it("requires a valid E.164 phone for landlords", () => {
    for (const phone of [undefined, null, "", "   ", "0901234567", "+84901234567890123"]) {
      const error = expectValidationError(() =>
        validateRegistrationInput({ email: "landlord@example.com", password: "valid-password", phone }, "LANDLORD")
      );

      expect(error.details).toEqual([expect.objectContaining({ field: "phone", code: expect.any(String) })]);
    }
  });

  it("collects unknown fields and field validation errors deterministically", () => {
    const error = expectValidationError(() =>
      validateRegistrationInput(
        {
          role: "ADMIN",
          id: 99,
          email: "not-an-email",
          password: "short",
          phone: "123"
        },
        "TENANT"
      )
    );

    expect(error.details.map((detail) => detail.field)).toEqual(["id", "role", "email", "password", "phone"]);
    expect(JSON.stringify(error)).not.toContain("ADMIN");
    expect(JSON.stringify(error)).not.toContain("short");
  });

  it("rejects non-object bodies and invalid scalar fields without leaking values", () => {
    for (const body of [null, [], "body", 42]) {
      const error = expectValidationError(() => validateRegistrationInput(body, "TENANT"));
      expect(error.details[0]).toEqual(expect.objectContaining({ field: "body", code: "INVALID_TYPE" }));
    }

    const error = expectValidationError(() =>
      validateRegistrationInput({ email: 42, password: 42, phone: 42 }, "TENANT")
    );
    expect(error.details.map((detail) => detail.field)).toEqual(["email", "password", "phone"]);
    expect(JSON.stringify(error)).not.toContain('"email":42');
  });
});
