import dotenv from "dotenv";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabasePool } from "../src/db/pool.js";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { createSqlExecutor } from "../src/db/sql-executor.js";
import { createSessionCookieService } from "../src/modules/auth/session-cookie.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import type { UserRole } from "../src/shared/types/authentication.js";
import {
  authUsersNowSeconds,
  authUsersOrigin,
  authUsersTestJwtSecret,
  createAuthUsersFixture
} from "./helpers/auth-users-fixture.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 4 });
const sqlExecutor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const tenantPassword = "tenant-password";
const landlordPassword = "landlord-password";

interface UserSnapshot {
  readonly id: number;
  readonly role: UserRole;
  readonly email: string;
  readonly phone_e164: string | null;
  readonly password_hash: string;
  readonly is_active: boolean;
  readonly created_at: Date;
  readonly updated_at: Date;
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

async function readUsers(): Promise<UserSnapshot[]> {
  const result = await pool.query<UserSnapshot>({
    text: `
      SELECT id, role, email, phone_e164, password_hash, is_active, created_at, updated_at
      FROM users
      ORDER BY id
    `,
    values: []
  });
  return result.rows;
}

async function productTableCounts(): Promise<Record<string, number>> {
  const names = [
    "users",
    "property_types",
    "amenities",
    "listings",
    "listing_images",
    "listing_amenities",
    "favorites",
    "moderation_history"
  ] as const;
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

function expectNoPrivateResponseData(response: request.Response, submittedPassword?: string): void {
  const serialized = JSON.stringify(response.body);
  expect(serialized).not.toMatch(
    /passwordHash|password_hash|phone_e164|rentmate_session|SELECT |INSERT |UPDATE |stack/i
  );
  if (submittedPassword) {
    expect(serialized).not.toContain(submittedPassword);
  }
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

describe("RM-018 PostgreSQL auth/users acceptance", () => {
  it("completes the tenant register/profile/logout/login lifecycle with timestamp-preserving no-ops", async () => {
    let nowSeconds = authUsersNowSeconds;
    const fixture = await createAuthUsersFixture({ sqlExecutor, sessionTokenClock: () => nowSeconds });
    const agent = request.agent(fixture.app);

    const registration = await agent
      .post("/api/v1/auth/register/tenant")
      .set("Origin", authUsersOrigin)
      .send({ email: " Tenant.Lifecycle@Example.com ", password: tenantPassword, phone: null })
      .expect(201);
    expect(registration.body.data).toMatchObject({ role: "TENANT", email: "tenant.lifecycle@example.com" });
    expect(registration.headers["set-cookie"][0]).toMatch(/^rentmate_session=/);
    expectNoPrivateResponseData(registration, tenantPassword);
    const userId = registration.body.data.id as number;

    const firstProfile = await agent.get("/api/v1/users/me").expect(200);
    expect(firstProfile.body.data.id).toBe(userId);
    await pool.query({
      text: "UPDATE users SET updated_at = $2 WHERE id = $1",
      values: [userId, "2020-01-01T00:00:00.000Z"]
    });

    const meaningful = await agent
      .patch("/api/v1/users/me")
      .set("Origin", authUsersOrigin)
      .send({ phone: "+84981112223" })
      .expect(200);
    const meaningfulTimestamp = meaningful.body.data.updatedAt as string;
    expect(new Date(meaningfulTimestamp).getTime()).toBeGreaterThan(new Date("2020-01-01T00:00:00.000Z").getTime());
    expect((await agent.get("/api/v1/users/me").expect(200)).body.data.phone).toBe("+84981112223");

    const samePhone = await agent
      .patch("/api/v1/users/me")
      .set("Origin", authUsersOrigin)
      .send({ phone: "  +84981112223  " })
      .expect(200);
    expect(samePhone.body.data.updatedAt).toBe(meaningfulTimestamp);
    const emptyPatch = await agent.patch("/api/v1/users/me").set("Origin", authUsersOrigin).send({}).expect(200);
    expect(emptyPatch.body.data.updatedAt).toBe(meaningfulTimestamp);

    const beforeLogin = (await readUsers())[0];
    await agent.post("/api/v1/auth/logout").set("Origin", authUsersOrigin).expect(204).expect("");
    await agent.get("/api/v1/users/me").expect(401);
    nowSeconds += 1;
    const login = await agent
      .post("/api/v1/auth/login")
      .set("Origin", authUsersOrigin)
      .send({ email: "TENANT.LIFECYCLE@EXAMPLE.COM", password: tenantPassword })
      .expect(200);
    expect(login.headers["set-cookie"][0]).toMatch(/^rentmate_session=/);
    expect((await agent.get("/api/v1/users/me").expect(200)).body.data.id).toBe(userId);

    const users = await readUsers();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      id: userId,
      email: "tenant.lifecycle@example.com",
      role: "TENANT",
      is_active: true
    });
    expect(users[0]?.password_hash).toBe(beforeLogin?.password_hash);
    expect(users[0]?.password_hash).toMatch(/^\$2b\$/);
    expect(users[0]?.password_hash).not.toBe(tenantPassword);
    expectNoPrivateResponseData(login, tenantPassword);

    const sessionTables = await pool.query<{ table_name: string }>({
      text: `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND (table_name ILIKE '%session%' OR table_name ILIKE '%refresh%' OR table_name ILIKE '%token%')
      `,
      values: []
    });
    expect(sessionTables.rows).toEqual([]);
  });

  it("completes the landlord lifecycle while preserving server-owned identity and unrelated state", async () => {
    const fixture = await createAuthUsersFixture({ sqlExecutor });
    const agent = request.agent(fixture.app);
    const initialCounts = await productTableCounts();
    const registration = await agent
      .post("/api/v1/auth/register/landlord")
      .set("Origin", authUsersOrigin)
      .send({ email: "landlord.lifecycle@example.com", password: landlordPassword, phone: "+84909998888" })
      .expect(201);
    const userId = registration.body.data.id as number;
    expect(registration.body.data.role).toBe("LANDLORD");
    expect((await agent.get("/api/v1/users/me").expect(200)).body.data.phone).toBe("+84909998888");

    for (const phone of [null, "   "] as const) {
      await agent.patch("/api/v1/users/me").set("Origin", authUsersOrigin).send({ phone }).expect(422);
      expect((await readUsers())[0]?.phone_e164).toBe("+84909998888");
    }
    await agent.patch("/api/v1/users/me").set("Origin", authUsersOrigin).send({ phone: "+84907776666" }).expect(200);

    await agent.post("/api/v1/auth/logout").set("Origin", authUsersOrigin).expect(204);
    await agent
      .post("/api/v1/auth/login")
      .set("Origin", authUsersOrigin)
      .send({ email: "landlord.lifecycle@example.com", password: landlordPassword })
      .expect(200);
    expect((await agent.get("/api/v1/users/me").expect(200)).body.data.phone).toBe("+84907776666");

    await request(fixture.app)
      .post("/api/v1/auth/login")
      .set("Origin", authUsersOrigin)
      .send({ password: "landlord.lifecycle@example.com" })
      .expect(422);
    await request(fixture.app)
      .post("/api/v1/auth/login")
      .set("Origin", authUsersOrigin)
      .send({ email: "+84907776666", password: landlordPassword })
      .expect(422);

    const rows = await readUsers();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: userId, role: "LANDLORD", email: "landlord.lifecycle@example.com" });
    const finalCounts = await productTableCounts();
    expect(finalCounts.users).toBe(initialCounts.users + 1);
    expect({ ...finalCounts, users: 0 }).toStrictEqual({ ...initialCounts, users: 0 });
  });

