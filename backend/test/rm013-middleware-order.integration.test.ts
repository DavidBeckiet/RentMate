import type { RequestHandler, Router } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { ApplicationError, createValidationError } from "../src/shared/errors/application-error.js";
import { sendObject } from "../src/shared/http/responses.js";
import type { Logger } from "../src/shared/logging/logger.js";
import {
  createOptionalAuthenticationMiddleware,
  createProtectedAuthenticationMiddleware,
  type AuthenticationMiddlewareDependencies
} from "../src/shared/middleware/authentication.js";
import { createRateLimitMiddleware } from "../src/shared/middleware/rate-limit.js";
import { createRoleMiddleware } from "../src/shared/middleware/role.js";
import type { AuthenticationAccount, UserRole } from "../src/shared/types/authentication.js";
import { validateBodyFields } from "../src/shared/validation/request.js";

const frontendOrigin = "http://localhost:3000";
const sessionCookie = "rentmate_session=fake-rm013-session";

type AuthenticationScenario = "invalid" | "inactive" | "tenant" | "landlord" | "admin" | "infrastructure-failure";

function createLoggerMock() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } satisfies Logger;
}

function roleForScenario(scenario: AuthenticationScenario): UserRole {
  if (scenario === "tenant") {
    return "TENANT";
  }
  if (scenario === "admin") {
    return "ADMIN";
  }
  return "LANDLORD";
}

function createAuthenticationDependencies(
  scenario: AuthenticationScenario,
  events: string[]
): AuthenticationMiddlewareDependencies {
  const role = roleForScenario(scenario);

  return {
    verifySessionToken: vi.fn(async () => {
      events.push("protected-authentication");
      if (scenario === "infrastructure-failure") {
        throw new Error("private verifier failure");
      }
      if (scenario === "invalid") {
        return { status: "invalid" as const };
      }
      return { status: "valid" as const, claims: { userId: 13, role } };
    }),
    loadAuthenticationAccount: vi.fn(async () => {
      events.push("current-account-check");
      return {
        id: 13,
        role,
        isActive: scenario !== "inactive"
      } satisfies AuthenticationAccount;
    })
  };
}

function recordEvent(events: string[], event: string): RequestHandler {
  return (_incomingRequest, _response, next): void => {
    events.push(event);
    next();
  };
}

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly events: string[];
  readonly logger: ReturnType<typeof createLoggerMock>;
  readonly authentication: AuthenticationMiddlewareDependencies;
}

function registerProtectedRoute(
  router: Router,
  events: string[],
  authentication: AuthenticationMiddlewareDependencies
): void {
  const userRateLimit = createRateLimitMiddleware({
    policy: { scope: "rm013-protected", limit: 100, windowMs: 60_000 },
    resolveKey: (incomingRequest) => {
      events.push("user-rate-limit");
      if (!incomingRequest.auth) {
        throw new Error("Authenticated principal is required for the synthetic user limiter.");
      }
      return String(incomingRequest.auth.userId);
    }
  });

  router.post(
    "/synthetic/protected",
    createProtectedAuthenticationMiddleware(authentication),
    createRoleMiddleware(["LANDLORD"]),
    recordEvent(events, "role-enforcement"),
    userRateLimit,
    (incomingRequest, _response, next): void => {
      events.push("request-validation");
      const body = validateBodyFields(incomingRequest.body, ["mode"]);
      if (body.mode === "validation-failure") {
        next(
          createValidationError([
            { field: "mode", code: "INVALID_VALUE", message: "mode is invalid for this synthetic request." }
          ])
        );
        return;
      }
      next();
    },
    (incomingRequest, _response, next): void => {
      events.push("resource-lookup");
      const mode = (incomingRequest.body as { mode?: unknown }).mode;
      if (mode === "missing" || mode === "unauthorized") {
        next(new ApplicationError("RESOURCE_NOT_FOUND", "The requested synthetic resource was not found."));
        return;
      }
      next();
    },
    recordEvent(events, "ownership-lifecycle-policy"),
    (incomingRequest, response, next): void => {
      events.push("service-handler");
      const mode = (incomingRequest.body as { mode?: unknown }).mode;
      if (mode === "unexpected-failure") {
        next(new Error("private RM-013 service failure"));
        return;
      }

      events.push("api-mapper");
      const dto = Object.freeze({ id: 13, outcome: "synthetic-success" as const });
      events.push("success-envelope");
      sendObject(response, dto);
    }
  );
}

