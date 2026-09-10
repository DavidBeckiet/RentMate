import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { TransactionRunner } from "../src/shared/transaction.js";
import type { PasswordService } from "../src/modules/auth/password.js";
import type { LoginAccount, LoginAuthRepository } from "../src/modules/auth/repositories/auth-repository.js";
import type {
  PasswordResetRepository,
  PasswordResetToken
} from "../src/modules/auth/repositories/password-reset-repository.js";
import { createPasswordResetService } from "../src/modules/auth/services/password-reset-service.js";
import type { PasswordResetDeliveryInput } from "../src/modules/auth/password-reset-delivery.js";

const now = new Date("2026-08-25T10:00:00.000Z");
const account: LoginAccount = Object.freeze({
  id: 17,
  role: "TENANT",
  displayName: "Tenant",
  email: "tenant@example.test",
  phone: null,
  passwordHash: "$2b$04$valid-hash-placeholder",
  isActive: true,
  createdAt: now,
  updatedAt: now
});
const executor: SqlExecutor = {
  query: async () => {
    throw new Error("SQL is not used by this service test.");
  }
};

function createHarness() {
  let storedToken: PasswordResetToken | null = null;
  let updatedPasswordHash: string | null = null;
  let consumed = false;
  const deliveries: PasswordResetDeliveryInput[] = [];
  const repository: PasswordResetRepository = {
    async invalidateActiveTokens() {
      storedToken = null;
    },
    async createToken(_executor, input) {
      storedToken = Object.freeze({
        id: 3,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt
      });
    },
    async findActiveTokenForUserForUpdate() {
      return storedToken;
    },
    async consumeToken() {
      consumed = true;
      return true;
    },
    async updatePasswordHash(_executor, _userId, passwordHash) {
      updatedPasswordHash = passwordHash;
      return true;
    }
  };
  const authRepository: LoginAuthRepository = {
    async findLoginAccount(email) {
      return email === account.email ? account : null;
    }
  };
  const passwordService: PasswordService = {
    async hashPassword(password) {
      return `hashed:${password}`;
    },
    async verifyPassword() {
      return false;
    }
  };
  const transactionRunner: TransactionRunner = (operation) => operation(executor);
  const service = createPasswordResetService({
    authRepository,
    passwordResetRepository: repository,
    passwordService,
    transactionRunner,
    delivery: {
      async deliver(input) {
        deliveries.push(input);
      }
    },
    secretPepper: "test-pepper",
    now: () => now,
    createCode: () => "012345"
  });
  return {
    service,
    deliveries,
    getStoredToken: () => storedToken,
    getUpdatedPasswordHash: () => updatedPasswordHash,
    isConsumed: () => consumed
  };
}

test("creates a hashed six-digit code scoped to the account and confirms it exactly once", async () => {
  const harness = createHarness();
  await harness.service.request({ email: account.email });
  const token = harness.getStoredToken();
  assert.ok(token);
  assert.notEqual(token.tokenHash, "012345");
  assert.equal(harness.deliveries.length, 1);
  assert.deepEqual(harness.deliveries[0], { destination: account.email, secret: "012345" });

  await harness.service.confirm({
    email: account.email,
    code: "012345",
    password: "new-password"
  });
  assert.equal(harness.getUpdatedPasswordHash(), "hashed:new-password");
  assert.equal(harness.isConsumed(), true);
});

test("rejects a wrong reset code without changing the password or consuming the active code", async () => {
  const harness = createHarness();
  await harness.service.request({ email: account.email });

  await assert.rejects(
    () => harness.service.confirm({ email: account.email, code: "999999", password: "new-password" }),
    /không hợp lệ hoặc đã hết hạn/u
  );
  assert.equal(harness.getUpdatedPasswordHash(), null);
  assert.equal(harness.isConsumed(), false);
});

test("does not reveal whether an account exists and rejects a missing active reset code", async () => {
  const harness = createHarness();
  await harness.service.request({ email: "missing@example.test" });
  assert.equal(harness.deliveries.length, 0);
  const missingRepository: PasswordResetRepository = {
    invalidateActiveTokens: async () => {},
    createToken: async () => {},
    findActiveTokenForUserForUpdate: async () => null,
    consumeToken: async () => false,
    updatePasswordHash: async () => false
  };
  const missingService = createPasswordResetService({
    authRepository: {
      findLoginAccount: async () => account
    },
    passwordResetRepository: missingRepository,
    passwordService: {
      hashPassword: async (password) => password,
      verifyPassword: async () => false
    },
    transactionRunner: (operation) => operation(executor),
    delivery: { deliver: async () => {} },
    secretPepper: "test-pepper",
    now: () => now
  });
  await assert.rejects(
    () => missingService.confirm({ email: account.email, code: "012345", password: "new-password" }),
    /không hợp lệ hoặc đã hết hạn/u
  );
});
