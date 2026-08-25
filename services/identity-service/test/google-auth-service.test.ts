import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { TransactionRunner } from "../src/shared/transaction.js";
import type { PasswordService } from "../src/modules/auth/password.js";
import type { LoginAccount } from "../src/modules/auth/repositories/auth-repository.js";
import type { GoogleAuthRepository } from "../src/modules/auth/repositories/google-auth-repository.js";
import { createGoogleAuthService } from "../src/modules/auth/services/google-auth-service.js";
import type { GoogleOAuthClient, GoogleProfile } from "../src/modules/auth/google-oauth-client.js";
import type { GoogleOAuthState } from "../src/modules/auth/google-oauth-state.js";

const now = new Date("2026-08-26T00:00:00.000Z");
const executor: SqlExecutor = { query: async () => ({ rows: [], rowCount: 0 }) as never };
const stateBase: Omit<GoogleOAuthState, "intent" | "role" | "phone"> = {
  state: "state_abcdefghijklmnopqrstuvwxyz123",
  codeVerifier: "verifier_abcdefghijklmnopqrstuvwxyz123"
};
const profile: GoogleProfile = {
  subject: "google-subject-1",
  email: "google@example.com",
  displayName: "Google User"
};
const tenantProfile = {
  id: 17,
  role: "TENANT" as const,
  displayName: "Google User",
  email: "google@example.com",
  phone: null,
  isActive: true,
  createdAt: now,
  updatedAt: now
};

function state(intent: "LOGIN" | "REGISTER", role: "TENANT" | "LANDLORD" | null = null, phone: string | null = null) {
  return Object.freeze({ ...stateBase, intent, role, phone });
}

function account(overrides: Partial<LoginAccount> = {}): LoginAccount {
  return {
    ...tenantProfile,
    passwordHash: "$2b$04$valid-hash-placeholder",
    ...overrides
  };
}

function createHarness(
  options: {
    readonly linked?: typeof tenantProfile | null;
    readonly existing?: LoginAccount | null;
  } = {}
) {
  const calls = { linked: 0, link: [] as unknown[], create: [] as unknown[] };
  const repository: GoogleAuthRepository = {
    async findUserByProviderSubject() {
      calls.linked += 1;
      return options.linked ?? null;
    },
    async linkProviderSubject(_executor, userId, providerSubject) {
      calls.link.push({ userId, providerSubject });
    },
    async createUserAndLinkProvider(_executor, input) {
      calls.create.push(input);
      return tenantProfile;
    }
  };
  const client: GoogleOAuthClient = {
    createAuthorizationUrl: () => "https://accounts.google.com/oauth",
    exchangeCode: async () => profile
  };
  const passwordService: PasswordService = {
    hashPassword: async () => "generated-google-password-hash",
    verifyPassword: async () => false
  };
  const transactionRunner: TransactionRunner = (operation) => operation(executor);
  const service = createGoogleAuthService({
    client,
    repository,
    loginRepository: { findLoginAccount: async () => options.existing ?? null },
    passwordService,
    transactionRunner
  });
  return { service, calls };
}

test("creates a tenant account and links the verified Google subject", async () => {
  const harness = createHarness();
  const result = await harness.service.complete({ code: "oauth-code", state: state("REGISTER", "TENANT") });

  assert.equal(result.id, tenantProfile.id);
  assert.equal(harness.calls.create.length, 1);
  assert.deepEqual(harness.calls.create[0], {
    role: "TENANT",
    displayName: "Google User",
    email: "google@example.com",
    phone: null,
    passwordHash: "generated-google-password-hash",
    providerSubject: "google-subject-1"
  });
});

test("keeps the landlord phone requirement in Google registration", async () => {
  const harness = createHarness();
  await harness.service.complete({
    code: "oauth-code",
    state: state("REGISTER", "LANDLORD", "+84901234567")
  });

  assert.equal((harness.calls.create[0] as { phone: string }).phone, "+84901234567");
});

test("links an existing verified-email account during Google login", async () => {
  const existing = account({ id: 19, email: profile.email });
  const harness = createHarness({ existing });
  const result = await harness.service.complete({ code: "oauth-code", state: state("LOGIN") });

  assert.equal(result.id, existing.id);
  assert.deepEqual(harness.calls.link, [{ userId: existing.id, providerSubject: profile.subject }]);
});

test("does not link or authenticate an admin through Google", async () => {
  const existing = account({ id: 23, role: "ADMIN", email: profile.email });
  const harness = createHarness({ existing });

  await assert.rejects(
    () => harness.service.complete({ code: "oauth-code", state: state("LOGIN") }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "INVALID_CREDENTIALS"
  );
  assert.deepEqual(harness.calls.link, []);
});

test("does not silently register or re-register accounts in the wrong intent", async () => {
  const missing = createHarness();
  await assert.rejects(
    () => missing.service.complete({ code: "oauth-code", state: state("LOGIN") }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "GOOGLE_ACCOUNT_NOT_REGISTERED"
  );

  const existing = createHarness({ existing: account({ email: profile.email }) });
  await assert.rejects(
    () => existing.service.complete({ code: "oauth-code", state: state("REGISTER", "TENANT") }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "GOOGLE_ACCOUNT_EXISTS"
  );
});
