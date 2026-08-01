import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { RateLimitStore } from "../src/shared/middleware/rate-limit.js";
import { registerAuthRoutes } from "../src/modules/auth/routes.js";
import { createSessionCookieService, type SessionCookieService } from "../src/modules/auth/session-cookie.js";

const origin = "http://localhost:3000";
const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function makeHarness(options: { readonly cookie?: SessionCookieService; readonly store?: RateLimitStore } = {}) {
  const cookie = options.cookie ?? createSessionCookieService({ secure: false });
  const login = vi.fn();
  const register = vi.fn();
  const sign = vi.fn();
  const verify = vi.fn();

  const app = createApp({
    frontendOrigin: origin,
    logger: silentLogger,
    checkDatabaseConnection: async () => undefined,
    registerApiRoutes: (router) =>
      registerAuthRoutes(router, {
        registrationService: { register },
        loginService: { login },
        sessionTokenService: { sign, verify },
        sessionCookieService: cookie,
        registrationRateLimitStore: options.store
      })
  });

  return { app, cookie, login, register, sign, verify };
}

function logout(app: ReturnType<typeof createApp>) {
  return request(app).post("/api/v1/auth/logout").set("Origin", origin);
}

describe("RM-016 logout HTTP contract", () => {
  it.each([
    ["no cookie", undefined],
    ["valid-looking cookie", "rentmate_session=valid-looking-value"],
    ["malformed cookie", "rentmate_session=malformed.value"],
    ["expired cookie", "rentmate_session=expired-value"],
    ["unsupported token", "rentmate_session=unsupported-value"]
  ])("clears %s identically and returns an empty 204", async (_label, cookieHeader) => {
    const harness = makeHarness();
    let operation = logout(harness.app);
    if (cookieHeader) {
      operation = operation.set("Cookie", cookieHeader);
    }

    const response = await operation.expect(204);
    const clearHeader = response.headers["set-cookie"][0] as string;
    expect(clearHeader).toContain("rentmate_session=");
    expect(clearHeader).toContain("Path=/");
    expect(clearHeader).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(clearHeader).toContain("HttpOnly");
    expect(clearHeader).toContain("SameSite=Lax");
    expect(clearHeader).not.toContain("Domain=");
    expect(clearHeader).not.toContain("Secure");
    expect(response.text).toBe("");
    expect(response.body).toStrictEqual({});
    expect(harness.verify).not.toHaveBeenCalled();
    expect(harness.login).not.toHaveBeenCalled();
    expect(harness.register).not.toHaveBeenCalled();
    expect(harness.sign).not.toHaveBeenCalled();
  });

  it("keeps repeated logout idempotent", async () => {
    const harness = makeHarness();
    await logout(harness.app).expect(204);
    await logout(harness.app).expect(204);
  });

  it("uses the matching production Secure clear attributes when configured", async () => {
    const harness = makeHarness({ cookie: createSessionCookieService({ secure: true }) });
    const response = await logout(harness.app).expect(204);

    expect(response.headers["set-cookie"][0]).toContain("Secure");
  });

  it("does not rate limit logout", async () => {
    const consume = vi.fn().mockReturnValue({ allowed: false });
    const harness = makeHarness({ store: { consume } });

    await logout(harness.app).expect(204);
    expect(consume).not.toHaveBeenCalled();
  });

  it("rejects an invalid Origin before clearing", async () => {
    const cookie = { set: vi.fn(), clear: vi.fn() };
    const harness = makeHarness({ cookie });

    await request(harness.app).post("/api/v1/auth/logout").set("Origin", "http://untrusted.example").expect(403);
    expect(cookie.clear).not.toHaveBeenCalled();
  });

  it.each([
    ["empty object", "{}"],
    ["null", "null"],
    ["array", "[]"],
    ["string", '"body"'],
    ["number", "1"],
    ["nonempty object", '{"field":true}']
  ])("rejects parsed %s bodies without clearing", async (_label, encodedBody) => {
    const cookie = { set: vi.fn(), clear: vi.fn() };
    const harness = makeHarness({ cookie });
    const response = await logout(harness.app).set("Content-Type", "application/json").send(encodedBody).expect(422);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_FAILED",
      message: "The request contains invalid data.",
      details: [{ field: "body", code: "INVALID_VALUE", message: "body must be omitted." }]
    });
    expect(cookie.clear).not.toHaveBeenCalled();
  });

  it("leaves malformed JSON to the global 400 handler without clearing", async () => {
    const cookie = { set: vi.fn(), clear: vi.fn() };
    const harness = makeHarness({ cookie });
    const response = await logout(harness.app).set("Content-Type", "application/json").send("{bad-json").expect(400);

    expect(response.body.error.code).toBe("MALFORMED_REQUEST");
    expect(cookie.clear).not.toHaveBeenCalled();
  });
});