function registerPublicRoute(
  router: Router,
  events: string[],
  authentication: AuthenticationMiddlewareDependencies
): void {
  router.get(
    "/synthetic/public-detail",
    recordEvent(events, "optional-authentication-start"),
    createOptionalAuthenticationMiddleware(authentication),
    (incomingRequest, response): void => {
      events.push("projection-selection");
      const publicApplicationProjection = Object.freeze({ id: 13, title: "Synthetic public detail" });

      if (incomingRequest.auth?.role === "TENANT") {
        const tenantApplicationProjection = Object.freeze({
          id: publicApplicationProjection.id,
          title: publicApplicationProjection.title,
          contactPhone: "+84900000000"
        });
        events.push("tenant-enriched-mapper");
        const dto = Object.freeze({
          id: tenantApplicationProjection.id,
          title: tenantApplicationProjection.title,
          contactPhone: tenantApplicationProjection.contactPhone
        });
        events.push("success-envelope");
        sendObject(response, dto);
        return;
      }

      events.push("public-mapper");
      const dto = Object.freeze({
        id: publicApplicationProjection.id,
        title: publicApplicationProjection.title
      });
      events.push("success-envelope");
      sendObject(response, dto);
    }
  );
}

function createProtectedHarness(scenario: AuthenticationScenario): Harness {
  const events: string[] = [];
  const logger = createLoggerMock();
  const authentication = createAuthenticationDependencies(scenario, events);
  const app = createApp({
    frontendOrigin,
    logger,
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) => registerProtectedRoute(router, events, authentication)
  });

  return { app, events, logger, authentication };
}

function createPublicHarness(scenario: AuthenticationScenario): Harness {
  const events: string[] = [];
  const logger = createLoggerMock();
  const authentication = createAuthenticationDependencies(scenario, events);
  const app = createApp({
    frontendOrigin,
    logger,
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) => registerPublicRoute(router, events, authentication)
  });

  return { app, events, logger, authentication };
}

function expectRequestId(response: request.Response): void {
  expect((response.body as { error: { requestId: string } }).error.requestId).toMatch(/^req_[a-f0-9]{32}$/);
}

