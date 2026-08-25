import assert from "node:assert/strict";
import test from "node:test";
import { createGoogleOAuthClient } from "../src/modules/auth/google-oauth-client.js";

const clientOptions = {
  clientId: "google-client-id",
  clientSecret: "google-client-secret",
  redirectUri: "http://localhost:4001/api/v1/auth/google/callback"
};

test("builds a Google authorization URL with PKCE and the exact callback", () => {
  const client = createGoogleOAuthClient(clientOptions);
  const url = new URL(
    client.createAuthorizationUrl({
      state: "state_abcdefghijklmnopqrstuvwxyz123",
      codeVerifier: "verifier_abcdefghijklmnopqrstuvwxyz123"
    })
  );

  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.pathname, "/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), clientOptions.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), clientOptions.redirectUri);
  assert.equal(url.searchParams.get("state"), "state_abcdefghijklmnopqrstuvwxyz123");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.equal(url.searchParams.get("scope"), "openid email profile");
});

test("exchanges a code and reads only the verified Google profile fields", async () => {
  const requests: { readonly url: string; readonly init: RequestInit }[] = [];
  const client = createGoogleOAuthClient({
    ...clientOptions,
    fetcher: async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      if (String(url).includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "provider-access-token" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ sub: "google-subject-1", email: "Owner@Example.com", email_verified: true, name: " Owner " }),
        { status: 200 }
      );
    }
  });

  const profile = await client.exchangeCode(
    "4/0AX4XfWiAvnXLqxlckFUVao8j0zvZUJ06AMgr-n0vSPotHWcn9p-zHCjqwr47KHS_vDvu8w",
    "verifier_abcdefghijklmnopqrstuvwxyz123"
  );
  assert.deepEqual(profile, {
    subject: "google-subject-1",
    email: "owner@example.com",
    displayName: "Owner"
  });
  assert.equal(requests.length, 2);
  assert.match(String(requests[0]?.init.body), /client_secret=google-client-secret/);
  assert.equal(new Headers(requests[1]?.init.headers).get("authorization"), "Bearer provider-access-token");
});

test("maps provider rejection to a safe error without exposing the response body", async () => {
  const client = createGoogleOAuthClient({
    ...clientOptions,
    fetcher: async () => new Response("provider-secret-response", { status: 401 })
  });

  await assert.rejects(
    () => client.exchangeCode("oauth-code", "verifier_abcdefghijklmnopqrstuvwxyz123"),
    (error: unknown) =>
      error instanceof Error && error.name === "GoogleOAuthProviderError" && !error.message.includes("provider-secret")
  );
});
