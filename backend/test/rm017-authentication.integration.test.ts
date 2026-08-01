import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  createProtectedAuthenticationMiddleware,
  type AuthenticationMiddlewareDependencies
} from "../src/shared/middleware/authentication.js";
import { cookieParserMiddleware } from "../src/shared/middleware/cookie-parser.js";
import { unexpectedErrorHandler } from "../src/shared/middleware/error-handler.js";
import { requestIdMiddleware } from "../src/shared/middleware/request-id.js";
import type {
  AuthenticationAccount,
  SessionVerificationResult,
  VerifiedSessionClaims
} from "../src/shared/types/authentication.js";
import type { Logger } from "../src/shared/logging/logger.js";

const sessionToken = "rm017-session-token";
const claims: VerifiedSessionClaims = { userId: 17, role: "TENANT" };

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function makeApp(
  options: {
    readonly verification?: SessionVerificationResult;
    readonly account?: AuthenticationAccount | null;
    readonly verify?: AuthenticationMiddlewareDependencies["verifySessionToken"];
    readonly load?: AuthenticationMiddlewareDependencies["loadAuthenticationAccount"];
  } = {}
) {
  const verify = options.verify ?? vi.fn(async () => options.verification ?? ({ status: "valid", claims } as const));
  const load =
    options.load ??
    vi.fn(async () =>
      options.account !== undefined ? options.account : { id: 17, role: claims.role, isActive: true }
    );
  const app = express();
  app.use(requestIdMiddleware);
  app.use(cookieParserMiddleware);
  app.use(createProtectedAuthenticationMiddleware({ verifySessionToken: verify, loadAuthenticationAccount: load }));
  app.get("/probe", (incomingRequest, response) => {
    response.status(200).json({
      auth: incomingRequest.auth,
      authKeys: incomingRequest.auth ? Object.keys(incomingRequest.auth).sort() : []
    });
  });
  app.use(unexpectedErrorHandler(logger));
  return { app, verify, load };
}

describe("RM-017 required authentication integration", () => {
  it.each(["TENANT", "LANDLORD", "ADMIN"] as const)("attaches only an active %s principal", async (role) => {
    const roleClaims = { userId: 17, role } satisfies VerifiedSessionClaims;
    const account = { id: 17, role, isActive: true } satisfies AuthenticationAccount;
    const harness = makeApp({
      verification: { status: "valid", claims: roleClaims },
      account
    });

    const response = await request(harness.app).get("/probe").set("Cookie", `rentmate_session=${sessionToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({ auth: { userId: 17, role }, authKeys: ["role", "userId"] });
    expect(harness.verify).toHaveBeenCalledWith(sessionToken);
    expect(harness.load).toHaveBeenCalledWith(17);
  });

  it("returns 401 for a missing cookie before verification", async () => {
    const harness = makeApp();

    const response = await request(harness.app).get("/probe");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(harness.verify).not.toHaveBeenCalled();
    expect(harness.load).not.toHaveBeenCalled();
  });

  it.each(["invalid token", "expired token"] as const)("returns 401 for an %s", async () => {
    const harness = makeApp({ verification: { status: "invalid" } });

    const response = await request(harness.app).get("/probe").set("Cookie", `rentmate_session=${sessionToken}`);

    expect(response.status).toBe(401);
    expect(harness.load).not.toHaveBeenCalled();
  });

  it.each([
    ["missing account", null],
    ["inactive account", { id: 17, role: "TENANT", isActive: false }],
    ["ID mismatch", { id: 18, role: "TENANT", isActive: true }],
    ["role mismatch", { id: 17, role: "LANDLORD", isActive: true }]
  ] as const)("returns 401 for %s", async (_label, account) => {
    const harness = makeApp({ account });

    const response = await request(harness.app).get("/probe").set("Cookie", `rentmate_session=${sessionToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("loads the account only from verified userId and exposes no profile fields", async () => {
    const load = vi.fn(async (userId: number) => ({ id: userId, role: "TENANT" as const, isActive: true }));
    const verify = vi.fn(async () => ({
      status: "valid" as const,
      claims: { userId: 17, role: "TENANT", email: "untrusted@example.com", phone: "+84901234567" }
    }));
    const harness = makeApp({ verify, load });

    const response = await request(harness.app).get("/probe").set("Cookie", `rentmate_session=${sessionToken}`);

    expect(response.status).toBe(200);
    expect(load).toHaveBeenCalledWith(17);
    expect(response.body.auth).toStrictEqual({ userId: 17, role: "TENANT" });
    expect(response.text).not.toMatch(/untrusted|password|hash|phone/);
  });

  it.each(["verifier", "account loader"] as const)("sanitizes %s infrastructure failures", async (source) => {
    const failure = new Error(`private ${source} details`);
    const harness =
      source === "verifier"
        ? makeApp({ verify: vi.fn(async () => Promise.reject(failure)) })
        : makeApp({ load: vi.fn(async () => Promise.reject(failure)) });

    const response = await request(harness.app).get("/probe").set("Cookie", `rentmate_session=${sessionToken}`);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(response.text).not.toContain(failure.message);
  });
});
