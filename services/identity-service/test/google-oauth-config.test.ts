import assert from "node:assert/strict";
import test from "node:test";
import { parseEnvironment } from "../../shared/src/runtime/config/env.js";

const developmentEnvironment = {
  NODE_ENV: "development",
  FRONTEND_ORIGIN: "http://localhost:3000"
};

test("keeps Google OAuth disabled until all local provider values are present", () => {
  assert.equal(parseEnvironment(developmentEnvironment).googleOAuth.enabled, false);
  assert.equal(
    parseEnvironment({
      ...developmentEnvironment,
      GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:4001/api/v1/auth/google/callback"
    }).googleOAuth.enabled,
    false
  );
  const config = parseEnvironment({
    ...developmentEnvironment,
    GOOGLE_OAUTH_CLIENT_ID: "client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
    GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:4001/api/v1/auth/google/callback"
  });
  assert.deepEqual(config.googleOAuth, {
    enabled: true,
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "http://localhost:4001/api/v1/auth/google/callback"
  });
});

test("rejects partial Google OAuth configuration instead of silently starting", () => {
  assert.throws(() =>
    parseEnvironment({
      ...developmentEnvironment,
      GOOGLE_OAUTH_CLIENT_ID: "client-id"
    })
  );
});
