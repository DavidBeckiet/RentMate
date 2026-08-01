import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import type { Logger } from "../src/shared/logging/logger.js";
import { InMemoryRateLimitStore, type RateLimitStore } from "../src/shared/middleware/rate-limit.js";
import type { LoginService } from "../src/modules/auth/login-service.js";
import { invalidCredentialsMessage } from "../src/modules/auth/login-service.js";
import type { RegistrationService } from "../src/modules/auth/registration-service.js";
import { registerAuthRoutes } from "../src/modules/auth/routes.js";
import { createSessionCookieService, type SessionCookieService } from "../src/modules/auth/session-cookie.js";
import { createSessionTokenService, type SessionTokenService } from "../src/modules/auth/session-token.js";

const origin = "http://localhost:3000";
const validBody = { email: "tenant@example.com", password: "input-password" };
const baseUser = Object.freeze({
  id: 51,
  role: "TENANT" as const,
  email: "tenant@example.com",
  phone: null,
  isActive: true,
  createdAt: new Date("2030-01-01T00:00:00.000Z"),
  updatedAt: new Date("2030-01-02T00:00:00.000Z")
});

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

interface HarnessOptions {
  readonly loginService?: LoginService;
  readonly registrationService?: RegistrationService;
  readonly tokenService?: SessionTokenService;
  readonly cookieService?: SessionCookieService;
  readonly store?: RateLimitStore;
  readonly clock?: () => number;
  readonly testIpHeader?: boolean;
}

function makeHarness(options: HarnessOptions = {}) {
  const loginService = options.loginService ?? { login: vi.fn().mockResolvedValue(baseUser) };
  const registrationService =
    options.registrationService ??
    ({ register: vi.fn().mockResolvedValue(baseUser) } as unknown as RegistrationService);
  const tokenService = options.tokenService ?? {
    sign: vi.fn().mockResolvedValue("session-token-sentinel"),
    verify: vi.fn()
  };
  const cookieService = options.cookieService ?? createSessionCookieService({ secure: false });

  const app = createApp({
    frontendOrigin: origin,
    logger: silentLogger,
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) => {
      if (options.testIpHeader) {
        router.use((incoming, _response, next) => {
          Object.defineProperty(incoming, "ip", {
            configurable: true,
            value: incoming.header("X-Test-Ip") ?? incoming.ip
          });
          next();
        });
      }

      registerAuthRoutes(router, {
        registrationService,
        loginService,
        sessionTokenService: tokenService,
        sessionCookieService: cookieService,
        registrationRateLimitStore: options.store,
        loginRateLimitClock: options.clock,
        registrationRateLimitClock: options.clock
      });
    }
  });

  return { app, loginService, registrationService, tokenService, cookieService };
}

function postLogin(app: ReturnType<typeof createApp>, body: string | object = validBody) {
  return request(app).post("/api/v1/auth/login").set("Origin", origin).send(body);
}

function safeErrorSignature(response: request.Response) {
  return {
    status: response.status,
    keys: Object.keys(response.body.error).sort(),
    code: response.body.error.code,
    message: response.body.error.message
  };
}