  it("blocks an account immediately after direct test deactivation without disclosing inactivity", async () => {
    const fixture = await createAuthUsersFixture({ sqlExecutor });
    const agent = request.agent(fixture.app);
    const registration = await agent
      .post("/api/v1/auth/register/tenant")
      .set("Origin", authUsersOrigin)
      .send({ email: "inactive@example.com", password: tenantPassword })
      .expect(201);
    await pool.query({ text: "UPDATE users SET is_active = false WHERE id = $1", values: [registration.body.data.id] });

    for (const response of [
      await agent.get("/api/v1/users/me"),
      await agent.patch("/api/v1/users/me").set("Origin", authUsersOrigin).send({ phone: "+84981112223" })
    ]) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
      expectNoPrivateResponseData(response);
    }
    const login = await request(fixture.app)
      .post("/api/v1/auth/login")
      .set("Origin", authUsersOrigin)
      .send({ email: "inactive@example.com", password: tenantPassword })
      .expect(401);
    expect(login.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(login.headers["set-cookie"]).toBeUndefined();
    expectNoPrivateResponseData(login, tenantPassword);
    await agent.post("/api/v1/auth/logout").set("Origin", authUsersOrigin).expect(204);
  });

  it("converges concurrent normalized-email HTTP registrations to one success and one safe conflict", async () => {
    const fixture = await createAuthUsersFixture({ sqlExecutor });
    const bodies = ["Concurrent@Example.com", " concurrent@example.com "].map((email) => ({
      email,
      password: tenantPassword
    }));
    const responses = await Promise.all(
      bodies.map((body) =>
        request(fixture.app).post("/api/v1/auth/register/tenant").set("Origin", authUsersOrigin).send(body)
      )
    );
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const success = responses.find(({ status }) => status === 201);
    const conflict = responses.find(({ status }) => status === 409);
    expect(success?.headers["set-cookie"]?.[0]).toMatch(/^rentmate_session=/);
    expect(conflict?.headers["set-cookie"]).toBeUndefined();
    expect(conflict?.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
    expect(await readUsers()).toHaveLength(1);
    expectNoPrivateResponseData(conflict as request.Response, tenantPassword);
  });

  it("persists a bcrypt hash and sanitizes a malformed stored-hash failure", async () => {
    const fixture = await createAuthUsersFixture({ sqlExecutor });
    const registration = await request(fixture.app)
      .post("/api/v1/auth/register/tenant")
      .set("Origin", authUsersOrigin)
      .send({ email: "hash@example.com", password: tenantPassword })
      .expect(201);
    const stored = (await readUsers())[0];
    expect(stored?.password_hash).toMatch(/^\$2b\$/);
    expect(stored?.password_hash).not.toBe(tenantPassword);
    expectNoPrivateResponseData(registration, tenantPassword);

    await pool.query({
      text: "UPDATE users SET password_hash = $2 WHERE id = $1",
      values: [stored?.id, "malformed-hash"]
    });
    const login = await request(fixture.app)
      .post("/api/v1/auth/login")
      .set("Origin", authUsersOrigin)
      .send({ email: "hash@example.com", password: tenantPassword })
      .expect(500);
    expect(login.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(login.body.error.code).not.toBe("INVALID_CREDENTIALS");
    expect(login.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(login.body)).not.toMatch(/malformed-hash|tenant-password|bcrypt|SELECT |stack/i);
  });

  it("keeps a committed registration when token signing fails", async () => {
    const actualTokenService = createSessionTokenService({
      secret: authUsersTestJwtSecret,
      nowSeconds: () => authUsersNowSeconds
    });
    const fixture = await createAuthUsersFixture({
      sqlExecutor,
      sessionTokenService: {
        sign: vi.fn(async () => Promise.reject(new Error("private token signing detail"))),
        verify: actualTokenService.verify
      }
    });
    const response = await request(fixture.app)
      .post("/api/v1/auth/register/tenant")
      .set("Origin", authUsersOrigin)
      .send({ email: "token-failure@example.com", password: tenantPassword })
      .expect(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/private token signing detail|tenant-password|stack/i);
    expect((await readUsers()).map(({ email }) => email)).toEqual(["token-failure@example.com"]);
  });

  it("keeps a committed registration when cookie writing fails", async () => {
    const actualCookieService = createSessionCookieService({ secure: false });
    const fixture = await createAuthUsersFixture({
      sqlExecutor,
      sessionCookieService: {
        set: vi.fn(() => {
          throw new Error("private cookie writing detail");
        }),
        clear: actualCookieService.clear
      }
    });
    const response = await request(fixture.app)
      .post("/api/v1/auth/register/tenant")
      .set("Origin", authUsersOrigin)
      .send({ email: "cookie-failure@example.com", password: tenantPassword })
      .expect(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/private cookie writing detail|tenant-password|stack/i);
    expect((await readUsers()).map(({ email }) => email)).toEqual(["cookie-failure@example.com"]);
  });
});
