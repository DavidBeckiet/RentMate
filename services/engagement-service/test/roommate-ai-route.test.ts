import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../../shared/src/runtime/app.js";
import { createProtectedAuthenticationMiddleware } from "../../shared/src/runtime/shared/middleware/authentication.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { parseRoommateAiConfiguration } from "../src/modules/roommate-ai/config/roommate-ai-config.js";
import { registerRoommateAiRoutes } from "../src/modules/roommate-ai/routes.js";
import { RoommateAiCapabilityService } from "../src/modules/roommate-ai/services/roommate-ai-capability-service.js";
import { RoommateAiPreferencePreviewService } from "../src/modules/roommate-ai/services/preference-preview-service.js";
import { RoommateAiRecommendationService } from "../src/modules/roommate-ai/services/recommendation-service.js";
import type { RoommateService } from "../src/modules/roommate/services/roommate-service.js";

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Roommate AI route test server did not start.");
      resolve(address.port);
    });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function createTestServer(capabilityService: RoommateAiCapabilityService): ReturnType<typeof createServer> {
  const authenticationMiddleware = createProtectedAuthenticationMiddleware({
    verifySessionToken: async (token) => {
      if (token === "tenant") return { status: "valid", claims: { userId: 1, role: "TENANT" } };
      if (token === "landlord") return { status: "valid", claims: { userId: 2, role: "LANDLORD" } };
      if (token === "admin") return { status: "valid", claims: { userId: 3, role: "ADMIN" } };
      if (token === "inactive") return { status: "valid", claims: { userId: 4, role: "TENANT" } };
      return { status: "invalid" };
    },
    loadAuthenticationAccount: async (userId) => {
      if (userId === 1) return { id: 1, role: "TENANT", isActive: true };
      if (userId === 2) return { id: 2, role: "LANDLORD", isActive: true };
      if (userId === 3) return { id: 3, role: "ADMIN", isActive: true };
      if (userId === 4) return { id: 4, role: "TENANT", isActive: false };
      return null;
    }
  });
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) =>
      registerRoommateAiRoutes(router, {
        authenticationMiddleware,
        tenantRoleMiddleware: createRoleMiddleware(["TENANT"]),
        capabilityService,
        preferencePreviewService: new RoommateAiPreferencePreviewService(parseRoommateAiConfiguration({}), null),
        recommendationService: new RoommateAiRecommendationService(
          parseRoommateAiConfiguration({}),
          null,
          {} as RoommateService
        )
      })
  });
  return createServer(app);
}

test("Roommate AI capabilities are tenant-only, provider-free, and disabled by default", async () => {
  const server = createTestServer(new RoommateAiCapabilityService(parseRoommateAiConfiguration({})));
  const port = await listen(server);
  const request = (token?: string) =>
    fetch(`http://127.0.0.1:${port}/api/v1/roommate-ai/capabilities`, {
      headers: token ? { cookie: `rentmate_session=${token}` } : {}
    });

  try {
    const tenant = await request("tenant");
    assert.equal(tenant.status, 200);
    assert.deepEqual(await tenant.json(), {
      data: {
        preferenceParsing: false,
        semanticRecommendations: false,
        compatibilityExplanations: false,
        safetyWarnings: false
      }
    });
    for (const [token, status, code] of [
      [undefined, 401, "AUTHENTICATION_REQUIRED"],
      ["landlord", 403, "FORBIDDEN"],
      ["admin", 403, "FORBIDDEN"],
      ["inactive", 401, "AUTHENTICATION_REQUIRED"]
    ] as const) {
      const response = await request(token);
      assert.equal(response.status, status);
      assert.equal(((await response.json()) as { readonly error: { readonly code: string } }).error.code, code);
    }
  } finally {
    await close(server);
  }
});

