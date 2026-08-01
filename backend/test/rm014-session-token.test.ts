import express from "express";
import { SignJWT, decodeJwt, decodeProtectedHeader, type JWTPayload } from "jose";
import request from "supertest";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import type { Logger } from "../src/shared/logging/logger.js";
import {
  createOptionalAuthenticationMiddleware,
  createProtectedAuthenticationMiddleware
} from "../src/shared/middleware/authentication.js";
import { cookieParserMiddleware } from "../src/shared/middleware/cookie-parser.js";
import { unexpectedErrorHandler } from "../src/shared/middleware/error-handler.js";
import { requestIdMiddleware } from "../src/shared/middleware/request-id.js";
import type { VerifySessionToken } from "../src/shared/types/authentication.js";

const fixedNow = 2_000_000_000;
const primarySecret = "fake-rm014-session-secret-for-tests-only";
const otherSecret = "fake-rm014-other-secret-for-tests-only";
const encoder = new TextEncoder();

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function validPayload(overrides: JWTPayload = {}): JWTPayload {
  return {
    sub: "42",
    role: "TENANT",
    iat: fixedNow,
    exp: fixedNow + 7_200,
    ...overrides
  };
}

async function signFixture(
  payload: JWTPayload,
  options: { readonly secret?: string; readonly algorithm?: "HS256" | "HS384" } = {}
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: options.algorithm ?? "HS256" })
    .sign(encoder.encode(options.secret ?? primarySecret));
}

