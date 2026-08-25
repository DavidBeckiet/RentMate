import { createHash } from "node:crypto";
import { ApplicationError } from "../../../../shared/src/runtime/shared/errors/application-error.js";
import {
  normalizeDisplayName,
  normalizeEmail
} from "../../../../shared/src/runtime/shared/validation/normalization.js";

export interface GoogleProfile {
  readonly subject: string;
  readonly email: string;
  readonly displayName: string | null;
}

export interface GoogleOAuthClient {
  readonly createAuthorizationUrl: (input: { readonly state: string; readonly codeVerifier: string }) => string;
  readonly exchangeCode: (code: string, codeVerifier: string) => Promise<GoogleProfile>;
}

export class GoogleOAuthProviderError extends Error {
  constructor() {
    super("Google OAuth provider request failed.");
    this.name = "GoogleOAuthProviderError";
  }
}

interface GoogleOAuthClientOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
}

const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const userInfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo";
const defaultTimeoutMs = 5_000;

function codeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

function providerFailure(): GoogleOAuthProviderError {
  return new GoogleOAuthProviderError();
}

function isUsableAuthorizationCode(code: string): boolean {
  return code.length > 0 && code.length <= 2048 && !/[\u0000-\u001f\u007f\s]/.test(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw providerFailure();
  }
}

function readAccessToken(value: unknown): string {
  if (!isRecord(value) || typeof value.access_token !== "string" || value.access_token.trim().length === 0) {
    throw providerFailure();
  }
  return value.access_token;
}

function readGoogleProfile(value: unknown): GoogleProfile {
  if (
    !isRecord(value) ||
    typeof value.sub !== "string" ||
    !/^[A-Za-z0-9_-]{1,255}$/.test(value.sub) ||
    value.email_verified !== true
  ) {
    throw providerFailure();
  }

  let email: string;
  try {
    email = normalizeEmail(value.email);
  } catch {
    throw providerFailure();
  }

  let displayName: string | null = null;
  if (value.name !== undefined && value.name !== null) {
    try {
      displayName = normalizeDisplayName(value.name);
    } catch {
      throw providerFailure();
    }
  }

  return Object.freeze({ subject: value.sub, email, displayName });
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } catch {
    throw providerFailure();
  } finally {
    clearTimeout(timeout);
  }
}

export function createGoogleOAuthClient(options: GoogleOAuthClientOptions): GoogleOAuthClient {
  if (!options.clientId.trim() || !options.clientSecret.trim() || !options.redirectUri.trim()) {
    throw new Error("Google OAuth client configuration is incomplete.");
  }

  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;

  return Object.freeze({
    createAuthorizationUrl({ state, codeVerifier }: { readonly state: string; readonly codeVerifier: string }) {
      const url = new URL(authorizationEndpoint);
      url.search = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: options.redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
        code_challenge: codeChallenge(codeVerifier),
        code_challenge_method: "S256",
        access_type: "online",
        prompt: "select_account"
      }).toString();
      return url.href;
    },

    async exchangeCode(code: string, codeVerifier: string) {
      // Google authorization codes are opaque values and may contain characters such as "/".
      if (!isUsableAuthorizationCode(code) || !/^[A-Za-z0-9_-]{32,128}$/.test(codeVerifier)) {
        throw new ApplicationError("GOOGLE_AUTH_FAILED", "Google authentication could not be completed.");
      }

      const tokenBody = new URLSearchParams({
        code,
        client_id: options.clientId,
        client_secret: options.clientSecret,
        redirect_uri: options.redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier
      });
      const tokenResponse = await fetchWithTimeout(
        fetcher,
        tokenEndpoint,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: tokenBody
        },
        timeoutMs
      );
      if (!tokenResponse.ok) throw providerFailure();
      const accessToken = readAccessToken(await readJson(tokenResponse));

      const profileResponse = await fetchWithTimeout(
        fetcher,
        userInfoEndpoint,
        {
          method: "GET",
          headers: { authorization: `Bearer ${accessToken}` }
        },
        timeoutMs
      );
      if (!profileResponse.ok) throw providerFailure();
      return readGoogleProfile(await readJson(profileResponse));
    }
  });
}
