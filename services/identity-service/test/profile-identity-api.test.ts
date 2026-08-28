import assert from "node:assert/strict";
import test from "node:test";
import {
  ApplicationError,
  type ValidationDetailCode
} from "../../shared/src/runtime/shared/errors/application-error.js";
import { normalizeDisplayName } from "../../shared/src/runtime/shared/validation/normalization.js";
import { createLoginService } from "../src/modules/auth/services/login-service.js";
import { validateRegistrationInput } from "../src/modules/auth/validations/registration-validation.js";
import { createUsersService } from "../src/modules/users/services/users-service.js";
import { mapRoommateTenantProjectionRow } from "../src/modules/users/roommate-tenant-projection.js";
import { mapUserProfileRow, mapUserProfileToDto } from "../src/modules/users/user-profile.js";
import { validateUpdateCurrentUserInput } from "../src/modules/users/validations/user-validation.js";

function assertDisplayNameIssue(value: unknown, code: ValidationDetailCode): void {
  assert.throws(
    () => normalizeDisplayName(value),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationError);
      assert.equal(error.code, "VALIDATION_FAILED");
      assert.deepEqual(
        error.details.map(({ field, code: detailCode }) => ({ field, code: detailCode })),
        [{ field: "displayName", code }]
      );
      return true;
    }
  );
}

test("Identity normalizes valid display names and enforces the Unicode boundary", () => {
  assert.equal(normalizeDisplayName(" Nguye\u0302\u0303n Gia Kie\u0323\u0302t "), "Nguyễn Gia Kiệt");
  assert.equal(normalizeDisplayName("𠮷".repeat(120)), "𠮷".repeat(120));
  assertDisplayNameIssue(null, "INVALID_TYPE");
  assertDisplayNameIssue("   ", "REQUIRED");
  assertDisplayNameIssue("Gia\u0000Kiệt", "INVALID_VALUE");
  assertDisplayNameIssue("Gia\nKiệt", "INVALID_VALUE");
  assertDisplayNameIssue("𠮷".repeat(121), "TOO_LONG");
});

test("Identity registration keeps displayName optional and rejects invalid supplied values", () => {
  for (const role of ["TENANT", "LANDLORD"] as const) {
    const base = {
      email: `${role.toLowerCase()}@example.com`,
      password: "valid-password",
      ...(role === "LANDLORD" ? { phone: "+84901234567" } : {})
    };

    assert.equal(validateRegistrationInput(base, role).displayName, null);
    assert.equal(
      validateRegistrationInput({ ...base, displayName: "  Cô Ba Nhà Trọ  " }, role).displayName,
      "Cô Ba Nhà Trọ"
    );
    assert.throws(() => validateRegistrationInput({ ...base, displayName: null }, role));
    assert.throws(() => validateRegistrationInput({ ...base, displayName: "" }, role));
  }
});

test("Identity PATCH validation supports displayName and phone while protecting account fields", () => {
  assert.deepEqual(validateUpdateCurrentUserInput({}, "TENANT"), {
    displayNameProvided: false,
    displayName: null,
    phoneProvided: false,
    phone: null
  });
  assert.deepEqual(validateUpdateCurrentUserInput({ displayName: "  Gia Kiệt  " }, "TENANT"), {
    displayNameProvided: true,
    displayName: "Gia Kiệt",
    phoneProvided: false,
    phone: null
  });
  assert.deepEqual(validateUpdateCurrentUserInput({ displayName: "Minh Anh", phone: null }, "TENANT"), {
    displayNameProvided: true,
    displayName: "Minh Anh",
    phoneProvided: true,
    phone: null
  });
  assert.throws(() => validateUpdateCurrentUserInput({ displayName: null }, "TENANT"));
  assert.throws(() => validateUpdateCurrentUserInput({ email: "blocked@example.com" }, "TENANT"));
  assert.throws(() => validateUpdateCurrentUserInput({ role: "ADMIN" }, "TENANT"));
  assert.throws(() => validateUpdateCurrentUserInput({ phone: null }, "LANDLORD"));
});

test("Identity canonical profile and login expose displayName while preserving legacy null", async () => {
  const row = {
    id: 17,
    role: "TENANT" as const,
    display_name: "Nguyễn Gia Kiệt",
    email: "tenant@example.com",
    phone_e164: null,
    is_active: true,
    created_at: new Date("2030-01-01T00:00:00.000Z"),
    updated_at: new Date("2030-01-02T00:00:00.000Z")
  };
  const profile = mapUserProfileRow(row);
  assert.deepEqual(mapUserProfileToDto(profile), {
    id: 17,
    role: "TENANT",
    displayName: "Nguyễn Gia Kiệt",
    email: "tenant@example.com",
    phone: null,
    isActive: true,
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-02T00:00:00.000Z"
  });

  for (const displayName of ["Nguyễn Gia Kiệt", null]) {
    const service = createLoginService({
      findLoginAccount: async () => ({ ...profile, displayName, passwordHash: "stored-hash" }),
      verifyPassword: async () => true,
      missingAccountPasswordHash: "missing-hash"
    });
    assert.equal((await service.login({ email: row.email, password: "valid-password" })).displayName, displayName);
  }
});

test("Identity profile service keeps empty PATCH read-only and sends both changed fields in one repository call", async () => {
  const profile = mapUserProfileRow({
    id: 17,
    role: "TENANT",
    display_name: "Gia Kiệt",
    email: "tenant@example.com",
    phone_e164: "+84901234567",
    is_active: true,
    created_at: new Date("2030-01-01T00:00:00.000Z"),
    updated_at: new Date("2030-01-02T00:00:00.000Z")
  });
  const updates: unknown[] = [];
  const repository = {
    findAuthenticationAccountById: async () => ({ id: 17, role: "TENANT" as const, isActive: true }),
    findProfileById: async () => profile,
    updateProfile: async (_userId: number, input: unknown) => {
      updates.push(input);
      return profile;
    }
  };
  const service = createUsersService(repository);
  const principal = { userId: 17, role: "TENANT" as const };

  assert.equal(await service.updateCurrentUser(principal, { phoneProvided: false, phone: null }), profile);
  assert.equal(updates.length, 0);
  await service.updateCurrentUser(principal, {
    displayNameProvided: true,
    displayName: "Minh Anh",
    phoneProvided: true,
    phone: "+84981112223"
  });
  assert.deepEqual(updates, [
    {
      displayNameProvided: true,
      displayName: "Minh Anh",
      phoneProvided: true,
      phone: "+84981112223"
    }
  ]);
});

test("Identity roommate projection is public-safe and formats memberSince to UTC month", () => {
  assert.deepEqual(
    mapRoommateTenantProjectionRow({
      id: 42,
      role: "TENANT",
      display_name: "Minh Anh",
      is_active: true,
      created_at: new Date("2025-11-30T23:30:00.000Z"),
      email_verified: true,
      phone_verified: false
    }),
    {
      tenantId: 42,
      role: "TENANT",
      displayName: "Minh Anh",
      isActive: true,
      memberSince: "2025-11",
      emailVerified: true,
      phoneVerified: false
    }
  );

  assert.throws(() =>
    mapRoommateTenantProjectionRow({
      id: 42,
      role: "TENANT",
      display_name: "Minh Anh",
      is_active: true,
      created_at: new Date("invalid")
    })
  );
});
