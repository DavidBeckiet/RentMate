import { compare, hash } from "bcrypt";
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AdminProvisioningInput } from "../src/db/admin-provisioning/input.js";
import {
  AdminProvisioningConflictError,
  AdminProvisioningError,
  provisionAdmin
} from "../src/db/admin-provisioning/provision-admin.js";
import { bootstrapDatabase, DatabaseBootstrapError } from "../src/db/bootstrap/bootstrap-database.js";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { SchemaVerificationError, verifyFinalSchema } from "../src/db/schema-verification/verify-final-schema.js";
import { readTestDatabaseUrl } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = new Pool({
  connectionString: readTestDatabaseUrl(),
  connectionTimeoutMillis: 5_000,
  max: 4
});
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const propertyTypeSeedPath = path.resolve(migrationDirectory, "0005_seed_property_types.sql");
const amenitySeedPath = path.resolve(migrationDirectory, "0006_seed_amenities.sql");

interface UserSnapshot extends QueryResultRow {
  readonly id: number;
  readonly role: "TENANT" | "LANDLORD" | "ADMIN";
  readonly email: string;
  readonly phoneE164: string | null;
  readonly passwordHash: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface LookupSnapshot extends QueryResultRow {
  readonly id: number;
  readonly code: string;
  readonly label: string;
  readonly isActive: boolean;
}

async function cleanDatabase(): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS schema_migrations");
  await pool.query("DROP TABLE IF EXISTS rm008_unexpected_table");
  await pool.query("DROP TABLE IF EXISTS favorites_missing");
  await pool.query("DROP TABLE IF EXISTS moderation_history");
  await pool.query("DROP TABLE IF EXISTS favorites");
  await pool.query("DROP TABLE IF EXISTS listing_amenities");
  await pool.query("DROP TABLE IF EXISTS listing_images");
  await pool.query("DROP TABLE IF EXISTS listings");
  await pool.query("DROP TABLE IF EXISTS amenities");
  await pool.query("DROP TABLE IF EXISTS property_types");
  await pool.query("DROP TABLE IF EXISTS users");
  await pool.query("DROP TYPE IF EXISTS listing_status_missing");
  await pool.query("DROP TYPE IF EXISTS listing_status");
  await pool.query("DROP TYPE IF EXISTS user_role");
}

async function migrateSchema(): Promise<void> {
  const migrations = await discoverMigrations(migrationDirectory);
  await executeMigrationPlan(pool, createMigrationPlan("clean", migrations));
}

function adminInput(
  email = "admin@example.com",
  password = "AdminPass123",
  phoneE164: string | null = null
): AdminProvisioningInput {
  return {
    email,
    password,
    phoneE164,
    bcryptCost: 4
  };
}

async function readUser(email: string): Promise<UserSnapshot> {
  const result = await pool.query<UserSnapshot>(
    `
      SELECT
        id,
        role,
        email,
        phone_e164 AS "phoneE164",
        password_hash AS "passwordHash",
        is_active AS "isActive",
        created_at::text AS "createdAt",
        updated_at::text AS "updatedAt"
      FROM users
      WHERE email = $1
    `,
    [email]
  );
  const user = result.rows[0];

  if (!user) {
    throw new Error("Expected user fixture was not found");
  }

  return user;
}

