import dotenv from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { createSqlExecutor } from "../src/db/sql-executor.js";
import { createAuthRepository, RegistrationEmailAlreadyExistsError } from "../src/modules/auth/auth-repository.js";
import { createPasswordService } from "../src/modules/auth/password.js";
import { createRegistrationService } from "../src/modules/auth/registration-service.js";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import { closeDatabasePool } from "../src/db/pool.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 2 });
const repository = createAuthRepository(createSqlExecutor(pool));
const service = createRegistrationService({
  passwordService: createPasswordService({ bcryptCost: 4 }),
  authRepository: repository
});
const migrationDirectory = path.resolve(process.cwd(), "migrations");

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

beforeAll(async () => {
  await cleanFrozenSchema();
  const migrations = await discoverMigrations(migrationDirectory);
  await executeMigrationPlan(pool, createMigrationPlan("clean", migrations));
});

beforeEach(async () => {
  await pool.query({ text: "DELETE FROM users", values: [] });
});

afterAll(async () => {
  await cleanFrozenSchema();
  await closeDatabasePool(pool);
});

describe("RM-015 PostgreSQL registration integration", () => {
  it("persists tenant and landlord accounts with a bcrypt hash and safe returned profiles", async () => {
    const tenant = await service.register("TENANT", {
      email: "rm015-tenant@example.com",
      password: "tenant-password",
      phone: null
    });
    const landlord = await service.register("LANDLORD", {
      email: "rm015-landlord@example.com",
      password: "landlord-password",
      phone: "+84901234567"
    });

    const rows = await pool.query<{
      role: string;
      email: string;
      phone_e164: string | null;
      password_hash: string;
      is_active: boolean;
    }>({
      text: "SELECT role,email,phone_e164,password_hash,is_active FROM users WHERE email = ANY($1::varchar[]) ORDER BY email",
      values: [["rm015-landlord@example.com", "rm015-tenant@example.com"]]
    });

    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.map(({ role }) => role)).toEqual(["LANDLORD", "TENANT"]);
    expect(rows.rows[0]?.password_hash).toMatch(/^\$2b\$/);
    expect(rows.rows[1]?.password_hash).toMatch(/^\$2b\$/);
    expect(rows.rows.every(({ is_active }) => is_active)).toBe(true);
    expect(rows.rows[0]?.password_hash).not.toContain("landlord-password");
    expect(tenant).not.toHaveProperty("passwordHash");
    expect(landlord).not.toHaveProperty("passwordHash");
    expect(landlord.phone).toBe("+84901234567");
  });

  it("maps the unique email violation to the safe application conflict", async () => {
    const input = { email: "rm015-duplicate@example.com", password: "duplicate-password", phone: null };
    await service.register("TENANT", input);

    await expect(service.register("TENANT", input)).rejects.toMatchObject({
      code: "EMAIL_ALREADY_EXISTS",
      status: 409
    });
    try {
      await service.register("TENANT", input);
    } catch (error) {
      expect(error).toBeInstanceOf(ApplicationError);
      expect(JSON.stringify(error)).not.toContain("duplicate-password");
    }
  });

  it("serializes concurrent same-email inserts to one committed row", async () => {
    const records = ["first-rm015-hash", "second-rm015-hash"].map((passwordHash) => ({
      role: "TENANT" as const,
      email: "rm015-concurrent@example.com",
      phone: null,
      passwordHash
    }));
    const outcomes = await Promise.allSettled(records.map((record) => repository.createUser(record)));

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : undefined).toBeInstanceOf(
      RegistrationEmailAlreadyExistsError
    );

    const count = await pool.query<{ count: number }>({
      text: "SELECT count(*)::integer AS count FROM users WHERE email = $1",
      values: ["rm015-concurrent@example.com"]
    });
    expect(count.rows[0]?.count).toBe(1);
  });
});