describe("RM-014 session token factory and signing", () => {
  it("rejects invalid secrets and clocks during construction", () => {
    expect(() => createSessionTokenService({ secret: "" })).toThrowError("nonblank string");
    expect(() => createSessionTokenService({ secret: "   " })).toThrowError("nonblank string");
    expect(() => createSessionTokenService({ secret: primarySecret, nowSeconds: () => Number.NaN })).toThrowError(
      "safe integer epoch second"
    );
    expect(() =>
      createSessionTokenService({ secret: primarySecret, nowSeconds: "clock" as unknown as () => number })
    ).toThrowError("must be a function");
  });

  it.each(["TENANT", "LANDLORD", "ADMIN"] as const)("round-trips a minimal %s token", async (role) => {
    const service = createSessionTokenService({ secret: primarySecret, nowSeconds: () => fixedNow });
    const token = await service.sign({ userId: 42, role });
    const payload = decodeJwt(token);
    const result = await service.verify(token);

    expect(decodeProtectedHeader(token)).toStrictEqual({ alg: "HS256" });
    expect(Object.keys(payload).sort()).toStrictEqual(["exp", "iat", "role", "sub"]);
    expect(payload).toStrictEqual({
      role,
      sub: "42",
      iat: fixedNow,
      exp: fixedNow + 7_200
    });
    expect(payload.exp! - payload.iat!).toBe(7_200);
    expect(JSON.stringify(payload)).not.toMatch(/email|phone|active|permission|password|hash|cookie|issuer|aud|jti/i);
    expect(result).toStrictEqual({ status: "valid", claims: { userId: 42, role } });
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(Object.isFrozen(result.claims)).toBe(true);
    }
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([1, 2_147_483_647])("supports signed 32-bit user ID boundary %i", async (userId) => {
    const service = createSessionTokenService({ secret: primarySecret, nowSeconds: () => fixedNow });
    const token = await service.sign({ userId, role: "TENANT" });

    await expect(service.verify(token)).resolves.toStrictEqual({
      status: "valid",
      claims: { userId, role: "TENANT" }
    });
  });

  it("rejects invalid signing principals without mutating input", async () => {
    const service = createSessionTokenService({ secret: primarySecret, nowSeconds: () => fixedNow });
    const principal = Object.freeze({ userId: 42, role: "TENANT" as const });
    await service.sign(principal);
    expect(principal).toStrictEqual({ userId: 42, role: "TENANT" });

    for (const invalidPrincipal of [
      { userId: 0, role: "TENANT" },
      { userId: 2_147_483_648, role: "TENANT" },
      { userId: 1.5, role: "TENANT" },
      { userId: 42, role: "SUPER_ADMIN" }
    ]) {
      await expect(service.sign(invalidPrincipal as never)).rejects.toThrowError("principal is invalid");
    }
  });

  it("returns an unbound verifier assignable to the RM-012 boundary", () => {
    const service = createSessionTokenService({ secret: primarySecret, nowSeconds: () => fixedNow });
    const verifier: VerifySessionToken = service.verify;

    expectTypeOf(verifier).toEqualTypeOf<VerifySessionToken>();
    expect(verifier).toBe(service.verify);
  });
});

describe("RM-014 session token verification", () => {
  it("maps signature, expiry, algorithm, and malformed-token failures to invalid", async () => {
    const service = createSessionTokenService({ secret: primarySecret, nowSeconds: () => fixedNow });
    const token = await service.sign({ userId: 42, role: "TENANT" });
    const wrongSecretService = createSessionTokenService({ secret: otherSecret, nowSeconds: () => fixedNow });
    const expiredToken = await signFixture(validPayload({ iat: fixedNow - 7_201, exp: fixedNow - 1 }));
    const unsupportedAlgorithmToken = await signFixture(validPayload(), { algorithm: "HS384" });
    const tamperedToken = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    for (const verification of [
      wrongSecretService.verify(token),
      service.verify(tamperedToken),
      service.verify(expiredToken),
      service.verify(unsupportedAlgorithmToken),
      service.verify("not-a-jwt")
    ]) {
      await expect(verification).resolves.toStrictEqual({ status: "invalid" });
    }
  });

  it.each([
    ["missing subject", { sub: undefined }],
    ["blank subject", { sub: "" }],
    ["leading-zero subject", { sub: "042" }],
    ["signed subject", { sub: "+42" }],
    ["whitespace subject", { sub: " 42" }],
    ["decimal subject", { sub: "42.0" }],
    ["exponent subject", { sub: "4e1" }],
    ["out-of-range subject", { sub: "2147483648" }],
    ["unknown role", { role: "SUPER_ADMIN" }],
    ["missing issued-at", { iat: undefined }],
    ["noninteger issued-at", { iat: fixedNow - 0.5 }],
    ["future issued-at", { iat: fixedNow + 1, exp: fixedNow + 7_201 }],
    ["missing expiry", { exp: undefined }],
    ["noninteger expiry", { exp: fixedNow + 7_200.5 }],
    ["incorrect lifetime", { exp: fixedNow + 7_199 }],
    ["extra claim", { extra: "untrusted" }]
  ] as const)("returns invalid for %s", async (_label, overrides) => {
    const service = createSessionTokenService({ secret: primarySecret, nowSeconds: () => fixedNow });
    const token = await signFixture(validPayload(overrides as JWTPayload));

    await expect(service.verify(token)).resolves.toStrictEqual({ status: "invalid" });
  });

  it("does not disguise an unexpected clock failure as invalid authentication", async () => {
    let clockCalls = 0;
    const service = createSessionTokenService({
      secret: primarySecret,
      nowSeconds: () => {
        clockCalls += 1;
        return clockCalls === 1 ? fixedNow : Number.NaN;
      }
    });
    const privateToken = "private-token-value";

    await expect(service.verify(privateToken)).rejects.toThrowError("safe integer epoch second");
    await service.verify(privateToken).catch((error: unknown) => {
      expect(String(error)).not.toContain(privateToken);
    });
  });
});

function authenticationApp(mode: "protected" | "optional", verifier: VerifySessionToken): express.Express {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(cookieParserMiddleware);
  app.use(
    mode === "protected"
      ? createProtectedAuthenticationMiddleware({
          verifySessionToken: verifier,
          loadAuthenticationAccount: async (userId) => ({ id: userId, role: "TENANT", isActive: true })
        })
      : createOptionalAuthenticationMiddleware({
          verifySessionToken: verifier,
          loadAuthenticationAccount: async (userId) => ({ id: userId, role: "TENANT", isActive: true })
        })
  );
  app.get("/probe", (incomingRequest, response) => {
    response.status(200).json({ auth: incomingRequest.auth ?? null });
  });
  app.use(unexpectedErrorHandler(silentLogger));
  return app;
}

describe("RM-014 concrete verifier integration with RM-012", () => {
  it("permits a valid active protected account without attaching the token", async () => {
    const service = createSessionTokenService({ secret: primarySecret, nowSeconds: () => fixedNow });
    const token = await service.sign({ userId: 42, role: "TENANT" });
    const response = await request(authenticationApp("protected", service.verify))
      .get("/probe")
      .set("Cookie", `rentmate_session=${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({ auth: { userId: 42, role: "TENANT" } });
    expect(response.text).not.toContain(token);
  });

  it("returns protected 401 and optional anonymous behavior for an invalid token", async () => {
    const service = createSessionTokenService({ secret: primarySecret, nowSeconds: () => fixedNow });
    const protectedResponse = await request(authenticationApp("protected", service.verify))
      .get("/probe")
      .set("Cookie", "rentmate_session=invalid-token");
    const optionalResponse = await request(authenticationApp("optional", service.verify))
      .get("/probe")
      .set("Cookie", "rentmate_session=invalid-token");

    expect(protectedResponse.status).toBe(401);
    expect(protectedResponse.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(optionalResponse.status).toBe(200);
    expect(optionalResponse.body).toStrictEqual({ auth: null });
  });
});
