import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../../shared/src/runtime/app.js";
import { createProtectedAuthenticationMiddleware } from "../../shared/src/runtime/shared/middleware/authentication.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { registerRoommateRoutes } from "../src/modules/roommate/routes.js";
import type { RoommateService } from "../src/modules/roommate/services/roommate-service.js";
import type { RoommateSafetyService } from "../src/modules/roommate/services/roommate-safety-service.js";

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Roommate route test server did not start.");
      resolve(address.port);
    });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test("lists caller-owned roommate blocks only for an active tenant", async () => {
  const authenticationMiddleware = createProtectedAuthenticationMiddleware({
    verifySessionToken: async (token) => {
      if (token === "tenant") return { status: "valid", claims: { userId: 1, role: "TENANT" } };
      if (token === "landlord") return { status: "valid", claims: { userId: 2, role: "LANDLORD" } };
      if (token === "inactive") return { status: "valid", claims: { userId: 3, role: "TENANT" } };
      return { status: "invalid" };
    },
    loadAuthenticationAccount: async (userId) => {
      if (userId === 1) return { id: 1, role: "TENANT", isActive: true };
      if (userId === 2) return { id: 2, role: "LANDLORD", isActive: true };
      if (userId === 3) return { id: 3, role: "TENANT", isActive: false };
      return null;
    }
  });
  const safetyService = {
    async listOwnedBlocks(
      principal: { readonly userId: number },
      query: { readonly page: number; readonly pageSize: number }
    ) {
      assert.equal(principal.userId, 1);
      assert.deepEqual(query, { page: 1, pageSize: 20, offset: 0 });
      return {
        data: [
          {
            blockedAt: "2026-08-27T12:00:00.000Z",
            counterpart: { displayName: "Minh", memberSince: "2026-01" },
            unblockAction: { kind: "REQUEST" as const, id: 8 }
          }
        ],
        page: 1,
        pageSize: 20,
        hasNextPage: false
      };
    }
  } as unknown as RoommateSafetyService;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) =>
      registerRoommateRoutes(router, {
        authenticationMiddleware,
        tenantRoleMiddleware: createRoleMiddleware(["TENANT"]),
        service: {} as RoommateService,
        safetyService
      })
  });
  const server = createServer(app);
  const port = await listen(server);
  const request = (token?: string) =>
    fetch(`http://127.0.0.1:${port}/api/v1/roommate-blocks/mine`, {
      headers: token ? { cookie: `rentmate_session=${token}` } : {}
    });

  try {
    const tenant = await request("tenant");
    assert.equal(tenant.status, 200);
    const tenantPayload = (await tenant.json()) as { readonly data: readonly Record<string, unknown>[] };
    assert.deepEqual(tenantPayload.data, [
      {
        blockedAt: "2026-08-27T12:00:00.000Z",
        counterpart: { displayName: "Minh", memberSince: "2026-01" },
        unblockAction: { kind: "REQUEST", id: 8 }
      }
    ]);
    assert.equal("tenantId" in (tenantPayload.data[0] ?? {}), false);
    assert.equal("blockedTenantId" in (tenantPayload.data[0] ?? {}), false);

    for (const [label, token, status, code] of [
      ["anonymous", undefined, 401, "AUTHENTICATION_REQUIRED"],
      ["landlord", "landlord", 403, "FORBIDDEN"],
      ["inactive tenant", "inactive", 401, "AUTHENTICATION_REQUIRED"]
    ] as const) {
      const response = await request(token);
      assert.equal(response.status, status, label);
      const payload = (await response.json()) as { readonly error: { readonly code: string } };
      assert.equal(payload.error.code, code, label);
    }
  } finally {
    await close(server);
  }
});