test("Roommate AI capabilities use server-side rollout and keep safety hidden outside TENANT mode", () => {
  const shared = {
    ROOMMATE_AI_PROVIDER: "GEMINI",
    ROOMMATE_AI_ENABLED: "true",
    ROOMMATE_AI_PARSER_ENABLED: "true",
    ROOMMATE_AI_RECOMMENDATION_ENABLED: "true",
    ROOMMATE_AI_EXPLANATION_ENABLED: "true",
    GEMINI_API_KEY: "test-server-key",
    ROOMMATE_AI_PARSER_MODEL: "gemini-parser",
    ROOMMATE_AI_RECOMMENDATION_MODEL: "gemini-recommendation",
    ROOMMATE_AI_EXPLANATION_MODEL: "gemini-explanation",
    ROOMMATE_AI_SAFETY_MODEL: "gemini-safety",
    ROOMMATE_AI_ROLLOUT_PERCENTAGE: "100"
  } as const;
  const shadow = new RoommateAiCapabilityService(
    parseRoommateAiConfiguration({ ...shared, ROOMMATE_AI_SAFETY_MODE: "SHADOW" })
  );
  assert.deepEqual(shadow.getCapabilities({ userId: 1, role: "TENANT" }), {
    preferenceParsing: true,
    semanticRecommendations: true,
    compatibilityExplanations: true,
    safetyWarnings: false
  });
  const tenant = new RoommateAiCapabilityService(
    parseRoommateAiConfiguration({ ...shared, ROOMMATE_AI_SAFETY_MODE: "TENANT" })
  );
  assert.equal(tenant.getCapabilities({ userId: 1, role: "TENANT" }).safetyWarnings, true);
  const outsideRollout = new RoommateAiCapabilityService(
    parseRoommateAiConfiguration({ ...shared, ROOMMATE_AI_SAFETY_MODE: "TENANT", ROOMMATE_AI_ROLLOUT_PERCENTAGE: "0" })
  );
  assert.deepEqual(outsideRollout.getCapabilities({ userId: 1, role: "TENANT" }), {
    preferenceParsing: false,
    semanticRecommendations: false,
    compatibilityExplanations: false,
    safetyWarnings: false
  });
});

test("preference preview keeps tenant authorization and returns feature-off without a provider call", async () => {
  const server = createTestServer(new RoommateAiCapabilityService(parseRoommateAiConfiguration({})));
  const port = await listen(server);
  const request = (token: string | undefined, body: unknown) =>
    fetch(`http://127.0.0.1:${port}/api/v1/roommate-ai/preference-previews`, {
      method: "POST",
      headers: {
        ...(token ? { cookie: `rentmate_session=${token}` } : {}),
        origin: "http://localhost:3000",
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
  try {
    const anonymous = await request(undefined, {
      target: "PROFILE",
      text: "Mình thích nhà yên tĩnh và không hút thuốc.",
      locale: "vi"
    });
    assert.equal(anonymous.status, 401);
    const landlord = await request("landlord", {
      target: "PROFILE",
      text: "Mình thích nhà yên tĩnh và không hút thuốc.",
      locale: "vi"
    });
    assert.equal(landlord.status, 403);
    const invalid = await request("tenant", { target: "PROFILE", text: "ngắn", locale: "vi" });
    assert.equal(invalid.status, 422);
    const disabled = await request("tenant", {
      target: "PROFILE",
      text: "Mình thích nhà yên tĩnh và không hút thuốc.",
      locale: "vi"
    });
    assert.equal(disabled.status, 503);
    assert.equal(
      ((await disabled.json()) as { readonly error: { readonly code: string } }).error.code,
      "AI_FEATURE_UNAVAILABLE"
    );
  } finally {
    await close(server);
  }
});

test("recommendation route preserves tenant/origin validation and feature-off semantics", async () => {
  const server = createTestServer(new RoommateAiCapabilityService(parseRoommateAiConfiguration({})));
  const port = await listen(server);
  const request = (body: unknown) =>
    fetch(`http://127.0.0.1:${port}/api/v1/roommate-ai/recommendations`, {
      method: "POST",
      headers: {
        cookie: "rentmate_session=tenant",
        origin: "http://localhost:3000",
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
  try {
    const invalid = await request({ filters: { page: 1 } });
    assert.equal(invalid.status, 422);
    const disabled = await request({ filters: {}, limit: 10, locale: "vi" });
    assert.equal(disabled.status, 503);
    assert.equal(
      ((await disabled.json()) as { readonly error: { readonly code: string } }).error.code,
      "AI_FEATURE_UNAVAILABLE"
    );
  } finally {
    await close(server);
  }
});