async function insertExistingUser(options: {
  readonly role: "TENANT" | "LANDLORD" | "ADMIN";
  readonly email: string;
  readonly phoneE164: string | null;
  readonly active?: boolean;
}): Promise<void> {
  const passwordHash = await hash("ExistingPass123", 4);
  await pool.query(
    `
      INSERT INTO users (role, email, phone_e164, password_hash, is_active)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [options.role, options.email, options.phoneE164, passwordHash, options.active ?? true]
  );
}

async function expectVerifierFailure(mutate: () => Promise<void>, restore: () => Promise<void>): Promise<void> {
  await mutate();
  try {
    await expect(verifyFinalSchema(pool)).rejects.toBeInstanceOf(SchemaVerificationError);
  } finally {
    await restore();
  }
  await expect(verifyFinalSchema(pool)).resolves.toMatchObject({
    enumCount: 2,
    tableCount: 8,
    constraintCount: 52,
    explicitIndexCount: 10,
    propertyTypeCount: 5,
    amenityCount: 12
  });
}

beforeEach(async () => {
  await cleanDatabase();
});

afterEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await pool.end();
});

describe("RM-008 clean bootstrap and controlled admin provisioning", () => {
  it("bootstraps the exact Phase 1 database and persists only a verifiable bcrypt admin hash", async () => {
    const plaintextPassword = "AdminPass123";
    const result = await bootstrapDatabase({
      pool,
      migrationsDirectory: migrationDirectory,
      adminInput: adminInput("  admin@example.com  ".trim(), plaintextPassword, "+84901234567")
    });

    expect(result).toMatchObject({
      appliedMigrationCount: 12,
      lastAppliedMigrationVersion: 12,
      schema: {
        enumCount: 2,
        tableCount: 8,
        constraintCount: 52,
        explicitIndexCount: 10,
        propertyTypeCount: 5,
        amenityCount: 12
      },
      admin: {
        outcome: "created"
      }
    });

    const user = await readUser("admin@example.com");
    expect(user).toMatchObject({
      role: "ADMIN",
      email: "admin@example.com",
      phoneE164: "+84901234567",
      isActive: true
    });
    expect(user.passwordHash).not.toBe(plaintextPassword);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    await expect(compare(plaintextPassword, user.passwordHash)).resolves.toBe(true);
    expect([user.email, user.phoneE164, user.role, user.createdAt, user.updatedAt]).not.toContain(plaintextPassword);

    const inventory = await pool.query<{
      propertyTypes: number;
      activePropertyTypes: number;
      amenities: number;
      activeAmenities: number;
      admins: number;
    }>(
      `
        SELECT
          (SELECT count(*)::integer FROM property_types) AS "propertyTypes",
          (SELECT count(*)::integer FROM property_types WHERE is_active) AS "activePropertyTypes",
          (SELECT count(*)::integer FROM amenities) AS amenities,
          (SELECT count(*)::integer FROM amenities WHERE is_active) AS "activeAmenities",
          (SELECT count(*)::integer FROM users WHERE role = 'ADMIN') AS admins
      `
    );
    expect(inventory.rows).toStrictEqual([
      { propertyTypes: 5, activePropertyTypes: 5, amenities: 12, activeAmenities: 12, admins: 1 }
    ]);

    await expect(
      bootstrapDatabase({
        pool,
        migrationsDirectory: migrationDirectory,
        adminInput: adminInput()
      })
    ).rejects.toBeInstanceOf(DatabaseBootstrapError);
    expect(await readUser("admin@example.com")).toStrictEqual(user);
  });

  it("treats an equivalent active-admin email as a byte-preserving no-op", async () => {
    await migrateSchema();
    const created = await provisionAdmin(pool, adminInput("admin@example.com", "FirstPass123", "+84901234567"));
    const before = await readUser("admin@example.com");

    const repeated = await provisionAdmin(pool, adminInput("admin@example.com", "DifferentPass123", "+84888888888"));
    const after = await readUser("admin@example.com");

    expect(created.outcome).toBe("created");
    expect(repeated).toStrictEqual({ outcome: "already-provisioned", userId: created.userId });
    expect(after).toStrictEqual(before);
    await expect(compare("FirstPass123", after.passwordHash)).resolves.toBe(true);
    await expect(compare("DifferentPass123", after.passwordHash)).resolves.toBe(false);
  });

  it("never promotes a tenant or landlord and never reactivates an inactive admin", async () => {
    await migrateSchema();
    await insertExistingUser({
      role: "TENANT",
      email: "tenant@example.com",
      phoneE164: null
    });
    await insertExistingUser({
      role: "LANDLORD",
      email: "landlord@example.com",
      phoneE164: "+84901234567"
    });
    await insertExistingUser({
      role: "ADMIN",
      email: "inactive-admin@example.com",
      phoneE164: null,
      active: false
    });

    for (const email of ["tenant@example.com", "landlord@example.com", "inactive-admin@example.com"]) {
      const before = await readUser(email);
      await expect(provisionAdmin(pool, adminInput(email, "AttemptPass123"))).rejects.toBeInstanceOf(
        AdminProvisioningConflictError
      );
      expect(await readUser(email)).toStrictEqual(before);
    }

    const counts = await pool.query<{ userCount: number; adminCount: number; activeAdminCount: number }>(
      `
        SELECT
          count(*)::integer AS "userCount",
          count(*) FILTER (WHERE role = 'ADMIN')::integer AS "adminCount",
          count(*) FILTER (WHERE role = 'ADMIN' AND is_active)::integer AS "activeAdminCount"
        FROM users
      `
    );
    expect(counts.rows).toStrictEqual([{ userCount: 3, adminCount: 1, activeAdminCount: 0 }]);
  });

  it("serializes concurrent attempts into one creation and one no-op without password overwrite", async () => {
    await migrateSchema();
    const inputs = [
      adminInput("concurrent@example.com", "WinningOne123"),
      adminInput("concurrent@example.com", "WinningTwo123")
    ] as const;

    const results = await Promise.all(inputs.map((input) => provisionAdmin(pool, input)));
    expect(results.map(({ outcome }) => outcome).sort()).toStrictEqual(["already-provisioned", "created"]);

    const createdIndex = results.findIndex(({ outcome }) => outcome === "created");
    const losingIndex = createdIndex === 0 ? 1 : 0;
    const user = await readUser("concurrent@example.com");
    expect(user.id).toBe(results[createdIndex]!.userId);
    expect(results[losingIndex]!.userId).toBe(user.id);
    await expect(compare(inputs[createdIndex]!.password, user.passwordHash)).resolves.toBe(true);
    await expect(compare(inputs[losingIndex]!.password, user.passwordHash)).resolves.toBe(false);

    const count = await pool.query<{ count: number }>("SELECT count(*)::integer AS count FROM users WHERE email = $1", [
      "concurrent@example.com"
    ]);
    expect(count.rows).toStrictEqual([{ count: 1 }]);
    expect(pool.waitingCount).toBe(0);
  });

  it("rolls back controlled insert failure, releases the client, and exposes only a sanitized error", async () => {
    await migrateSchema();
    const plaintextPassword = "RollbackPass123";
    let released = false;
    let rolledBack = false;
    const faultingPool = {
      connect: async (): Promise<PoolClient> => {
        const client = await pool.connect();

        return new Proxy(client, {
          get(target, property, receiver) {
            if (property === "query") {
              return async (sql: string, values?: unknown[]) => {
                if (/^\s*INSERT\s+INTO\s+users/i.test(sql)) {
                  throw new Error("controlled insertion failure");
                }
                if (/^\s*ROLLBACK/i.test(sql)) {
                  rolledBack = true;
                }
                return target.query(sql, values);
              };
            }

            if (property === "release") {
              return () => {
                released = true;
                target.release();
              };
            }

            return Reflect.get(target, property, receiver);
          }
        });
      }
    };

    let error: unknown;
    try {
      await provisionAdmin(faultingPool, adminInput("rollback@example.com", plaintextPassword));
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(AdminProvisioningError);
    expect((error as Error).message).toBe("Admin provisioning failed.");
    expect((error as Error).message).not.toContain(plaintextPassword);
    expect((error as Error).message).not.toContain("INSERT");
    expect((error as Error).message).not.toContain("postgresql://");
    expect(rolledBack).toBe(true);
    expect(released).toBe(true);
    const count = await pool.query<{ count: number }>("SELECT count(*)::integer AS count FROM users");
    expect(count.rows).toStrictEqual([{ count: 0 }]);
    expect(pool.waitingCount).toBe(0);
  });

  it("runs read-only on the correct schema and fails every controlled catalog mismatch", async () => {
    await migrateSchema();
    let mutatingQueryCount = 0;
    const guardedReadOnlyPool = {
      connect: async (): Promise<PoolClient> => {
        const client = await pool.connect();

        return new Proxy(client, {
          get(target, property, receiver) {
            if (property === "query") {
              return async (sql: string, values?: unknown[]) => {
                if (/^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql)) {
                  mutatingQueryCount += 1;
                  throw new Error("verifier attempted a write");
                }
                return target.query(sql, values);
              };
            }

            if (property === "release") {
              return () => target.release();
            }

            return Reflect.get(target, property, receiver);
          }
        });
      }
    };

    await expect(verifyFinalSchema(guardedReadOnlyPool)).resolves.toMatchObject({
      enumCount: 2,
      tableCount: 8,
      constraintCount: 52,
      explicitIndexCount: 10
    });
    expect(mutatingQueryCount).toBe(0);

    await expectVerifierFailure(
      () => pool.query("ALTER TABLE favorites RENAME TO favorites_missing").then(() => undefined),
      () => pool.query("ALTER TABLE favorites_missing RENAME TO favorites").then(() => undefined)
    );
    await expectVerifierFailure(
      () => pool.query("CREATE TABLE rm008_unexpected_table (id integer PRIMARY KEY)").then(() => undefined),
      () => pool.query("DROP TABLE rm008_unexpected_table").then(() => undefined)
    );
    await expectVerifierFailure(
      () => pool.query("ALTER TYPE listing_status RENAME TO listing_status_missing").then(() => undefined),
      () => pool.query("ALTER TYPE listing_status_missing RENAME TO listing_status").then(() => undefined)
    );
    await expectVerifierFailure(
      () => pool.query("UPDATE property_types SET label = 'Incorrect label' WHERE code = 'ROOM'").then(() => undefined),
      () => pool.query("UPDATE property_types SET label = 'Room' WHERE code = 'ROOM'").then(() => undefined)
    );
    await expectVerifierFailure(
      () => pool.query("CREATE INDEX idx_rm008_unexpected ON users (role)").then(() => undefined),
      () => pool.query("DROP INDEX idx_rm008_unexpected").then(() => undefined)
    );
    await expectVerifierFailure(
      () => pool.query("DROP INDEX idx_listings_status_updated_at").then(() => undefined),
      () =>
        pool
          .query("CREATE INDEX idx_listings_status_updated_at ON listings (status, updated_at DESC, id DESC)")
          .then(() => undefined)
    );
    await expectVerifierFailure(
      () => pool.query("CREATE TABLE schema_migrations (version integer PRIMARY KEY)").then(() => undefined),
      () => pool.query("DROP TABLE schema_migrations").then(() => undefined)
    );
  });

  it("keeps lookup seed identities stable and preserves retired rows across repeat execution", async () => {
    await migrateSchema();
    const propertyTypeSeed = await readFile(propertyTypeSeedPath, "utf8");
    const amenitySeed = await readFile(amenitySeedPath, "utf8");
    const initialPropertyTypes = await pool.query<LookupSnapshot>(
      'SELECT id, code, label, is_active AS "isActive" FROM property_types ORDER BY code'
    );
    const initialAmenities = await pool.query<LookupSnapshot>(
      'SELECT id, code, label, is_active AS "isActive" FROM amenities ORDER BY code'
    );

    await pool.query(propertyTypeSeed);
    await pool.query(amenitySeed);
    expect(
      await pool.query<LookupSnapshot>(
        'SELECT id, code, label, is_active AS "isActive" FROM property_types ORDER BY code'
      )
    ).toMatchObject({ rows: initialPropertyTypes.rows });
    expect(
      await pool.query<LookupSnapshot>('SELECT id, code, label, is_active AS "isActive" FROM amenities ORDER BY code')
    ).toMatchObject({ rows: initialAmenities.rows });

    await pool.query("UPDATE property_types SET is_active = false WHERE code = 'ROOM'");
    await pool.query("UPDATE amenities SET is_active = false WHERE code = 'WIFI'");
    await pool.query(propertyTypeSeed);
    await pool.query(amenitySeed);

    const finalPropertyTypes = await pool.query<LookupSnapshot>(
      'SELECT id, code, label, is_active AS "isActive" FROM property_types ORDER BY code'
    );
    const finalAmenities = await pool.query<LookupSnapshot>(
      'SELECT id, code, label, is_active AS "isActive" FROM amenities ORDER BY code'
    );
    expect(finalPropertyTypes.rows).toHaveLength(5);
    expect(finalAmenities.rows).toHaveLength(12);
    expect(finalPropertyTypes.rows.map(({ id }) => id)).toStrictEqual(initialPropertyTypes.rows.map(({ id }) => id));
    expect(finalAmenities.rows.map(({ id }) => id)).toStrictEqual(initialAmenities.rows.map(({ id }) => id));
    expect(finalPropertyTypes.rows.find(({ code }) => code === "ROOM")).toMatchObject({
      label: "Room",
      isActive: false
    });
    expect(finalAmenities.rows.find(({ code }) => code === "WIFI")).toMatchObject({
      label: "Wi-Fi",
      isActive: false
    });
    await expect(verifyFinalSchema(pool)).resolves.toMatchObject({
      propertyTypeCount: 5,
      amenityCount: 12
    });
  });
});
