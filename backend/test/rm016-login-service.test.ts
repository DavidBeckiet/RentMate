import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import type { UserRole } from "../src/shared/types/authentication.js";
import type { LoginAccount } from "../src/modules/auth/auth-repository.js";
import { createLoginService, invalidCredentialsMessage } from "../src/modules/auth/login-service.js";

const input = Object.freeze({ email: "user@example.com", password: "input-password" });

function account(role: UserRole = "TENANT", isActive = true): LoginAccount {
  return Object.freeze({
    id: 41,
    role,
    email: "user@example.com",
    phone: null,
    passwordHash: "stored-password-hash-sentinel",
    isActive,
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    updatedAt: new Date("2030-01-02T00:00:00.000Z")
  });
}

async function captureInvalid(operation: () => Promise<unknown>): Promise<ApplicationError> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
      message: invalidCredentialsMessage,
      details: []
    });
    return error as ApplicationError;
  }

  throw new Error("Expected login to fail.");
}

describe("RM-016 login service", () => {
  it.each(["TENANT", "LANDLORD", "ADMIN"] as const)("authenticates an active %s and returns no hash", async (role) => {
    const findLoginAccount = vi.fn().mockResolvedValue(account(role));
    const verifyPassword = vi.fn().mockResolvedValue(true);
    const service = createLoginService({
      findLoginAccount,
      verifyPassword,
      missingAccountPasswordHash: "dummy-hash-sentinel"
    });

    const user = await service.login(input);

    expect(findLoginAccount).toHaveBeenCalledWith("user@example.com");
    expect(verifyPassword).toHaveBeenCalledWith("input-password", "stored-password-hash-sentinel");
    expect(user).toStrictEqual({
      id: 41,
      role,
      email: "user@example.com",
      phone: null,
      isActive: true,
      createdAt: new Date("2030-01-01T00:00:00.000Z"),
      updatedAt: new Date("2030-01-02T00:00:00.000Z")
    });
    expect(user).not.toHaveProperty("passwordHash");
    expect(Object.isFrozen(user)).toBe(true);
  });

  it("uses the injected dummy hash exactly once for a missing account", async () => {
    const verifyPassword = vi.fn().mockResolvedValue(false);
    const service = createLoginService({
      findLoginAccount: vi.fn().mockResolvedValue(null),
      verifyPassword,
      missingAccountPasswordHash: "dummy-hash-sentinel"
    });

    await captureInvalid(() => service.login(input));
    expect(verifyPassword).toHaveBeenCalledOnce();
    expect(verifyPassword).toHaveBeenCalledWith("input-password", "dummy-hash-sentinel");
  });

  it("makes wrong-password and inactive-account failures identical after verification", async () => {
    const cases = [
      { found: account("TENANT", true), matches: false },
      { found: account("TENANT", false), matches: true },
      { found: account("TENANT", false), matches: false }
    ];
    const signatures: unknown[] = [];

    for (const testCase of cases) {
      const events: string[] = [];
      const service = createLoginService({
        findLoginAccount: async () => testCase.found,
        verifyPassword: async () => {
          events.push("verified");
          return testCase.matches;
        },
        missingAccountPasswordHash: "dummy-hash-sentinel"
      });
      const error = await captureInvalid(() => service.login(input));
      signatures.push({ status: error.status, code: error.code, message: error.message, details: error.details });
      expect(events).toStrictEqual(["verified"]);
    }

    expect(signatures[1]).toStrictEqual(signatures[0]);
    expect(signatures[2]).toStrictEqual(signatures[0]);
  });

  it.each(["repository", "verifier", "stored hash"])("does not translate an unexpected %s failure", async (source) => {
    const failure = new Error(`${source} failure sentinel`);
    const service = createLoginService({
      findLoginAccount:
        source === "repository" ? vi.fn().mockRejectedValue(failure) : vi.fn().mockResolvedValue(account()),
      verifyPassword: source === "repository" ? vi.fn() : vi.fn().mockRejectedValue(failure),
      missingAccountPasswordHash: "dummy-hash-sentinel"
    });

    await expect(service.login(input)).rejects.toBe(failure);
  });
});
