import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../../shared/src/runtime/app.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import { createProtectedAuthenticationMiddleware } from "../../shared/src/runtime/shared/middleware/authentication.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { registerSupportRoutes } from "../src/modules/support/routes.js";
import type { AdminSupportRequest, SupportService } from "../src/modules/support/services/support-service.js";

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port))
  );
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

const openRequest: AdminSupportRequest = Object.freeze({
  id: 7,
  requesterId: 11,
  requesterRole: "TENANT",
  requester: { id: 11, role: "TENANT", email: "tenant@example.test", isActive: true },
  category: "TECHNICAL",
  subject: "Unable to open a conversation",
  message: "The page fails while sending a message.",
  status: "OPEN",
  resolutionNote: null,
  assignedAdminId: null,
  createdAt: "2026-09-17T08:00:00.000Z",
  updatedAt: "2026-09-17T08:00:00.000Z",
  resolvedAt: null
});

const inProgressRequest: AdminSupportRequest = Object.freeze({ ...openRequest, id: 8, status: "IN_PROGRESS" });
const resolvedRequest: AdminSupportRequest = Object.freeze({
  ...openRequest,
  id: 9,
  status: "RESOLVED",
  resolutionNote: "Reviewed internally and closed.",
  assignedAdminId: 1,
  updatedAt: "2026-09-17T09:00:00.000Z",
  resolvedAt: "2026-09-17T09:00:00.000Z"
});

function createRouteService(): SupportService {
  const records = new Map<number, AdminSupportRequest>([
    [openRequest.id, openRequest],
    [inProgressRequest.id, inProgressRequest],
    [resolvedRequest.id, resolvedRequest]
  ]);
  return {
    async create() {
      throw new Error("Not used by this route test.");
    },
    async listAdmin() {
      return { data: [], page: 1, pageSize: 20, hasNextPage: false };
    },
    async getAdmin(_principal, supportRequestId) {
      const record = records.get(supportRequestId);
      if (!record) throw new ApplicationError("RESOURCE_NOT_FOUND", "The requested support request was not found.");
      return record;
    },
    async updateAdmin() {
      throw new Error("Not used by this route test.");
    }
  };
}

test("admin support request GET-by-ID preserves authorization, validation, and the collection DTO", async () => {
  const authenticationMiddleware = createProtectedAuthenticationMiddleware({
    verifySessionToken: async (token) => {
      if (token === "admin") return { status: "valid", claims: { userId: 1, role: "ADMIN" } };
      if (token === "tenant") return { status: "valid", claims: { userId: 11, role: "TENANT" } };
      return { status: "invalid" };
    },
    loadAuthenticationAccount: async (userId) =>
      userId === 1 ? { id: 1, role: "ADMIN", isActive: true } : { id: 11, role: "TENANT", isActive: true }
  });
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) =>
      registerSupportRoutes(router, {
        authenticationMiddleware,
        adminRoleMiddleware: createRoleMiddleware(["ADMIN"]),
        service: createRouteService()
      })
  });
  const server = createServer(app);
  const port = await listen(server);
  const request = (supportRequestId: string, token?: string) =>
    fetch(`http://127.0.0.1:${port}/api/v1/admin/support-requests/${supportRequestId}`, {
      headers: token ? { cookie: `rentmate_session=${token}` } : undefined
    });

  try {
    for (const expected of [openRequest, inProgressRequest, resolvedRequest]) {
      const response = await request(String(expected.id), "admin");
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        data: {
          id: expected.id,
          requester: expected.requester,
          category: expected.category,
          subject: expected.subject,
          message: expected.message,
          status: expected.status,
          resolutionNote: expected.resolutionNote,
          assignedAdminId: expected.assignedAdminId,
          createdAt: expected.createdAt,
          updatedAt: expected.updatedAt,
          resolvedAt: expected.resolvedAt
        }
      });
    }
    assert.equal((await request("999", "admin")).status, 404);
    assert.equal((await request("invalid", "admin")).status, 422);
    assert.equal((await request("7")).status, 401);
    assert.equal((await request("7", "tenant")).status, 403);
  } finally {
    await close(server);
  }
});
