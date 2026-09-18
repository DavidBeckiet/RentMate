import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../../shared/src/runtime/app.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createProtectedAuthenticationMiddleware } from "../../shared/src/runtime/shared/middleware/authentication.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { createEngagementOverviewRepository } from "../src/modules/overview/repositories/engagement-overview-repository.js";
import { registerEngagementOverviewRoutes } from "../src/modules/overview/routes.js";
import { createEngagementOverviewService } from "../src/modules/overview/services/engagement-overview-service.js";

test("Engagement overview separates contact and roommate reports by their source", async () => {
  let text = "";
  const repository = createEngagementOverviewRepository({
    async query(input) {
      text = typeof input === "string" ? input : input.text;
      return {
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [
          {
            support_open_count: 1,
            support_in_progress_count: 2,
            pending_review_count: 3,
            contact_open_count: 4,
            contact_investigating_count: 5,
            roommate_open_count: 6,
            roommate_investigating_count: 7,
            review_report_open_count: 8,
            review_report_investigating_count: 9,
            captured_at: new Date("2026-09-17T00:00:00.000Z")
          }
        ]
      };
    }
  } as SqlExecutor);
  const value = await repository.read();
  assert.deepEqual(value.contactReports, { open: 4, investigating: 5 });
  assert.deepEqual(value.roommateReports, { open: 6, investigating: 7 });
  assert.match(text, /source = 'CONTACT_INQUIRY'/);
  assert.match(text, /source = 'ROOMMATE'/);
  await assert.rejects(
    createEngagementOverviewService({ read: async () => value }).read({ userId: 2, role: "LANDLORD" }),
    {
      code: "FORBIDDEN"
    }
  );
});

test("Engagement overview route preserves 401 and 403 authorization semantics", async () => {
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
  const empty = {
    support: { open: 0, inProgress: 0 },
    reviews: { pending: 0 },
    contactReports: { open: 0, investigating: 0 },
    roommateReports: { open: 0, investigating: 0 },
    reviewReports: { open: 0, investigating: 0 },
    capturedAt: "2026-09-17T00:00:00.000Z"
  } as const;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) =>
      registerEngagementOverviewRoutes(router, {
        authenticationMiddleware,
        adminRoleMiddleware: createRoleMiddleware(["ADMIN"]),
        service: createEngagementOverviewService({ read: async () => empty })
      })
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/admin/overview/engagement`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { cookie: "rentmate_session=tenant" } })).status, 403);
    assert.equal((await fetch(url, { headers: { cookie: "rentmate_session=admin" } })).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