async function flushResponseLogging(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("RM-013 unsafe protected middleware order", () => {
  it("executes the complete valid route in the frozen relative order", async () => {
    const harness = createProtectedHarness("landlord");
    const response = await request(harness.app)
      .post("/api/v1/synthetic/protected")
      .set("Origin", frontendOrigin)
      .set("Cookie", sessionCookie)
      .send({});
    await flushResponseLogging();

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({ data: { id: 13, outcome: "synthetic-success" } });
    expect(response.headers["access-control-allow-origin"]).toBe(frontendOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(harness.events).toStrictEqual([
      "protected-authentication",
      "current-account-check",
      "role-enforcement",
      "user-rate-limit",
      "request-validation",
      "resource-lookup",
      "ownership-lifecycle-policy",
      "service-handler",
      "api-mapper",
      "success-envelope"
    ]);
    expect(harness.authentication.verifySessionToken).toHaveBeenCalledWith("fake-rm013-session");
    expect(harness.logger.info).toHaveBeenCalledWith(
      "HTTP request completed",
      expect.objectContaining({ method: "POST", status: 200 })
    );
  });

  it("rejects an invalid Origin before authentication or route work", async () => {
    const harness = createProtectedHarness("landlord");
    const response = await request(harness.app)
      .post("/api/v1/synthetic/protected")
      .set("Origin", "https://not-allowed.example.invalid")
      .set("Cookie", sessionCookie)
      .send({});

    expect(response.status).toBe(403);
    expectRequestId(response);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(harness.events).toStrictEqual([]);
  });

  it("gives Origin rejection precedence over malformed JSON", async () => {
    const harness = createProtectedHarness("landlord");
    const response = await request(harness.app)
      .post("/api/v1/synthetic/protected")
      .set("Origin", "https://not-allowed.example.invalid")
      .set("Content-Type", "application/json")
      .send('{"mode":');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(harness.events).toStrictEqual([]);
  });

  it("rejects malformed JSON before route authentication", async () => {
    const harness = createProtectedHarness("landlord");
    const response = await request(harness.app)
      .post("/api/v1/synthetic/protected")
      .set("Origin", frontendOrigin)
      .set("Content-Type", "application/json")
      .send('{"mode":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("MALFORMED_REQUEST");
    expectRequestId(response);
    expect(harness.events).toStrictEqual([]);
  });

  it("rejects missing authentication before role and resource lookup", async () => {
    const harness = createProtectedHarness("landlord");
    const response = await request(harness.app)
      .post("/api/v1/synthetic/protected")
      .set("Origin", frontendOrigin)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expectRequestId(response);
    expect(harness.events).toStrictEqual([]);
  });

  it.each([
    ["invalid", ["protected-authentication"]],
    ["inactive", ["protected-authentication", "current-account-check"]]
  ] as const)("rejects %s authentication before role and lookup", async (scenario, expectedEvents) => {
    const harness = createProtectedHarness(scenario);
    const response = await request(harness.app)
      .post("/api/v1/synthetic/protected")
      .set("Origin", frontendOrigin)
      .set("Cookie", sessionCookie)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(harness.events).toStrictEqual(expectedEvents);
  });

  it("rejects the wrong role before the user limiter and resource lookup", async () => {
    const harness = createProtectedHarness("tenant");
    const response = await request(harness.app)
      .post("/api/v1/synthetic/protected")
      .set("Origin", frontendOrigin)
      .set("Cookie", sessionCookie)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(harness.events).toStrictEqual(["protected-authentication", "current-account-check"]);
  });

  it("rejects validation before resource lookup", async () => {
    const harness = createProtectedHarness("landlord");
    const response = await request(harness.app)
      .post("/api/v1/synthetic/protected")
      .set("Origin", frontendOrigin)
      .set("Cookie", sessionCookie)
      .send({ mode: "validation-failure" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(harness.events).toStrictEqual([
      "protected-authentication",
      "current-account-check",
      "role-enforcement",
      "user-rate-limit",
      "request-validation"
    ]);
  });

  it.each(["missing", "unauthorized"])(
    "uses the same sanitized 404 for a %s resource before policy and mapping",
    async (mode) => {
      const harness = createProtectedHarness("landlord");
      const response = await request(harness.app)
        .post("/api/v1/synthetic/protected")
        .set("Origin", frontendOrigin)
        .set("Cookie", sessionCookie)
        .send({ mode });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("RESOURCE_NOT_FOUND");
      expect(response.text).not.toContain(mode);
      expect(harness.events).toStrictEqual([
        "protected-authentication",
        "current-account-check",
        "role-enforcement",
        "user-rate-limit",
        "request-validation",
        "resource-lookup"
      ]);
    }
  );

  it("sanitizes an unexpected failure without running mapping or double-sending", async () => {
    const harness = createProtectedHarness("landlord");
    const response = await request(harness.app)
      .post("/api/v1/synthetic/protected")
      .set("Origin", frontendOrigin)
      .set("Cookie", sessionCookie)
      .send({ mode: "unexpected-failure" });
    await flushResponseLogging();

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expectRequestId(response);
    expect(response.text).not.toContain("private RM-013 service failure");
    expect(harness.events).not.toContain("api-mapper");
    expect(harness.events).not.toContain("success-envelope");
    expect(harness.logger.error).toHaveBeenCalledOnce();
    expect(harness.logger.info.mock.calls.filter(([message]) => message === "HTTP request completed")).toHaveLength(1);
  });
});

describe("RM-013 public optional-auth projection order", () => {
  it.each([
    ["missing cookie", "landlord", false, ["optional-authentication-start"]],
    ["invalid token", "invalid", true, ["optional-authentication-start", "protected-authentication"]],
    [
      "inactive account",
      "inactive",
      true,
      ["optional-authentication-start", "protected-authentication", "current-account-check"]
    ],
    [
      "active landlord",
      "landlord",
      true,
      ["optional-authentication-start", "protected-authentication", "current-account-check"]
    ],
    [
      "active admin",
      "admin",
      true,
      ["optional-authentication-start", "protected-authentication", "current-account-check"]
    ]
  ] as const)("uses only the public projection for %s", async (_label, scenario, includeCookie, prefixEvents) => {
    const harness = createPublicHarness(scenario);
    const pending = request(harness.app).get("/api/v1/synthetic/public-detail");
    const response = await (includeCookie ? pending.set("Cookie", sessionCookie) : pending);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({ data: { id: 13, title: "Synthetic public detail" } });
    expect(response.text).not.toMatch(/contact|provider|password|owner/i);
    expect(harness.events).toStrictEqual([
      ...prefixEvents,
      "projection-selection",
      "public-mapper",
      "success-envelope"
    ]);
  });

  it("uses the enriched projection only for a valid active tenant", async () => {
    const harness = createPublicHarness("tenant");
    const response = await request(harness.app).get("/api/v1/synthetic/public-detail").set("Cookie", sessionCookie);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      data: { id: 13, title: "Synthetic public detail", contactPhone: "+84900000000" }
    });
    expect(harness.events).toStrictEqual([
      "optional-authentication-start",
      "protected-authentication",
      "current-account-check",
      "projection-selection",
      "tenant-enriched-mapper",
      "success-envelope"
    ]);
  });

  it("passes optional-auth infrastructure failure to the centralized handler", async () => {
    const harness = createPublicHarness("infrastructure-failure");
    const response = await request(harness.app).get("/api/v1/synthetic/public-detail").set("Cookie", sessionCookie);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expectRequestId(response);
    expect(response.text).not.toContain("private verifier failure");
    expect(harness.events).toStrictEqual(["optional-authentication-start", "protected-authentication"]);
  });
});
