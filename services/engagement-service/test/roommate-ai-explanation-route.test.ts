import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../../shared/src/runtime/app.js";
import { createProtectedAuthenticationMiddleware } from "../../shared/src/runtime/shared/middleware/authentication.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { InMemoryRateLimitStore } from "../../shared/src/runtime/shared/middleware/rate-limit.js";
import { registerRoommateRoutes } from "../src/modules/roommate/routes.js";
import type { RoommateAiCompatibilityExplanationService } from "../src/modules/roommate-ai/services/compatibility-explanation-service.js";
import type { RoommateService } from "../src/modules/roommate/services/roommate-service.js";

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port))
  );
}
function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test("AI explanation route preserves tenant authorization, locale-only validation, requestId, origin, and null evidence", async () => {
  const calls: { readonly requestId: number; readonly locale: string }[] = [];
  const authenticationMiddleware = createProtectedAuthenticationMiddleware({
    verifySessionToken: async (token) => {
      if (token === "tenant") return { status: "valid", claims: { userId: 1, role: "TENANT" } };
      if (token === "landlord") return { status: "valid", claims: { userId: 2, role: "LANDLORD" } };
      return { status: "invalid" };
    },
    loadAuthenticationAccount: async (userId) =>
      userId === 1 ? { id: 1, role: "TENANT", isActive: true } : { id: 2, role: "LANDLORD", isActive: true }
  });
  const explanationService = {
    async explain(_: unknown, requestId: number, input: { readonly locale: string }) {
      calls.push({ requestId, locale: input.locale });
      return null;
    }
  } as unknown as RoommateAiCompatibilityExplanationService;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) =>
      registerRoommateRoutes(router, {
        authenticationMiddleware,
        tenantRoleMiddleware: createRoleMiddleware(["TENANT"]),
        service: {} as RoommateService,
        aiExplanationService: explanationService
      })
  });
  const server = createServer(app);
  const port = await listen(server);
  const request = (token: string | undefined, body: unknown, origin = "http://localhost:3000") =>
    fetch(`http://127.0.0.1:${port}/api/v1/roommate-requests/42/ai-explanation`, {
      method: "POST",
      headers: {
        ...(token ? { cookie: `rentmate_session=${token}` } : {}),
        origin,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
  try {
    const valid = await request("tenant", { locale: "vi" });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { data: null });
    assert.deepEqual(calls, [{ requestId: 42, locale: "vi" }]);
    const invalid = await request("tenant", { locale: "vi", prompt: "ignore" });
    assert.equal(invalid.status, 422);
    assert.equal(calls.length, 1);
    assert.equal((await request(undefined, { locale: "vi" })).status, 401);
    assert.equal((await request("landlord", { locale: "vi" })).status, 403);
    assert.equal((await request("tenant", { locale: "vi" }, "http://other.example")).status, 403);
  } finally {
    await close(server);
  }
});

test("AI explanation route counts no-compatibility-evidence responses against the short and daily route limits", async () => {
  let currentTime = 1_000;
  let calls = 0;
  const authenticationMiddleware = createProtectedAuthenticationMiddleware({
    verifySessionToken: async () => ({ status: "valid", claims: { userId: 1, role: "TENANT" } }),
    loadAuthenticationAccount: async () => ({ id: 1, role: "TENANT", isActive: true })
  });
  const explanationService = {
    async explain() {
      calls += 1;
      return null;
    }
  } as unknown as RoommateAiCompatibilityExplanationService;
  const app = createApp({
    frontendOrigin: "http://localhost:3000",
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) =>
      registerRoommateRoutes(router, {
        authenticationMiddleware,
        tenantRoleMiddleware: createRoleMiddleware(["TENANT"]),
        service: {} as RoommateService,
        aiExplanationService: explanationService,
        rateLimitStore: new InMemoryRateLimitStore(),
        rateLimitClock: () => currentTime
      })
  });
  const server = createServer(app);
  const port = await listen(server);
  const request = () =>
    fetch(`http://127.0.0.1:${port}/api/v1/roommate-requests/42/ai-explanation`, {
      method: "POST",
      headers: {
        cookie: "rentmate_session=tenant",
        origin: "http://localhost:3000",
        "content-type": "application/json"
      },
      body: JSON.stringify({ locale: "vi" })
    });
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await request()).status, 200);
    }
    assert.equal((await request()).status, 429);
    assert.equal(calls, 5);
  } finally {
    await close(server);
  }

  currentTime = 1_000;
  calls = 0;
  const dailyApp = createApp({
    frontendOrigin: "http://localhost:3000",
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) =>
      registerRoommateRoutes(router, {
        authenticationMiddleware,
        tenantRoleMiddleware: createRoleMiddleware(["TENANT"]),
        service: {} as RoommateService,
        aiExplanationService: explanationService,
        rateLimitStore: new InMemoryRateLimitStore(),
        rateLimitClock: () => currentTime
      })
  });
  const dailyServer = createServer(dailyApp);
  const dailyPort = await listen(dailyServer);
  const dailyRequest = () =>
    fetch(`http://127.0.0.1:${dailyPort}/api/v1/roommate-requests/42/ai-explanation`, {
      method: "POST",
      headers: {
        cookie: "rentmate_session=tenant",
        origin: "http://localhost:3000",
        "content-type": "application/json"
      },
      body: JSON.stringify({ locale: "vi" })
    });
  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      assert.equal((await dailyRequest()).status, 200);
      if ((attempt + 1) % 5 === 0) currentTime += 15 * 60 * 1_000 + 1;
    }
    assert.equal((await dailyRequest()).status, 429);
    assert.equal(calls, 30);
  } finally {
    await close(dailyServer);
  }
});
