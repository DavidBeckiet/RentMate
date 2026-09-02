import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../../shared/src/runtime/app.js";
import { createProtectedAuthenticationMiddleware } from "../../shared/src/runtime/shared/middleware/authentication.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { registerContactRoutes } from "../src/modules/contact/routes.js";
import { registerRoommateRoutes } from "../src/modules/roommate/routes.js";
import type { ContactService } from "../src/modules/contact/services/contact-service.js";
import type { RoommateService } from "../src/modules/roommate/services/roommate-service.js";
import type { RoommateSafetyService } from "../src/modules/roommate/services/roommate-safety-service.js";

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve((server.address() as { readonly port: number }).port))
  );
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test("Roommate safety additive projections survive Engagement HTTP DTO mapping with existing authorization", async () => {
  const authenticationMiddleware = createProtectedAuthenticationMiddleware({
    verifySessionToken: async (token) => {
      if (token === "tenant") return { status: "valid", claims: { userId: 2, role: "TENANT" } };
      if (token === "admin") return { status: "valid", claims: { userId: 9, role: "ADMIN" } };
      if (token === "landlord") return { status: "valid", claims: { userId: 10, role: "LANDLORD" } };
      if (token === "inactive") return { status: "valid", claims: { userId: 11, role: "TENANT" } };
      return { status: "invalid" };
    },
    loadAuthenticationAccount: async (userId) => {
      if (userId === 2) return { id: 2, role: "TENANT", isActive: true };
      if (userId === 9) return { id: 9, role: "ADMIN", isActive: true };
      if (userId === 10) return { id: 10, role: "LANDLORD", isActive: true };
      if (userId === 11) return { id: 11, role: "TENANT", isActive: false };
      return null;
    }
  });
  const safetyService = {
    async listMessages(principal: { readonly userId: number }, interestId: number) {
      assert.equal(principal.userId, 2);
      assert.equal(interestId, 7);
      return {
        data: [
          {
            id: 71,
            sender: "COUNTERPART" as const,
            body: "Please send the OTP.",
            createdAt: "2028-01-01T00:00:00.000Z",
            isRead: false,
            safetyWarning: {
              outcome: "HIGH_CAUTION" as const,
              signalCodes: ["OTP_REQUEST"],
              warningCode: "ROOMMATE_AI_HIGH_CAUTION" as const,
              analysisVersion: "ROOMMATE_AI_SAFETY_V3_1",
              analyzedAt: "2028-01-01T00:00:01.000Z"
            }
          }
        ],
        page: 1,
        pageSize: 100,
        hasNextPage: false
      };
    },
    async listAdminReports(principal: { readonly userId: number }) {
      assert.equal(principal.userId, 9);
      return {
        data: [
          {
            id: 501,
            targetType: "ROOMMATE_MESSAGE" as const,
            category: "SPAM" as const,
            status: "OPEN" as const,
            createdAt: "2028-01-01T00:00:00.000Z",
            details: null,
            resolutionNote: null,
            updatedAt: "2028-01-01T00:00:00.000Z",
            resolvedAt: null,
            reporter: { displayName: "Tenant", memberSince: "2026-01" },
            subject: { requestId: 8, messageId: 71 },
            riskSummary: {
              rulesVersion: "ROOMMATE_RISK_V2_1",
              reviewPriority: "STANDARD" as const,
              partialEvaluation: false,
              flags: [],
              evaluatedAt: "2028-01-01T00:00:00.000Z"
            },
            aiSafetySummary: {
              highestOutcome: "HIGH_CAUTION" as const,
              signalCodes: ["OTP_REQUEST"],
              messageIds: [71],
              analysisVersion: "ROOMMATE_AI_SAFETY_V3_1",
              promptVersion: "ROOMMATE_AI_SAFETY_PROMPT_V1",
              modelVersion: "configured-model-id",
              analyzedAt: "2028-01-01T00:00:01.000Z"
            }
          }
        ],
        page: 1,
        pageSize: 20,
        hasNextPage: false
      };
    }
  } as unknown as RoommateSafetyService;
  const contactService = {
    async listContactReports(principal: { readonly userId: number }, query: { readonly page: number; readonly pageSize: number }) {
      assert.equal(principal.userId, 9);
      return { data: [], page: query.page, pageSize: query.pageSize, hasNextPage: false };
    }
  } as unknown as ContactService;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) => {
      registerRoommateRoutes(router, {
        authenticationMiddleware,
        tenantRoleMiddleware: createRoleMiddleware(["TENANT"]),
        adminRoleMiddleware: createRoleMiddleware(["ADMIN"]),
        service: {} as RoommateService,
        safetyService
      });
      registerContactRoutes(router, {
        authenticationMiddleware,
        tenantRoleMiddleware: createRoleMiddleware(["TENANT"]),
        landlordRoleMiddleware: createRoleMiddleware(["LANDLORD"]),
        adminRoleMiddleware: createRoleMiddleware(["ADMIN"]),
        contactService,
        realtimeHub: {} as never
      });
    }
  });
  const server = createServer(app);
  const port = await listen(server);
  try {
    const messages = await fetch(`http://127.0.0.1:${port}/api/v1/roommate-interests/7/messages?page=1&pageSize=100`, {
      headers: { cookie: "rentmate_session=tenant" }
    });
    assert.equal(messages.status, 200);
    const messagePayload = (await messages.json()) as { readonly data: readonly Record<string, unknown>[] };
    assert.deepEqual(messagePayload.data[0]?.safetyWarning, {
      outcome: "HIGH_CAUTION",
      signalCodes: ["OTP_REQUEST"],
      warningCode: "ROOMMATE_AI_HIGH_CAUTION",
      analysisVersion: "ROOMMATE_AI_SAFETY_V3_1",
      analyzedAt: "2028-01-01T00:00:01.000Z"
    });
    for (const [label, cookie, status] of [
      ["anonymous", undefined, 401],
      ["inactive", "rentmate_session=inactive", 401],
      ["landlord", "rentmate_session=landlord", 403],
      ["admin", "rentmate_session=admin", 403]
    ] as const) {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/roommate-interests/7/messages`, {
        headers: cookie ? { cookie } : {}
      });
      assert.equal(response.status, status, label);
    }

    const reports = await fetch(
      `http://127.0.0.1:${port}/api/v1/admin/contact-reports?source=ROOMMATE&page=1&pageSize=20`,
      { headers: { cookie: "rentmate_session=admin" } }
    );
    assert.equal(reports.status, 200);
    const reportPayload = (await reports.json()) as { readonly data: readonly Record<string, unknown>[] };
    assert.deepEqual(reportPayload.data[0]?.aiSafetySummary, {
      highestOutcome: "HIGH_CAUTION",
      signalCodes: ["OTP_REQUEST"],
      messageIds: [71],
      analysisVersion: "ROOMMATE_AI_SAFETY_V3_1",
      promptVersion: "ROOMMATE_AI_SAFETY_PROMPT_V1",
      modelVersion: "configured-model-id",
      analyzedAt: "2028-01-01T00:00:01.000Z"
    });
    assert.equal(
      (
        (await (
          await fetch(`http://127.0.0.1:${port}/api/v1/admin/contact-reports?source=ROOMMATE&page=1&pageSize=20`, {
            headers: { cookie: "rentmate_session=tenant" }
          })
        ).json()) as { readonly error: { readonly code: string } }
      ).error.code,
      "FORBIDDEN"
    );

    const contactReports = await fetch(
      `http://127.0.0.1:${port}/api/v1/admin/contact-reports?status=OPEN&page=1&pageSize=20`,
      { headers: { cookie: "rentmate_session=admin" } }
    );
    assert.equal(contactReports.status, 200);
    assert.deepEqual((await contactReports.json()).data, []);
  } finally {
    await close(server);
  }
});
