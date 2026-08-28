import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { createPostgresPool } from "../../shared/src/runtime/db/pool.js";
import { withTransaction } from "../../shared/src/runtime/db/transaction.js";
import {
  createContactVerificationDelivery,
  type ContactVerificationDeliveryInput
} from "../src/modules/verifications/contact-verification-delivery.js";
import { createContactVerificationRepository } from "../src/modules/verifications/repositories/contact-verification-repository.js";
import { createContactVerificationService } from "../src/modules/verifications/services/contact-verification-service.js";
import {
  createIdentityMigrationPlan,
  discoverIdentityMigrations,
  executeIdentityMigrationPlan
} from "../src/migrations/runner.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for disposable Identity database tests.");
const parsed = new URL(databaseUrl);
const configuredDatabaseName = decodeURIComponent(parsed.pathname.slice(1));
const pool = createPostgresPool(
  {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    database: configuredDatabaseName,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    max: 8,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000
  },
  { debug() {}, info() {}, warn() {}, error() {} }
);

async function assertDisposableIdentityDatabase(): Promise<void> {
  const result = await pool.query<{ readonly database_name: string }>("SELECT current_database() AS database_name");
  const databaseName = result.rows[0]?.database_name ?? "";
  assert.equal(databaseName, configuredDatabaseName);
  assert.match(databaseName, /^rentmate_test(?:_|$)/iu, "TEST_DATABASE_URL must target a disposable test database.");
}

async function cleanIdentitySchema(): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS user_auth_identities");
  await pool.query("DROP TABLE IF EXISTS password_reset_tokens");
  await pool.query("DROP TABLE IF EXISTS contact_verification_challenges");
  await pool.query("DROP TABLE IF EXISTS landlord_verifications");
  await pool.query("DROP TABLE IF EXISTS users");
  await pool.query("DROP TYPE IF EXISTS user_role");
}

before(async () => {
  await assertDisposableIdentityDatabase();
  await cleanIdentitySchema();
  const migrations = await discoverIdentityMigrations(path.resolve(process.cwd(), "migrations"));
  await executeIdentityMigrationPlan(pool, createIdentityMigrationPlan("clean", migrations));
});

after(async () => {
  await assertDisposableIdentityDatabase();
  await cleanIdentitySchema();
  await pool.end();
});

let nextTenantNumber = 1;

async function createTenant(phone = "+84901234567"): Promise<number> {
  const number = nextTenantNumber++;
  const created = await pool.query<{ readonly id: number }>(
    `
      INSERT INTO users (role, email, phone_e164, password_hash)
      VALUES ('TENANT', $1, $2, 'database-test-hash')
      RETURNING id
    `,
    [`tenant-${number}@example.com`, phone]
  );
  const id = created.rows[0]?.id;
  if (!id) throw new Error("Tenant fixture could not be created.");
  return id;
}

function harness(options: { readonly deliveryFails?: boolean } = {}) {
  const deliveries: ContactVerificationDeliveryInput[] = [];
  let emailSequence = 0;
  let phoneSequence = 0;
  const delivery = createContactVerificationDelivery({
    nodeEnvironment: "test",
    deliveryUrl: "",
    deliveryToken: ""
  });
  const service = createContactVerificationService({
    contactRepository: createContactVerificationRepository(),
    verificationRepository: { findLatestForLandlord: async () => null } as never,
    transactionRunner: (operation) => withTransaction(pool, { error() {} }, operation),
    delivery: {
      isAvailable: delivery.isAvailable,
      async deliver(input) {
        deliveries.push(input);
        if (options.deliveryFails) throw new Error("provider unavailable");
        await delivery.deliver(input);
      }
    },
    secretPepper: "database-test-pepper",
    createEmailToken: () => `${String(++emailSequence).padStart(31, "a")}b`,
    createPhoneCode: () => String(++phoneSequence).padStart(6, "0")
  });
  return { service, deliveries };
}

function tenant(userId: number) {
  return { userId, role: "TENANT" as const };
}

async function usableChallengeCount(userId: number, channel: "EMAIL" | "PHONE"): Promise<number> {
  const result = await pool.query<{ readonly count: string }>(
    "SELECT count(*)::text AS count FROM contact_verification_challenges WHERE user_id = $1 AND channel = $2 AND consumed_at IS NULL",
    [userId, channel]
  );
  return Number(result.rows[0]?.count ?? "-1");
}

