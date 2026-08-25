import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { createGoogleOAuthStateService, googleOAuthStateCookieName } from "../src/modules/auth/google-oauth-state.js";

interface CookieResponse {
  readonly values: Map<string, string>;
  readonly response: Response;
}

function createResponse(): CookieResponse {
  const values = new Map<string, string>();
  const response = {
    cookie(name: string, value: string) {
      values.set(name, value);
    },
    clearCookie(name: string) {
      values.delete(name);
    }
  } as unknown as Response;
  return { values, response };
}

test("encrypts OAuth state, preserves registration intent, and consumes it once", () => {
  const service = createGoogleOAuthStateService({ secret: "test-google-state-secret", secure: false });
  const cookie = createResponse();
  const created = service.create(cookie.response, {
    intent: "REGISTER",
    role: "LANDLORD",
    phone: "+84901234567"
  });
  const stored = cookie.values.get(googleOAuthStateCookieName);
  assert.ok(stored);
  assert.ok(!stored.includes("+84901234567"));

  const request = { cookies: { [googleOAuthStateCookieName]: stored } } as unknown as Request;
  const consumed = service.consume(request, cookie.response, created.state);
  assert.deepEqual(consumed, created);

  const replayRequest = { cookies: {} } as unknown as Request;
  assert.throws(() => service.consume(replayRequest, cookie.response, created.state));
});

test("rejects tampered state and mismatched query state", () => {
  const service = createGoogleOAuthStateService({ secret: "test-google-state-secret", secure: false });
  const cookie = createResponse();
  const created = service.create(cookie.response, { intent: "LOGIN", role: null, phone: null });
  const stored = cookie.values.get(googleOAuthStateCookieName)!;

  const tampered = `${stored.slice(0, -1)}${stored.endsWith("a") ? "b" : "a"}`;
  assert.throws(() =>
    service.consume(
      { cookies: { [googleOAuthStateCookieName]: tampered } } as unknown as Request,
      cookie.response,
      created.state
    )
  );
  assert.throws(() =>
    service.consume(
      { cookies: { [googleOAuthStateCookieName]: stored } } as unknown as Request,
      cookie.response,
      `${created.state.slice(0, -1)}x`
    )
  );
});
