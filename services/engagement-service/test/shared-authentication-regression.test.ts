import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import { createProtectedAuthenticationMiddleware } from "../../shared/src/runtime/shared/middleware/authentication.js";
import { sessionCookieName } from "../../shared/src/runtime/shared/types/authentication.js";

function invoke(handler: RequestHandler, request: Request): Promise<unknown> {
  return new Promise((resolve) => {
    const next: NextFunction = (error?: unknown) => resolve(error);
    handler(request, {} as Response, next);
  });
}

test("shared protected authentication is idempotent only after each pass validates the session", async () => {
  let verificationCalls = 0;
  let accountLoads = 0;
  const middleware = createProtectedAuthenticationMiddleware({
    verifySessionToken: async () => {
      verificationCalls += 1;
      return verificationCalls === 1
        ? { status: "valid" as const, claims: { userId: 9, role: "ADMIN" as const } }
        : { status: "invalid" as const };
    },
    loadAuthenticationAccount: async () => {
      accountLoads += 1;
      return { id: 9, role: "ADMIN" as const, isActive: true };
    }
  });
  const request = { cookies: { [sessionCookieName]: "synthetic-valid-then-invalid" } } as Request;

  assert.equal(await invoke(middleware, request), undefined);
  assert.deepEqual(request.auth, { userId: 9, role: "ADMIN" });
  assert.equal(Object.getOwnPropertyDescriptor(request, "auth")?.writable, false);

  const secondResult = await invoke(middleware, request);
  assert.ok(secondResult instanceof ApplicationError);
  assert.equal(secondResult.code, "AUTHENTICATION_REQUIRED");
  assert.equal(accountLoads, 1);

  const missingTokenRequest = { cookies: {} } as Request;
  const missingTokenResult = await invoke(middleware, missingTokenRequest);
  assert.ok(missingTokenResult instanceof ApplicationError);
  assert.equal(missingTokenResult.code, "AUTHENTICATION_REQUIRED");
  assert.equal(missingTokenRequest.auth, undefined);
});
