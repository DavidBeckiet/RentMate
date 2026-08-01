import dotenv from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDatabasePool } from "../src/db/pool.js";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { createSqlExecutor } from "../src/db/sql-executor.js";
import { createAuthRepository } from "../src/modules/auth/auth-repository.js";
import { createLoginService, type LoginService } from "../src/modules/auth/login-service.js";
import { validateLoginInput } from "../src/modules/auth/login-validation.js";
import { createPasswordService } from "../src/modules/auth/password.js";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 1 });
const repository = createAuthRepository(createSqlExecutor(pool));
const passwordService = createPasswordService({ bcryptCost: 4 });
const migrationDirectory = path.resolve(process.cwd(), "migrations");
let service: LoginService;

const accounts = [
  { role: "TENANT", email: "rm016-tenant@example.com", password: "tenant-input-sentinel", active: true },
  { role: "LANDLORD", email: "rm016-landlord@example.com", password: "landlord-input-sentinel", active: true },
  { role: "ADMIN", email: "rm016-admin@example.com", password: "admin-input-sentinel", active: true },
  { role: "TENANT", email: "rm016-inactive@example.com", password: "inactive-input-sentinel", active: false }
] as const;

async function cleanFrozenSchema(): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS moderation_history");
  await pool.query("DROP TABLE IF EXISTS favorites");
  await pool.query("DROP TABLE IF EXISTS listing_amenities");
  await pool.query("DROP TABLE IF EXISTS listing_images");
  await pool.query("DROP TABLE IF EXISTS listings");
  await pool.query("DROP TABLE IF EXISTS amenities");
  await pool.query("DROP TABLE IF EXISTS property_types");
  await pool.query("DROP TABLE IF EXISTS users");
  await pool.query("DROP TYPE IF EXISTS listing_status");
  await pool.query("DROP TYPE IF EXISTS user_role");
}

async function seedAccounts(): Promise<void> {
  for (const account of accounts) {
    const passwordHash = await passwordService.hashPassword(account.password);
    await pool.query({
      text: `
        INSERT INTO users (role, email, phone_e164, password_hash, is_active)
        VALUES ($1, $2, $3, $4, $5)
      `,
      values: [
        account.role,
        account.email,
        account.role === "LANDLORD" ? "+84901234567" : null,
        passwordHash,
        account.active
      ]
    });
  }
}

async function captureInvalid(operation: () => Promise<unknown>): Promise<ApplicationError> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
      message: "The email or password is incorrect.",
      details: []
    });
    return error as ApplicationError;
  }

  throw new Error("Expected database-backed login to fail.");
}

beforeAll(async () => {
  await cleanFrozenSchema();
  const migrations = await discoverMigrations(migrationDirectory);
  await executeMigrationPlan(pool, createMigrationPlan("clean", migrations));
  const missingAccountPasswordHash = await passwordService.hashPassword("missing-account-input-sentinel");
  service = createLoginService({
    findLoginAccount: repository.findLoginAccount,
    verifyPassword: passwordService.verifyPassword,
    missingAccountPasswordHash
  });
});

beforeEach(async () => {
  await pool.query({ text: "DELETE FROM users", values: [] });
  await seedAccounts();
});

afterAll(async () => {
  await cleanFrozenSchema();
  await closeDatabasePool(pool);
});

describe("RM-016 PostgreSQL login integration", () => {
  it.each([
    ["TENANT", "  RM016-TENANT@EXAMPLE.COM  ", "tenant-input-sentinel", null],
    ["LANDLORD", "rm016-landlord@example.com", "landlord-input-sentinel", "+84901234567"],
    ["ADMIN", "rm016-admin@example.com", "admin-input-sentinel", null]
  ] as const)("authenticates an active %s through normalized email lookup", async (role, email, password, phone) => {
    const input = validateLoginInput({ email, password });
    const user = await service.login(input);

    expect(input.email).toBe(email.trim().toLowerCase());
    expect(user).toMatchObject({ role, email: input.email, phone, isActive: true });
    expect(user.id).toBeGreaterThan(0);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("password_hash");
  });

  it("makes missing, wrong-password, and inactive failures identical", async () => {
    const operations = [
      () => service.login({ email: "rm016-missing@example.com", password: "missing-input-sentinel" }),
      () => service.login({ email: "rm016-tenant@example.com", password: "wrong-input-sentinel" }),
      () => service.login({ email: "rm016-inactive@example.com", password: "inactive-input-sentinel" }),
      () => service.login({ email: "rm016-inactive@example.com", password: "wrong-input-sentinel" })
    ];
    const signatures: Array<{
      status: number;
      code: string;
      message: string;
      details: readonly unknown[];
    }> = [];

    for (const operation of operations) {
      const error = await captureInvalid(operation);
      signatures.push({ status: error.status, code: error.code, message: error.message, details: error.details });
    }

    expect(signatures.every((signature) => JSON.stringify(signature) === JSON.stringify(signatures[0]))).toBe(true);
  });

  it("performs no write, preserves updated_at and row count, and creates no session or token table", async () => {
    const before = await pool.query<{ id: number; updated_at: Date }>({
      text: "SELECT id, updated_at FROM users ORDER BY id",
      values: []
    });

    await service.login({ email: "rm016-tenant@example.com", password: "tenant-input-sentinel" });
    await captureInvalid(() => service.login({ email: "rm016-tenant@example.com", password: "wrong-input-sentinel" }));

    const after = await pool.query<{ id: number; updated_at: Date }>({
      text: "SELECT id, updated_at FROM users ORDER BY id",
      values: []
    });
    const forbiddenTables = await pool.query<{ table_name: string }>({
      text: `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND (table_name ILIKE '%session%' OR table_name ILIKE '%token%')
      `,
      values: []
    });

    expect(after.rows).toHaveLength(accounts.length);
    expect(after.rows).toStrictEqual(before.rows);
    expect(forbiddenTables.rows).toStrictEqual([]);
  });
});
