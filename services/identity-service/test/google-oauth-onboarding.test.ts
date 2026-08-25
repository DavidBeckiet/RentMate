import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
  createGoogleOAuthOnboardingTicketService,
  googleOAuthOnboardingCookieName
} from "../src/modules/auth/google-oauth-onboarding.js";

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

const profile = {
  providerSubject: "google-subject-1",
  email: "landlord@example.com",
  displayName: "Landlord User"
} as const;

test("encrypts and consumes a landlord onboarding ticket once", () => {
  const service = createGoogleOAuthOnboardingTicketService({ secret: "test-onboarding-secret", secure: false });
  const cookie = createResponse();
  service.create(cookie.response, profile);
  const stored = cookie.values.get(googleOAuthOnboardingCookieName);

  assert.ok(stored);
  assert.ok(!stored.includes(profile.providerSubject));
  assert.ok(!stored.includes(profile.email));

  const consumed = service.consume(
    { cookies: { [googleOAuthOnboardingCookieName]: stored } } as unknown as Request,
    cookie.response
  );
  assert.deepEqual(consumed, profile);
  assert.throws(() => service.consume({ cookies: {} } as unknown as Request, cookie.response));
});

test("rejects a tampered onboarding ticket", () => {
  const service = createGoogleOAuthOnboardingTicketService({ secret: "test-onboarding-secret", secure: false });
  const cookie = createResponse();
  service.create(cookie.response, profile);
  const stored = cookie.values.get(googleOAuthOnboardingCookieName)!;
  const [iv, ciphertext, tag] = stored.split(".");
  const tampered = `${iv?.startsWith("a") ? "b" : "a"}${iv?.slice(1)}.${ciphertext}.${tag}`;

  assert.throws(() =>
    service.consume({ cookies: { [googleOAuthOnboardingCookieName]: tampered } } as unknown as Request, cookie.response)
  );
});