describe("RM-016 login HTTP contract", () => {
  it.each(["TENANT", "LANDLORD", "ADMIN"] as const)(
    "returns the exact active %s profile and session cookie",
    async (role) => {
      const user = { ...baseUser, role, email: `${role.toLowerCase()}@example.com` };
      const loginService = { login: vi.fn().mockResolvedValue(user) };
      const harness = makeHarness({ loginService });

      const response = await postLogin(harness.app, { ...validBody, email: user.email }).expect(200);

      expect(response.body).toStrictEqual({
        data: {
          id: 51,
          role,
          email: user.email,
          phone: null,
          isActive: true,
          createdAt: "2030-01-01T00:00:00.000Z",
          updatedAt: "2030-01-02T00:00:00.000Z"
        }
      });
      const setCookie = response.headers["set-cookie"][0] as string;
      expect(setCookie).toContain("rentmate_session=session-token-sentinel");
      expect(setCookie).toContain("Max-Age=7200");
      expect(setCookie).toContain("Path=/");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).not.toContain("Domain=");
      expect(setCookie).not.toContain("Secure");
      expect(harness.tokenService.sign).toHaveBeenCalledWith({ userId: 51, role });
      expect(JSON.stringify(response.body)).not.toMatch(/session-token-sentinel|password|hash/i);
    }
  );

  it("returns indistinguishable errors and no cookie for every credential failure", async () => {
    const loginService = {
      login: vi.fn().mockRejectedValue(new ApplicationError("INVALID_CREDENTIALS", invalidCredentialsMessage))
    };
    const harness = makeHarness({ loginService });
    const cases = [
      { email: "missing@example.com", password: "input-password" },
      { email: "tenant@example.com", password: "wrong-password" },
      { email: "inactive@example.com", password: "correct-password" },
      { email: "inactive@example.com", password: "wrong-password" }
    ];
    const responses: ReturnType<typeof safeErrorSignature>[] = [];

    for (const body of cases) {
      const response = await postLogin(harness.app, body).expect(401);
      expect(response.headers["set-cookie"]).toBeUndefined();
      responses.push(safeErrorSignature(response));
    }

    expect(responses.every((signature) => JSON.stringify(signature) === JSON.stringify(responses[0]))).toBe(true);
    expect(responses[0]).toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
      message: "The email or password is incorrect."
    });
  });

  it("rejects Origin, malformed JSON, and validation failures in the required order", async () => {
    const consume = vi.fn().mockReturnValue({ allowed: true });
    const login = vi.fn().mockResolvedValue(baseUser);
    const harness = makeHarness({ loginService: { login }, store: { consume } });

    await request(harness.app)
      .post("/api/v1/auth/login")
      .set("Origin", "http://untrusted.example")
      .send(validBody)
      .expect(403);
    expect(consume).not.toHaveBeenCalled();

    await request(harness.app)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .set("Content-Type", "application/json")
      .send("{bad-json")
      .expect(400);
    expect(consume).not.toHaveBeenCalled();

    await postLogin(harness.app, { email: "invalid", password: "short" }).expect(422);
    expect(consume).toHaveBeenCalledOnce();
    expect(login).not.toHaveBeenCalled();
  });

  it.each([
    ["null", "null"],
    ["string", '"body"'],
    ["number", "123"]
  ])("returns 422 for a syntactically valid top-level JSON %s", async (_label, encodedBody) => {
    const login = vi.fn().mockResolvedValue(baseUser);
    const harness = makeHarness({ loginService: { login } });
    const response = await request(harness.app)
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .set("Content-Type", "application/json")
      .send(encodedBody)
      .expect(422);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_FAILED",
      message: "The request contains invalid data.",
      details: [{ field: "body", code: "INVALID_TYPE", message: "body must be a JSON object." }]
    });
    expect(login).not.toHaveBeenCalled();
  });

  it("allows five login attempts, rejects the sixth before validation or downstream work", async () => {
    const login = vi.fn().mockResolvedValue(baseUser);
    const token = { sign: vi.fn().mockResolvedValue("session-token-sentinel"), verify: vi.fn() };
    const cookie = { set: vi.fn(), clear: vi.fn() };
    const harness = makeHarness({
      loginService: { login },
      tokenService: token,
      cookieService: cookie,
      store: new InMemoryRateLimitStore(),
      clock: () => 0
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await postLogin(harness.app).expect(200);
    }
    const limited = await postLogin(harness.app, { invalid: true }).expect(429);

    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(login).toHaveBeenCalledTimes(5);
    expect(token.sign).toHaveBeenCalledTimes(5);
    expect(cookie.set).toHaveBeenCalledTimes(5);
    expect(cookie.clear).not.toHaveBeenCalled();
  });

  it("isolates login and registration scopes while keeping independent IP buckets", async () => {
    const store = new InMemoryRateLimitStore();
    const harness = makeHarness({ store, clock: () => 0, testIpHeader: true });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await postLogin(harness.app).set("X-Test-Ip", "192.0.2.10").expect(200);
    }
    await postLogin(harness.app).set("X-Test-Ip", "192.0.2.10").expect(429);
    await postLogin(harness.app).set("X-Test-Ip", "192.0.2.11").expect(200);
    await request(harness.app)
      .post("/api/v1/auth/register/tenant")
      .set("Origin", origin)
      .set("X-Test-Ip", "192.0.2.10")
      .send({ email: "new@example.com", password: "input-password", phone: null })
      .expect(201);

    expect(harness.registrationService.register).toHaveBeenCalledOnce();
  });

  it("sanitizes signer and cookie failures without setting a cookie early", async () => {
    const cookie = { set: vi.fn(), clear: vi.fn() };
    const signing = makeHarness({
      tokenService: { sign: vi.fn().mockRejectedValue(new Error("signing failure sentinel")), verify: vi.fn() },
      cookieService: cookie
    });
    const signingResponse = await postLogin(signing.app).expect(500);
    expect(signingResponse.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(signingResponse.body)).not.toContain("signing failure sentinel");
    expect(cookie.set).not.toHaveBeenCalled();

    const cookieFailure = makeHarness({
      cookieService: {
        set: vi.fn(() => {
          throw new Error("cookie failure sentinel");
        }),
        clear: vi.fn()
      }
    });
    const cookieResponse = await postLogin(cookieFailure.app).expect(500);
    expect(cookieResponse.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(cookieResponse.body)).not.toContain("cookie failure sentinel");
  });

  it("signs every success and replaces the cookie when the injected token clock advances", async () => {
    let now = 1_900_000_000;
    const realTokenService = createSessionTokenService({ secret: "t".repeat(64), nowSeconds: () => now });
    const tokenService = {
      sign: vi.fn((principal) => realTokenService.sign(principal)),
      verify: realTokenService.verify
    };
    const harness = makeHarness({ tokenService });

    const first = await postLogin(harness.app).expect(200);
    now += 1;
    const second = await postLogin(harness.app).expect(200);

    expect(tokenService.sign).toHaveBeenCalledTimes(2);
    expect(first.headers["set-cookie"][0]).not.toBe(second.headers["set-cookie"][0]);
    expect(first.body).toStrictEqual(second.body);
  });
});
