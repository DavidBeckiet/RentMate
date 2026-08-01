import { getRounds } from "bcrypt";
import { describe, expect, it } from "vitest";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import {
  createPasswordService,
  StoredPasswordHashError,
  storedPasswordHashErrorMessage
} from "../src/modules/auth/password.js";

const passwordService = createPasswordService({ bcryptCost: 4 });

describe("RM-014 password service factory", () => {
  it("accepts a valid cost and rejects invalid static costs immediately", () => {
    expect(createPasswordService({ bcryptCost: 4 })).toBeDefined();

    for (const bcryptCost of [3, 32, 4.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createPasswordService({ bcryptCost })).toThrowError(
        "bcryptCost must be an integer between 4 and 31."
      );
    }
  });
});

describe("RM-014 password hashing", () => {
  it("preserves the existing minimum-character and UTF-8 byte boundaries", async () => {
    await expect(passwordService.hashPassword("12345678")).resolves.toMatch(/^\$2[aby]\$/);
    await expect(passwordService.hashPassword("1234567")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      status: 422
    });

    const belowLimitEmoji = "😀".repeat(17);
    const exactLimitEmoji = "😀".repeat(18);
    const aboveLimitEmoji = "😀".repeat(19);
    expect(Buffer.byteLength(belowLimitEmoji, "utf8")).toBe(68);
    expect(Buffer.byteLength(exactLimitEmoji, "utf8")).toBe(72);
    expect(Buffer.byteLength(aboveLimitEmoji, "utf8")).toBe(76);

    await expect(passwordService.hashPassword(belowLimitEmoji)).resolves.toMatch(/^\$2[aby]\$/);
    await expect(passwordService.hashPassword(exactLimitEmoji)).resolves.toMatch(/^\$2[aby]\$/);
    await expect(passwordService.hashPassword(aboveLimitEmoji)).rejects.toBeInstanceOf(ApplicationError);
  });

  it("uses configured salted bcrypt hashing without trimming, normalizing, or pre-hashing", async () => {
    const password = " AbCdEf ";
    const firstHash = await passwordService.hashPassword(password);
    const secondHash = await passwordService.hashPassword(password);

    expect(firstHash).not.toBe(secondHash);
    expect(firstHash).not.toBe(password);
    expect(firstHash).not.toContain(password);
    expect(getRounds(firstHash)).toBe(4);
    await expect(passwordService.verifyPassword(password, firstHash)).resolves.toBe(true);
    await expect(passwordService.verifyPassword(password, secondHash)).resolves.toBe(true);
    await expect(passwordService.verifyPassword(password.trim(), firstHash)).resolves.toBe(false);

    const composed = "é".repeat(8);
    const decomposed = "e\u0301".repeat(8);
    const composedHash = await passwordService.hashPassword(composed);
    await expect(passwordService.verifyPassword(composed, composedHash)).resolves.toBe(true);
    await expect(passwordService.verifyPassword(decomposed, composedHash)).resolves.toBe(false);
  });

  it("does not disclose rejected password content", async () => {
    const privatePassword = "SensitivePasswordValue".repeat(4);

    try {
      await passwordService.hashPassword(privatePassword);
      throw new Error("Expected password validation to fail.");
    } catch (error) {
      expect(String(error)).not.toContain(privatePassword);
      expect(JSON.stringify(error)).not.toContain(privatePassword);
    }
  });
});

describe("RM-014 password verification", () => {
  it("accepts the original password and rejects a different valid password", async () => {
    const passwordHash = await passwordService.hashPassword("CorrectPass123");

    await expect(passwordService.verifyPassword("CorrectPass123", passwordHash)).resolves.toBe(true);
    await expect(passwordService.verifyPassword("DifferentPass12", passwordHash)).resolves.toBe(false);
  });

  it("returns false for invalid candidate representations before bcrypt comparison", async () => {
    const passwordHash = await passwordService.hashPassword("ValidPass123");

    await expect(passwordService.verifyPassword("short", passwordHash)).resolves.toBe(false);
    await expect(passwordService.verifyPassword("😀".repeat(19), passwordHash)).resolves.toBe(false);
    await expect(passwordService.verifyPassword(12345678 as unknown as string, passwordHash)).resolves.toBe(false);
  });

  it("prevents a password beyond 72 UTF-8 bytes from matching its bcrypt-truncated prefix", async () => {
    const exactLimitPassword = "a".repeat(72);
    const passwordHash = await passwordService.hashPassword(exactLimitPassword);

    await expect(passwordService.verifyPassword(exactLimitPassword, passwordHash)).resolves.toBe(true);
    await expect(passwordService.verifyPassword(`${exactLimitPassword}b`, passwordHash)).resolves.toBe(false);
  });

  it("treats a malformed stored hash as a sanitized data-integrity failure", async () => {
    const malformedHashes = ["malformed-stored-value", "$2b$04$truncated", `$2b$04$${"a".repeat(52)}!`];

    for (const malformedHash of malformedHashes) {
      await expect(passwordService.verifyPassword("ValidPass123", malformedHash)).rejects.toStrictEqual(
        new StoredPasswordHashError()
      );
    }

    try {
      await passwordService.verifyPassword("ValidPass123", malformedHashes[0]!);
      throw new Error("Expected stored hash validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(StoredPasswordHashError);
      expect((error as Error).message).toBe(storedPasswordHashErrorMessage);
      expect(String(error)).not.toContain(malformedHashes[0]!);
      expect(String(error)).not.toContain("ValidPass123");
    }
  });
});
