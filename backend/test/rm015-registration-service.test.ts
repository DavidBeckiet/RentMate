import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import { createRegistrationService } from "../src/modules/auth/registration-service.js";
import { RegistrationEmailAlreadyExistsError } from "../src/modules/auth/auth-repository.js";
import type { AuthRepository } from "../src/modules/auth/auth-repository.js";
import type { PasswordService } from "../src/modules/auth/password.js";

const registeredUser = Object.freeze({
  id: 9,
  role: "TENANT" as const,
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: new Date("2030-01-01T00:00:00.000Z"),
  updatedAt: new Date("2030-01-01T00:00:00.000Z")
});

const input = Object.freeze({ email: "tenant@example.com", password: "plain-password", phone: null });

describe("RM-015 registration service", () => {
  it("hashes before persistence and never sends the plaintext to the repository", async () => {
    const hashPassword = vi.fn().mockResolvedValue("fake-rm015-bcrypt-hash");
    const createUser = vi.fn().mockResolvedValue(registeredUser);
    const service = createRegistrationService({
      passwordService: { hashPassword } as unknown as PasswordService,
      authRepository: { createUser } as unknown as AuthRepository
    });

    await expect(service.register("TENANT", input)).resolves.toBe(registeredUser);
    expect(hashPassword).toHaveBeenCalledWith("plain-password");
    expect(createUser).toHaveBeenCalledWith({
      role: "TENANT",
      email: "tenant@example.com",
      phone: null,
      passwordHash: "fake-rm015-bcrypt-hash"
    });
    expect(JSON.stringify(createUser.mock.calls[0][0])).not.toContain("plain-password");
  });

  it("preserves landlord role and phone in the persistence record", async () => {
    const createUser = vi.fn().mockResolvedValue({ ...registeredUser, role: "LANDLORD", phone: "+84901234567" });
    const service = createRegistrationService({
      passwordService: { hashPassword: vi.fn().mockResolvedValue("hash") } as unknown as PasswordService,
      authRepository: { createUser } as unknown as AuthRepository
    });

    await service.register("LANDLORD", { ...input, phone: "+84901234567" });
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ role: "LANDLORD", phone: "+84901234567" }));
  });

  it("maps only the duplicate-email domain failure to a safe conflict", async () => {
    const service = createRegistrationService({
      passwordService: { hashPassword: vi.fn().mockResolvedValue("hash") } as unknown as PasswordService,
      authRepository: {
        createUser: vi.fn().mockRejectedValue(new RegistrationEmailAlreadyExistsError())
      } as unknown as AuthRepository
    });

    await expect(service.register("TENANT", input)).rejects.toMatchObject({
      code: "EMAIL_ALREADY_EXISTS",
      status: 409,
      message: "An account with this email already exists."
    });
    try {
      await service.register("TENANT", input);
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect(JSON.stringify(error)).not.toContain("plain-password");
    }
  });

  it("rethrows unexpected persistence failures without broad translation", async () => {
    const failure = new Error("database unavailable");
    const service = createRegistrationService({
      passwordService: { hashPassword: vi.fn().mockResolvedValue("hash") } as unknown as PasswordService,
      authRepository: { createUser: vi.fn().mockRejectedValue(failure) } as unknown as AuthRepository
    });

    await expect(service.register("TENANT", input)).rejects.toBe(failure);
  });
});
