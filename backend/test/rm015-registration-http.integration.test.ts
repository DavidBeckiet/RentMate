import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import { InMemoryRateLimitStore, type RateLimitStore } from "../src/shared/middleware/rate-limit.js";
import { createSessionCookieService, type SessionCookieService } from "../src/modules/auth/session-cookie.js";
import { registerAuthRoutes } from "../src/modules/auth/routes.js";
import type { RegistrationService } from "../src/modules/auth/registration-service.js";
import type { SessionTokenService } from "../src/modules/auth/session-token.js";
import type { Logger } from "../src/shared/logging/logger.js";

const origin = "http://localhost:3000";
const validTenantBody = { email: "tenant@example.com", password: "plain-password", phone: "+84901234567" };
const validLandlordBody = { email: "landlord@example.com", password: "plain-password", phone: "+84901234567" };
const registeredUser = Object.freeze({
  id: 7,
  role: "TENANT" as const,
  email: "tenant@example.com",
  phone: "+84901234567",
  isActive: true,
  createdAt: new Date("2030-01-01T00:00:00.000Z"),
  updatedAt: new Date("2030-01-01T00:00:00.000Z")
});

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function makeHarness(
  options: {
    readonly service?: RegistrationService;
    readonly token?: SessionTokenService;
    readonly cookie?: SessionCookieService;
    readonly store?: RateLimitStore;
    readonly clock?: () => number;
  } = {}
) {
  const service = options.service ?? {
    register: vi.fn().mockImplementation(async (role) => Object.freeze({ ...registeredUser, role }))
  };
  const token = options.token ?? {
    sign: vi.fn().mockResolvedValue("fake-rm015-token"),
    verify: vi.fn()
  };
  const cookie = options.cookie ?? createSessionCookieService({ secure: false });

  const app = createApp({
    frontendOrigin: origin,
    logger: silentLogger,
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) =>
      registerAuthRoutes(router, {
        registrationService: service,
        sessionTokenService: token,
        sessionCookieService: cookie,
        registrationRateLimitStore: options.store,
        registrationRateLimitClock: options.clock
      })
  });

  return { app, service, token, cookie };
}

function post(app: ReturnType<typeof createApp>, route: string, body: string | object) {
  return request(app).post(route).set("Origin", origin).send(body);
}

