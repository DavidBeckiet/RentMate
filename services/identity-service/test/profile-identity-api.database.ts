import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { createPostgresPool } from "../../shared/src/runtime/db/pool.js";
import { createSqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createAuthRepository } from "../src/modules/auth/repositories/auth-repository.js";
import { createLoginService } from "../src/modules/auth/services/login-service.js";
import { createRegistrationService } from "../src/modules/auth/services/registration-service.js";
import { createPasswordService } from "../src/modules/auth/password.js";
import { validateRegistrationInput } from "../src/modules/auth/validations/registration-validation.js";
import { createUsersRepository } from "../src/modules/users/repositories/users-repository.js";
import { createUsersService } from "../src/modules/users/services/users-service.js";
import { validateUpdateCurrentUserInput } from "../src/modules/users/validations/user-validation.js";
import {
  createIdentityMigrationPlan,
  discoverIdentityMigrations,
  executeIdentityMigrationPlan
} from "../src/migrations/runner.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for Identity database integration tests.");
const parsed = new URL(databaseUrl);
const pool = createPostgresPool(
  {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    max: 2,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000
  },
  { debug() {}, info() {}, warn() {}, error() {} }
);

async function cleanIdentitySchema(): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS user_auth_identities");
  await pool.query("DROP TABLE IF EXISTS password_reset_tokens");
  await pool.query("DROP TABLE IF EXISTS contact_verification_challenges");
  await pool.query("DROP TABLE IF EXISTS landlord_verifications");
  await pool.query("DROP TABLE IF EXISTS users");
  await pool.query("DROP TYPE IF EXISTS user_role");
}

before(async () => {
  await cleanIdentitySchema();
  const migrations = await discoverIdentityMigrations(path.resolve(process.cwd(), "migrations"));
  await executeIdentityMigrationPlan(pool, createIdentityMigrationPlan("clean", migrations));
});

after(async () => {
  await cleanIdentitySchema();
  await pool.end();
});

test("Identity database persists, returns, updates, and no-ops canonical displayName", async () => {
  const repository = createAuthRepository(createSqlExecutor(pool));
  const passwordService = createPasswordService({ bcryptCost: 4 });
  const registrationService = createRegistrationService({ passwordService, authRepository: repository });
  const named = await registrationService.register(
    "TENANT",
    validateRegistrationInput(
      {
        displayName: " Nguye\u0302\u0303n Gia Kie\u0323\u0302t ",
        email: "named@example.com",
        password: "valid-password"
      },
      "TENANT"
    )
  );
  const legacy = await registrationService.register(
    "TENANT",
    validateRegistrationInput({ email: "legacy@example.com", password: "valid-password" }, "TENANT")
  );
  assert.equal(named.displayName, "Nguyễn Gia Kiệt");
  assert.equal(legacy.displayName, null);

  const missingHash = await passwordService.hashPassword("missing-password");
  const loginService = createLoginService({
    findLoginAccount: repository.findLoginAccount,
    verifyPassword: passwordService.verifyPassword,
    missingAccountPasswordHash: missingHash
  });
  assert.equal(
    (await loginService.login({ email: "named@example.com", password: "valid-password" })).displayName,
    "Nguyễn Gia Kiệt"
  );
  assert.equal(
    (await loginService.login({ email: "legacy@example.com", password: "valid-password" })).displayName,
    null
  );

  const usersRepository = createUsersRepository(createSqlExecutor(pool));
  const usersService = createUsersService(usersRepository);
  const principal = { userId: named.id, role: "TENANT" as const };
  await pool.query("UPDATE users SET updated_at = $2 WHERE id = $1", [named.id, "2020-01-01T00:00:00.000Z"]);
  const changed = await usersService.updateCurrentUser(
    principal,
    validateUpdateCurrentUserInput({ displayName: "  Cô Ba Nhà Trọ  ", phone: "+84901234567" }, "TENANT")
  );
  assert.equal(changed.displayName, "Cô Ba Nhà Trọ");
  assert.equal(changed.phone, "+84901234567");

  const beforeNoOp = await pool.query<{ updated_at: Date }>("SELECT updated_at FROM users WHERE id = $1", [named.id]);
  const same = await usersService.updateCurrentUser(
    principal,
    validateUpdateCurrentUserInput({ displayName: "  Cô Ba Nhà Trọ  ", phone: "  +84901234567  " }, "TENANT")
  );
  const afterNoOp = await pool.query<{ display_name: string | null; updated_at: Date }>(
    "SELECT display_name, updated_at FROM users WHERE id = $1",
    [named.id]
  );
  assert.equal(same.displayName, "Cô Ba Nhà Trọ");
  assert.equal(afterNoOp.rows[0]?.display_name, "Cô Ba Nhà Trọ");
  assert.equal(afterNoOp.rows[0]?.updated_at.getTime(), beforeNoOp.rows[0]?.updated_at.getTime());
});
