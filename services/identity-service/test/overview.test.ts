import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../../shared/src/runtime/app.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createProtectedAuthenticationMiddleware } from "../../shared/src/runtime/shared/middleware/authentication.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { createIdentityOverviewRepository } from "../src/modules/overview/repositories/identity-overview-repository.js";
import { registerIdentityOverviewRoutes } from "../src/modules/overview/routes.js";
import { createIdentityOverviewService } from "../src/modules/overview/services/identity-overview-service.js";

const overview = Object.freeze({
  accounts: { total: 3, byRole: { TENANT: 1, LANDLORD: 1, ADMIN: 1 }, active: 2, inactive: 1 },
  verifications: { pending: 1 },
  capturedAt: "2026-09-17T00:00:00.000Z"
});

test("Identity overview uses global aggregate SQL and preserves account invariants", async () => {
  let text = "";
  const repository = createIdentityOverviewRepository({
    async query(input) {
      text = typeof input === "string" ? input : input.text;
      return {
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [
          {
            account_total: 3,
            tenant_count: 1,
            landlord_count: 1,
            admin_count: 1,
            active_count: 2,
            inactive_count: 1,
            pending_verification_count: 1,
            captured_at: new Date("2026-09-17T00:00:00.000Z")
          }
        ]
      };
    }
  } as SqlExecutor);
  assert.deepEqual(await repository.read(), overview);
  assert.match(text, /COUNT\(\*\) FILTER \(WHERE role = 'TENANT'\)/);
  assert.match(text, /landlord_verifications WHERE status = 'PENDING'/);
});

test("Identity overview route requires an active admin", async () => {
  const authenticationMiddleware = createProtectedAuthenticationMiddleware({
    verifySessionToken: async (token) =>
      token === "admin"
        ? { status: "valid", claims: { userId: 1, role: "ADMIN" } }
        : token === "tenant"
          ? { status: "valid", claims: { userId: 2, role: "TENANT" } }
          : { status: "invalid" },
    loadAuthenticationAccount: async (id) =>
      id === 1 ? { id, role: "ADMIN", isActive: true } : { id, role: "TENANT", isActive: true }
  });
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) =>
      registerIdentityOverviewRoutes(router, {
        authenticationMiddleware,
        adminRoleMiddleware: createRoleMiddleware(["ADMIN"]),
        service: createIdentityOverviewService({ read: async () => overview })
      })
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const request = (token?: string) =>
      fetch(`http://127.0.0.1:${port}/api/v1/admin/overview/identity`, {
        headers: token ? { cookie: `rentmate_session=${token}` } : undefined
      });
    assert.equal((await request()).status, 401);
    assert.equal((await request("tenant")).status, 403);
    const response = await request("admin");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: overview });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
