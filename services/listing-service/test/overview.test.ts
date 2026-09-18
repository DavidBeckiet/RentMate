import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../../shared/src/runtime/app.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createProtectedAuthenticationMiddleware } from "../../shared/src/runtime/shared/middleware/authentication.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { createListingOverviewRepository } from "../src/modules/overview/repositories/listing-overview-repository.js";
import { registerListingOverviewRoutes } from "../src/modules/overview/routes.js";
import { createListingOverviewService } from "../src/modules/overview/services/listing-overview-service.js";

test("Listing overview counts every moderation status and keeps reports separate", async () => {
  let text = "";
  const repository = createListingOverviewRepository({
    async query(input) {
      text = typeof input === "string" ? input : input.text;
      return {
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [
          {
            listing_total: 6,
            draft_count: 1,
            pending_count: 1,
            approved_count: 1,
            rejected_count: 1,
            hidden_count: 1,
            inactive_count: 1,
            open_report_count: 2,
            investigating_report_count: 3,
            captured_at: new Date("2026-09-17T00:00:00.000Z")
          }
        ]
      };
    }
  } as SqlExecutor);
  const value = await repository.read();
  assert.equal(value.listings.total, 6);
  assert.equal(value.listings.byStatus.APPROVED, 1);
  assert.deepEqual(value.listingReports, { open: 2, investigating: 3 });
  assert.match(text, /FROM listings/);
  assert.match(text, /FROM listing_reports/);
  await assert.rejects(createListingOverviewService({ read: async () => value }).read({ userId: 2, role: "TENANT" }), {
    code: "FORBIDDEN"
  });
});

test("Listing overview route preserves 401 and 403 authorization semantics", async () => {
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
      registerListingOverviewRoutes(router, {
        authenticationMiddleware,
        adminRoleMiddleware: createRoleMiddleware(["ADMIN"]),
        service: createListingOverviewService({
          read: async () => ({
            listings: {
              total: 0,
              byStatus: { DRAFT: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, HIDDEN: 0, INACTIVE: 0 }
            },
            listingReports: { open: 0, investigating: 0 },
            capturedAt: "2026-09-17T00:00:00.000Z"
          })
        })
      })
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/admin/overview/listings`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { cookie: "rentmate_session=tenant" } })).status, 403);
    assert.equal((await fetch(url, { headers: { cookie: "rentmate_session=admin" } })).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
