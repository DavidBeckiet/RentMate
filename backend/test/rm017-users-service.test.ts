import { describe, expect, it, vi } from "vitest";
import { createUsersService } from "../src/modules/users/users-service.js";
import type { UserProfile } from "../src/modules/users/user-profile.js";
import type { UsersRepository } from "../src/modules/users/users-repository.js";
import type { AuthenticatedPrincipal } from "../src/shared/types/authentication.js";

const profile: UserProfile = Object.freeze({
  id: 17,
  role: "TENANT",
  email: "tenant@example.com",
  phone: "+84901234567",
  isActive: true,
  createdAt: new Date("2030-01-01T00:00:00.000Z"),
  updatedAt: new Date("2030-01-02T00:00:00.000Z")
});

function makeRepository(overrides: Partial<UsersRepository> = {}): UsersRepository {
  return {
    findAuthenticationAccountById: vi.fn().mockResolvedValue({ id: profile.id, role: profile.role, isActive: true }),
    findProfileById: vi.fn().mockResolvedValue(profile),
    updatePhone: vi.fn().mockResolvedValue(profile),
    ...overrides
  };
}

function principal(role: AuthenticatedPrincipal["role"] = "TENANT"): AuthenticatedPrincipal {
  return Object.freeze({ userId: profile.id, role });
}

describe("RM-017 users service", () => {
  it("uses only the authenticated principal ID for profile reads", async () => {
    const repository = makeRepository();
    const service = createUsersService(repository);

    await expect(service.getCurrentUser(principal())).resolves.toBe(profile);
    expect(repository.findProfileById).toHaveBeenCalledWith(17);
    expect(repository.findProfileById).not.toHaveBeenCalledWith(expect.any(String));
    expect(profile).not.toHaveProperty("passwordHash");
  });

  it("maps a missing profile to the existing authentication-required error", async () => {
    const repository = makeRepository({ findProfileById: vi.fn().mockResolvedValue(null) });
    const service = createUsersService(repository);

    await expect(service.getCurrentUser(principal())).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      status: 401
    });
  });

  it("preserves repository failures as internal dependencies", async () => {
    const failure = new Error("private users repository failure");
    const repository = makeRepository({ findProfileById: vi.fn().mockRejectedValue(failure) });
    const service = createUsersService(repository);

    await expect(service.getCurrentUser(principal())).rejects.toBe(failure);
  });

  it.each(["TENANT", "ADMIN"] as const)("allows %s to clear phone", async (role) => {
    const updatePhone = vi.fn().mockResolvedValue({ ...profile, role, phone: null });
    const repository = makeRepository({ updatePhone });
    const service = createUsersService(repository);

    await expect(
      service.updateCurrentUserPhone(principal(role), { phoneProvided: true, phone: null })
    ).resolves.toMatchObject({ role, phone: null });
    expect(updatePhone).toHaveBeenCalledWith(17, null);
  });

  it("rejects landlord null before reaching the repository", async () => {
    const repository = makeRepository();
    const service = createUsersService(repository);

    await expect(
      service.updateCurrentUserPhone(principal("LANDLORD"), { phoneProvided: true, phone: null })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
    expect(repository.updatePhone).not.toHaveBeenCalled();
  });

  it("performs a profile read only for omitted phone", async () => {
    const repository = makeRepository();
    const service = createUsersService(repository);

    await expect(
      service.updateCurrentUserPhone(principal("LANDLORD"), { phoneProvided: false, phone: null })
    ).resolves.toBe(profile);
    expect(repository.findProfileById).toHaveBeenCalledWith(17);
    expect(repository.updatePhone).not.toHaveBeenCalled();
  });

  it("uses the conditional update for a provided phone", async () => {
    const updated = Object.freeze({ ...profile, phone: "+84981112223" });
    const updatePhone = vi.fn().mockResolvedValue(updated);
    const repository = makeRepository({ updatePhone });
    const service = createUsersService(repository);

    await expect(
      service.updateCurrentUserPhone(principal(), { phoneProvided: true, phone: "+84981112223" })
    ).resolves.toBe(updated);
    expect(updatePhone).toHaveBeenCalledWith(17, "+84981112223");
    expect(repository.findProfileById).not.toHaveBeenCalled();
  });

  it.each([
    ["same phone", profile],
    ["meaningful replacement", { ...profile, phone: "+84981112223" }]
  ] as const)("returns the repository profile for %s", async (_label, returnedProfile) => {
    const repository = makeRepository({ updatePhone: vi.fn().mockResolvedValue(returnedProfile) });
    const service = createUsersService(repository);

    await expect(
      service.updateCurrentUserPhone(principal(), { phoneProvided: true, phone: returnedProfile.phone })
    ).resolves.toBe(returnedProfile);
  });

  it("maps missing or inactive update results to authentication-required", async () => {
    const repository = makeRepository({ updatePhone: vi.fn().mockResolvedValue(null) });
    const service = createUsersService(repository);

    await expect(
      service.updateCurrentUserPhone(principal(), { phoneProvided: true, phone: "+84981112223" })
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED", status: 401 });
  });
});
