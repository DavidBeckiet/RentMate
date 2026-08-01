import dotenv from "dotenv";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDatabasePool } from "../src/db/pool.js";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { createSqlExecutor } from "../src/db/sql-executor.js";
import type { UserRole } from "../src/shared/types/authentication.js";
import { createUsersRepository } from "../src/modules/users/users-repository.js";
import { createUsersService } from "../src/modules/users/users-service.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 1 });
const repository = createUsersRepository(createSqlExecutor(pool));
const service = createUsersService(repository);
const migrationDirectory = path.resolve(process.cwd(), "migrations");

interface FixtureUser {
  readonly id: number;
  readonly role: UserRole;
  readonly email: string;
  readonly phone: string | null;
}

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

async function insertFixture(role: UserRole, email: string, phone: string | null): Promise<FixtureUser> {
  const result = await pool.query<{ id: number }>({
    text: `
      INSERT INTO users (role, email, phone_e164, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5)
      RETURNING id
    `,
    values: [role, email, phone, "rm017-password-hash-sentinel", "2020-01-01T00:00:00.000Z"]
  });

  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("RM-017 fixture insert did not return an id.");
  }

  return { id, role, email, phone };
}

async function seedFixtures(): Promise<{
  readonly tenant: FixtureUser;
  readonly landlord: FixtureUser;
  readonly admin: FixtureUser;
}> {
  return {
    tenant: await insertFixture("TENANT", "rm017-tenant@example.com", "+84901234567"),
    landlord: await insertFixture("LANDLORD", "rm017-landlord@example.com", "+84909998888"),
    admin: await insertFixture("ADMIN", "rm017-admin@example.com", null)
  };
}

async function readUserRow(id: number) {
  const result = await pool.query<{
    email: string;
    role: UserRole;
    phone_e164: string | null;
    password_hash: string;
    is_active: boolean;
    updated_at: Date;
  }>({
    text: "SELECT email, role, phone_e164, password_hash, is_active, updated_at FROM users WHERE id = $1",
    values: [id]
  });
  return result.rows[0];
}

async function countRows(): Promise<Record<string, number>> {
  const names = ["users", "listings", "favorites", "moderation_history"] as const;
  const counts: Record<string, number> = {};
  for (const name of names) {
    const result = await pool.query<{ count: number }>({
      text: `SELECT count(*)::integer AS count FROM ${name}`,
      values: []
    });
    counts[name] = result.rows[0]?.count ?? 0;
  }
  return counts;
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

describe("RM-017 PostgreSQL current-user integration", () => {
  it("reads active tenant, landlord, and admin profiles through the safe mapper", async () => {
    const fixtures = await seedFixtures();

    for (const fixture of Object.values(fixtures)) {
      const profile = await repository.findProfileById(fixture.id);
      expect(profile).toMatchObject({
        id: fixture.id,
        role: fixture.role,
        email: fixture.email,
        phone: fixture.phone,
        isActive: true
      });
      expect(profile).not.toHaveProperty("passwordHash");
    }
  });

  it("updates tenant phone to another value and then null without changing identity fields", async () => {
    const { tenant } = await seedFixtures();
    const before = await readUserRow(tenant.id);
    const updated = await service.updateCurrentUserPhone(
      { userId: tenant.id, role: "TENANT" },
      { phoneProvided: true, phone: "+84981112223" }
    );
    const afterReplacement = await readUserRow(tenant.id);

    expect(updated.phone).toBe("+84981112223");
    expect(afterReplacement?.updated_at.getTime()).toBeGreaterThan(before?.updated_at.getTime() ?? 0);
    expect(afterReplacement).toMatchObject({
      email: tenant.email,
      role: "TENANT",
      password_hash: "rm017-password-hash-sentinel",
      is_active: true
    });

    const cleared = await service.updateCurrentUserPhone(
      { userId: tenant.id, role: "TENANT" },
      { phoneProvided: true, phone: null }
    );
    expect(cleared.phone).toBeNull();
    expect((await readUserRow(tenant.id))?.phone_e164).toBeNull();
  });

  it("allows admin null-to-phone-to-null transitions", async () => {
    const { admin } = await seedFixtures();

    expect(
      (
        await service.updateCurrentUserPhone(
          { userId: admin.id, role: "ADMIN" },
          { phoneProvided: true, phone: "+84981112223" }
        )
      ).phone
    ).toBe("+84981112223");
    expect(
      (await service.updateCurrentUserPhone({ userId: admin.id, role: "ADMIN" }, { phoneProvided: true, phone: null }))
        .phone
    ).toBeNull();
  });

  it("updates a landlord replacement but rejects null in the service", async () => {
    const { landlord } = await seedFixtures();

    await expect(
      service.updateCurrentUserPhone({ userId: landlord.id, role: "LANDLORD" }, { phoneProvided: true, phone: null })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
    expect((await readUserRow(landlord.id))?.phone_e164).toBe(landlord.phone);

    const updated = await service.updateCurrentUserPhone(
      { userId: landlord.id, role: "LANDLORD" },
      { phoneProvided: true, phone: "+84981112223" }
    );
    expect(updated.phone).toBe("+84981112223");
  });

  it("keeps the database landlord constraint as a final invariant", async () => {
    const { landlord } = await seedFixtures();

    await expect(repository.updatePhone(landlord.id, null)).rejects.toMatchObject({
      code: "23514",
      constraint: "ck_users_landlord_phone"
    });
  });

  it("preserves exact updated_at for same-phone and omitted-phone no-ops", async () => {
    const { tenant } = await seedFixtures();
    const before = await readUserRow(tenant.id);
    const same = await service.updateCurrentUserPhone(
      { userId: tenant.id, role: "TENANT" },
      { phoneProvided: true, phone: tenant.phone }
    );
    const afterSame = await readUserRow(tenant.id);
    const omitted = await service.updateCurrentUserPhone(
      { userId: tenant.id, role: "TENANT" },
      { phoneProvided: false, phone: null }
    );
    const afterOmitted = await readUserRow(tenant.id);

    expect(same.phone).toBe(tenant.phone);
    expect(omitted.phone).toBe(tenant.phone);
    expect(afterSame?.updated_at.getTime()).toBe(before?.updated_at.getTime());
    expect(afterOmitted?.updated_at.getTime()).toBe(before?.updated_at.getTime());
  });

  it("hides inactive profiles and preserves row counts and all unrelated fields", async () => {
    const { tenant } = await seedFixtures();
    const countsBefore = await countRows();
    const original = await readUserRow(tenant.id);
    await pool.query({ text: "UPDATE users SET is_active = false WHERE id = $1", values: [tenant.id] });

    await expect(repository.findProfileById(tenant.id)).resolves.toBeNull();
    await expect(service.getCurrentUser({ userId: tenant.id, role: "TENANT" })).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      status: 401
    });

    const after = await readUserRow(tenant.id);
    const countsAfter = await countRows();
    expect(after).toMatchObject({
      email: original?.email,
      role: original?.role,
      phone_e164: original?.phone_e164,
      password_hash: original?.password_hash,
      is_active: false
    });
    expect(countsAfter).toStrictEqual(countsBefore);
  });
});
