import assert from "node:assert/strict";
import test from "node:test";
import { AdminProvisioningInputError, readAdminProvisioningInput } from "../src/admin-provisioning/input.js";
import {
  AdminProvisioningConflictError,
  AdminProvisioningError,
  provisionAdmin
} from "../src/admin-provisioning/provision-admin.js";

type ProvisioningPool = Parameters<typeof provisionAdmin>[0];
type PasswordHasher = Parameters<typeof provisionAdmin>[1];

function input() {
  return { email: "admin@example.test", password: "correct horse battery staple", phone: "+84901234567" };
}

function fixture(rowsByStatement: Readonly<Record<string, readonly Record<string, unknown>[]>>) {
  const statements: { readonly text: string; readonly values: readonly unknown[] }[] = [];
  let released = false;
  const client = {
    async query(query: { readonly text: string; readonly values: readonly unknown[] }) {
      const text = query.text.trim();
      statements.push({ text, values: query.values });
      const key = text.split(/\s+/u)[0]?.toUpperCase() ?? "";
      return { rows: [...(rowsByStatement[key] ?? [])] };
    },
    release() {
      released = true;
    }
  };
  const pool = {
    async connect() {
      return client;
    }
  } as unknown as ProvisioningPool;
  const passwordService: PasswordHasher = {
    async hashPassword() {
      return "$2b$12$provisioning-test-hash";
    }
  };
  return { pool, passwordService, statements, wasReleased: () => released };
}

test("normalizes controlled admin input and enforces password bytes plus E.164 phone", () => {
  assert.deepEqual(
    readAdminProvisioningInput({
      RENTMATE_ADMIN_EMAIL: "  ADMIN@Example.Test ",
      RENTMATE_ADMIN_PASSWORD: "correct horse battery staple",
      RENTMATE_ADMIN_PHONE_E164: " +84901234567 "
    }),
    input()
  );
  assert.throws(
    () =>
      readAdminProvisioningInput({
        RENTMATE_ADMIN_EMAIL: "admin@example.test",
        RENTMATE_ADMIN_PASSWORD: "🙂".repeat(19)
      }),
    AdminProvisioningInputError
  );
  assert.throws(
    () =>
      readAdminProvisioningInput({
        RENTMATE_ADMIN_EMAIL: "admin@example.test",
        RENTMATE_ADMIN_PASSWORD: "valid-password",
        RENTMATE_ADMIN_PHONE_E164: "0901234567"
      }),
    /E\.164/
  );
});

test("creates one active admin with a parameterized hash inside one transaction", async () => {
  const context = fixture({ INSERT: [{ id: 41 }] });
  const result = await provisionAdmin(context.pool, context.passwordService, input());
  assert.deepEqual(result, { outcome: "created", userId: 41 });
  assert.deepEqual(
    context.statements.map((statement) => statement.text.split(/\s+/u)[0]?.toUpperCase()),
    ["BEGIN", "INSERT", "COMMIT"]
  );
  assert.deepEqual(context.statements[1]?.values, [
    "admin@example.test",
    "+84901234567",
    "$2b$12$provisioning-test-hash"
  ]);
  assert.equal(context.wasReleased(), true);
});

test("keeps active admin provisioning idempotent without replacing its credential", async () => {
  const context = fixture({ INSERT: [], SELECT: [{ id: 42, role: "ADMIN", isActive: true }] });
  assert.deepEqual(await provisionAdmin(context.pool, context.passwordService, input()), {
    outcome: "already-provisioned",
    userId: 42
  });
  assert.deepEqual(
    context.statements.map((statement) => statement.text.split(/\s+/u)[0]?.toUpperCase()),
    ["BEGIN", "INSERT", "SELECT", "COMMIT"]
  );
});

test("rolls back conflicts and never converts or reactivates an existing account", async () => {
  for (const existing of [
    { id: 43, role: "TENANT", isActive: true },
    { id: 44, role: "ADMIN", isActive: false }
  ]) {
    const context = fixture({ INSERT: [], SELECT: [existing] });
    await assert.rejects(
      provisionAdmin(context.pool, context.passwordService, input()),
      AdminProvisioningConflictError
    );
    assert.equal(context.statements.at(-1)?.text, "ROLLBACK");
    assert.equal(context.wasReleased(), true);
  }

  const malformed = fixture({ INSERT: [], SELECT: [{ id: "invalid", role: "ADMIN", isActive: true }] });
  await assert.rejects(provisionAdmin(malformed.pool, malformed.passwordService, input()), AdminProvisioningError);
  assert.equal(malformed.statements.at(-1)?.text, "ROLLBACK");
});