test("serializes concurrent tenant resends to exactly one usable challenge", async () => {
  const userId = await createTenant();
  const subject = harness();
  await Promise.all([
    subject.service.requestTenantEmail(tenant(userId)),
    subject.service.requestTenantEmail(tenant(userId))
  ]);
  assert.equal(await usableChallengeCount(userId, "EMAIL"), 1);
  assert.equal(subject.deliveries.length, 2);
});

test("serializes concurrent confirmation to one factual email-verification transition", async () => {
  const userId = await createTenant();
  const subject = harness();
  await subject.service.requestTenantEmail(tenant(userId));
  const secret = subject.deliveries[0]?.secret;
  if (!secret) throw new Error("Verification delivery fixture is missing.");

  await Promise.all([
    subject.service.confirmTenantEmail(tenant(userId), { token: secret }),
    subject.service.confirmTenantEmail(tenant(userId), { token: secret })
  ]);

  const result = await pool.query<{ readonly email_verified_at: Date | null }>(
    "SELECT email_verified_at FROM users WHERE id = $1",
    [userId]
  );
  assert.ok(result.rows[0]?.email_verified_at);
  assert.equal(await usableChallengeCount(userId, "EMAIL"), 0);
});

test("serializes resend before confirm so the old secret cannot revalidate", async () => {
  const userId = await createTenant();
  const subject = harness();
  await subject.service.requestTenantEmail(tenant(userId));
  const oldSecret = subject.deliveries[0]?.secret;
  if (!oldSecret) throw new Error("Verification delivery fixture is missing.");

  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const resend = subject.service.requestTenantEmail(tenant(userId));
    await new Promise((resolve) => setTimeout(resolve, 25));
    const confirm = subject.service.confirmTenantEmail(tenant(userId), { token: oldSecret });
    await blocker.query("COMMIT");
    const [resendResult, confirmResult] = await Promise.allSettled([resend, confirm]);
    assert.equal(resendResult.status, "fulfilled");
    assert.equal(confirmResult.status, "rejected");
    if (confirmResult.status === "rejected")
      assert.equal((confirmResult.reason as { code?: string }).code, "VALIDATION_FAILED");
  } finally {
    await blocker.query("ROLLBACK").catch(() => undefined);
    blocker.release();
  }

  const result = await pool.query<{ readonly email_verified_at: Date | null }>(
    "SELECT email_verified_at FROM users WHERE id = $1",
    [userId]
  );
  assert.equal(result.rows[0]?.email_verified_at, null);
  assert.equal(await usableChallengeCount(userId, "EMAIL"), 1);
});

test("a replaced challenge and a changed phone destination cannot verify stale secrets", async () => {
  const userId = await createTenant();
  const subject = harness();
  await subject.service.requestTenantEmail(tenant(userId));
  const oldEmailSecret = subject.deliveries[0]?.secret;
  await subject.service.requestTenantEmail(tenant(userId));
  await assert.rejects(
    () => subject.service.confirmTenantEmail(tenant(userId), { token: oldEmailSecret ?? "x".repeat(32) }),
    {
      code: "VALIDATION_FAILED"
    }
  );

  await subject.service.requestTenantPhone(tenant(userId));
  const oldPhoneSecret = subject.deliveries.at(-1)?.secret;
  await pool.query("UPDATE users SET phone_e164 = $2, phone_verified_at = NULL WHERE id = $1", [
    userId,
    "+84981112223"
  ]);
  await assert.rejects(() => subject.service.confirmTenantPhone(tenant(userId), { code: oldPhoneSecret ?? "000000" }), {
    code: "VALIDATION_FAILED"
  });
  const result = await pool.query<{ readonly phone_verified_at: Date | null }>(
    "SELECT phone_verified_at FROM users WHERE id = $1",
    [userId]
  );
  assert.equal(result.rows[0]?.phone_verified_at, null);
});

test("a provider failure does not create a false tenant verification state", async () => {
  const userId = await createTenant();
  const subject = harness({ deliveryFails: true });
  await assert.rejects(() => subject.service.requestTenantEmail(tenant(userId)), { code: "PROVIDER_UNAVAILABLE" });
  const result = await pool.query<{ readonly email_verified_at: Date | null }>(
    "SELECT email_verified_at FROM users WHERE id = $1",
    [userId]
  );
  assert.equal(result.rows[0]?.email_verified_at, null);
});
