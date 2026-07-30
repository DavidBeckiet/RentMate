import { describe, expect, it } from "vitest";
import {
  AdminProvisioningInputError,
  defaultBcryptCost,
  readAdminProvisioningInput
} from "../src/db/admin-provisioning/input.js";

const validEnvironment = {
  RENTMATE_ADMIN_EMAIL: "admin@example.com",
  RENTMATE_ADMIN_PASSWORD: "StrongPass123"
} satisfies NodeJS.ProcessEnv;

describe("RM-008 admin provisioning input", () => {
  it("trims and lowercases the admin email", () => {
    const input = readAdminProvisioningInput({
      ...validEnvironment,
      RENTMATE_ADMIN_EMAIL: "  ADMIN@Example.COM  "
    });

    expect(input.email).toBe("admin@example.com");
  });

  it("rejects blank, invalid, whitespace-containing, and oversized emails", () => {
    const invalidEmails = [
      "",
      "   ",
      "admin",
      "admin@example",
      "admin @example.com",
      "admin@exam ple.com",
      `${"a".repeat(310)}@example.com`
    ];

    for (const email of invalidEmails) {
      expect(() =>
        readAdminProvisioningInput({
          ...validEnvironment,
          RENTMATE_ADMIN_EMAIL: email
        })
      ).toThrowError(AdminProvisioningInputError);
    }
  });

  it("rejects a missing, empty, or shorter-than-eight-character password", () => {
    expect(() =>
      readAdminProvisioningInput({
        RENTMATE_ADMIN_EMAIL: validEnvironment.RENTMATE_ADMIN_EMAIL
      })
    ).toThrowError("RENTMATE_ADMIN_PASSWORD is required");

    for (const password of ["", "short", "1234567"]) {
      expect(() =>
        readAdminProvisioningInput({
          ...validEnvironment,
          RENTMATE_ADMIN_PASSWORD: password
        })
      ).toThrowError("at least 8 characters");
    }
  });

  it("accepts exactly 72 UTF-8 bytes and rejects more than 72 UTF-8 bytes", () => {
    const exactPassword = "é".repeat(36);
    const oversizedPassword = "é".repeat(37);

    expect(Buffer.byteLength(exactPassword, "utf8")).toBe(72);
    expect(readAdminProvisioningInput({ ...validEnvironment, RENTMATE_ADMIN_PASSWORD: exactPassword }).password).toBe(
      exactPassword
    );
    expect(() =>
      readAdminProvisioningInput({
        ...validEnvironment,
        RENTMATE_ADMIN_PASSWORD: oversizedPassword
      })
    ).toThrowError("72 UTF-8 bytes");
  });

  it("preserves password case and meaningful surrounding whitespace", () => {
    const password = " AbCdEf ";

    expect(readAdminProvisioningInput({ ...validEnvironment, RENTMATE_ADMIN_PASSWORD: password }).password).toBe(
      password
    );
  });

  it("normalizes missing and blank phone input to null", () => {
    expect(readAdminProvisioningInput(validEnvironment).phoneE164).toBeNull();
    expect(
      readAdminProvisioningInput({
        ...validEnvironment,
        RENTMATE_ADMIN_PHONE_E164: "   "
      }).phoneE164
    ).toBeNull();
  });

  it("trims valid E.164 phone input and rejects invalid phone input", () => {
    expect(
      readAdminProvisioningInput({
        ...validEnvironment,
        RENTMATE_ADMIN_PHONE_E164: "  +84901234567  "
      }).phoneE164
    ).toBe("+84901234567");

    for (const phone of ["84901234567", "+012345678", "+1234567", "+1234567890123456"]) {
      expect(() =>
        readAdminProvisioningInput({
          ...validEnvironment,
          RENTMATE_ADMIN_PHONE_E164: phone
        })
      ).toThrowError("E.164");
    }
  });

  it("uses bcrypt cost 12 by default and accepts supported integer costs", () => {
    expect(readAdminProvisioningInput(validEnvironment).bcryptCost).toBe(defaultBcryptCost);
    expect(readAdminProvisioningInput({ ...validEnvironment, BCRYPT_COST: "4" }).bcryptCost).toBe(4);
    expect(readAdminProvisioningInput({ ...validEnvironment, BCRYPT_COST: "31" }).bcryptCost).toBe(31);
  });

  it("rejects unsupported or non-integer bcrypt costs", () => {
    for (const bcryptCost of ["3", "32", "12.5", "abc"]) {
      expect(() => readAdminProvisioningInput({ ...validEnvironment, BCRYPT_COST: bcryptCost })).toThrowError(
        "BCRYPT_COST"
      );
    }
  });

  it("never includes rejected plaintext password content in validation errors", () => {
    const password = "topsecret";
    let error: unknown;

    try {
      readAdminProvisioningInput({
        RENTMATE_ADMIN_EMAIL: "",
        RENTMATE_ADMIN_PASSWORD: password
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(AdminProvisioningInputError);
    expect((error as Error).message).not.toContain(password);
  });
});