describe("RM-015 registration HTTP contract", () => {
  it("registers tenant and landlord through the exact routes with a safe DTO and cookie", async () => {
    const tenant = makeHarness();
    const tenantResponse = await post(tenant.app, "/api/v1/auth/register/tenant", validTenantBody).expect(201);
    expect(tenantResponse.body).toStrictEqual({
      data: {
        id: 7,
        role: "TENANT",
        email: "tenant@example.com",
        phone: "+84901234567",
        isActive: true,
        createdAt: "2030-01-01T00:00:00.000Z",
        updatedAt: "2030-01-01T00:00:00.000Z"
      }
    });
    expect(tenantResponse.headers["set-cookie"][0]).toMatch(/rentmate_session=fake-rm015-token/);
    expect(tenantResponse.headers["set-cookie"][0]).toMatch(/HttpOnly/);
    expect(tenantResponse.headers["set-cookie"][0]).toMatch(/SameSite=Lax/);
    expect(JSON.stringify(tenantResponse.body)).not.toContain("fake-rm015-token");
    expect(JSON.stringify(tenantResponse.body)).not.toContain("plain-password");
    expect(tenant.token.sign).toHaveBeenCalledWith({ userId: 7, role: "TENANT" });

    const landlordService = {
      register: vi.fn().mockResolvedValue({ ...registeredUser, role: "LANDLORD", phone: "+84901234567" })
    };
    const landlord = makeHarness({ service: landlordService });
    await post(landlord.app, "/api/v1/auth/register/landlord", validLandlordBody).expect(201);
    expect(landlordService.register).toHaveBeenCalledWith(
      "LANDLORD",
      expect.objectContaining({ email: "landlord@example.com", phone: "+84901234567" })
    );
  });

  it("runs the limiter before validation and shares one bucket across both registration routes", async () => {
    const store = new InMemoryRateLimitStore();
    const harness = makeHarness({ store, clock: () => 0 });

    for (let index = 0; index < 5; index += 1) {
      const route = index % 2 === 0 ? "/api/v1/auth/register/tenant" : "/api/v1/auth/register/landlord";
      await post(harness.app, route, index % 2 === 0 ? validTenantBody : validLandlordBody).expect(201);
    }
    const limited = await post(harness.app, "/api/v1/auth/register/tenant", { invalid: true }).expect(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(harness.service.register).toHaveBeenCalledTimes(5);
  });

  it("does not consume a rate-limit slot for a rejected origin or malformed JSON", async () => {
    const consume = vi.fn().mockReturnValue({ allowed: true });
    const harness = makeHarness({ store: { consume } });

    await request(harness.app)
      .post("/api/v1/auth/register/tenant")
      .set("Origin", "http://evil.example")
      .send(validTenantBody)
      .expect(403);
    expect(consume).not.toHaveBeenCalled();

    await request(harness.app)
      .post("/api/v1/auth/register/tenant")
      .set("Origin", origin)
      .set("Content-Type", "application/json")
      .send("{bad-json")
      .expect(400);
    expect(consume).not.toHaveBeenCalled();
    expect(harness.service.register).not.toHaveBeenCalled();
  });

  it("returns validation and duplicate errors without signing or setting a cookie", async () => {
    const token = { sign: vi.fn().mockResolvedValue("token"), verify: vi.fn() };
    const cookie = { set: vi.fn(), clear: vi.fn() };
    const service = {
      register: vi
        .fn()
        .mockRejectedValue(new ApplicationError("EMAIL_ALREADY_EXISTS", "An account with this email already exists."))
    };
    const harness = makeHarness({ service, token, cookie });

    await post(harness.app, "/api/v1/auth/register/tenant", { email: "bad", password: "short", phone: "+1" }).expect(
      422
    );
    expect(service.register).not.toHaveBeenCalled();
    expect(token.sign).not.toHaveBeenCalled();
    expect(cookie.set).not.toHaveBeenCalled();

    await post(harness.app, "/api/v1/auth/register/tenant", validTenantBody).expect(409);
    expect(token.sign).not.toHaveBeenCalled();
    expect(cookie.set).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected service, token, and cookie failures", async () => {
    const serviceFailure = makeHarness({
      service: { register: vi.fn().mockRejectedValue(new Error("database secret")) },
      token: { sign: vi.fn(), verify: vi.fn() },
      cookie: { set: vi.fn(), clear: vi.fn() }
    });
    const serviceResponse = await post(serviceFailure.app, "/api/v1/auth/register/tenant", validTenantBody).expect(500);
    expect(serviceResponse.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(serviceResponse.body)).not.toContain("database secret");

    const tokenFailure = makeHarness({
      token: { sign: vi.fn().mockRejectedValue(new Error("jwt secret")), verify: vi.fn() },
      cookie: { set: vi.fn(), clear: vi.fn() }
    });
    await post(tokenFailure.app, "/api/v1/auth/register/tenant", validTenantBody).expect(500);
    expect(tokenFailure.cookie.set).not.toHaveBeenCalled();

    const cookieFailure = makeHarness({
      token: { sign: vi.fn().mockResolvedValue("token"), verify: vi.fn() },
      cookie: {
        set: vi.fn(() => {
          throw new Error("cookie secret");
        }),
        clear: vi.fn()
      }
    });
    await post(cookieFailure.app, "/api/v1/auth/register/tenant", validTenantBody).expect(500);
  });

  it("does not create aliases for later authentication or account endpoints", async () => {
    const { app } = makeHarness();
    for (const route of [
      "/api/v1/auth/login",
      "/api/v1/auth/logout",
      "/api/v1/users/me",
      "/api/v1/auth/register/admin"
    ]) {
      await request(app).post(route).set("Origin", origin).send({}).expect(404);
    }
  });
});
