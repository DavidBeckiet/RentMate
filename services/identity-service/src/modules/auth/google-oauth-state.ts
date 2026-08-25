import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { ApplicationError } from "../../../../shared/src/runtime/shared/errors/application-error.js";

export type GoogleAuthIntent = "LOGIN" | "REGISTER";
export type GoogleAuthRole = "TENANT" | "LANDLORD";

export interface GoogleOAuthStateInput {
  readonly intent: GoogleAuthIntent;
  readonly role: GoogleAuthRole | null;
  readonly phone: string | null;
}

export interface GoogleOAuthState extends GoogleOAuthStateInput {
  readonly state: string;
  readonly codeVerifier: string;
}

interface StoredGoogleOAuthState extends GoogleOAuthStateInput {
  readonly state: string;
  readonly codeVerifier: string;
  readonly createdAt: number;
}

export interface GoogleOAuthStateService {
  create(response: Response, input: GoogleOAuthStateInput): GoogleOAuthState;
  consume(request: Request, response: Response, expectedState: string): GoogleOAuthState;
  clear(response: Response): void;
}

export const googleOAuthStateCookieName = "rentmate_google_oauth_state";
export const googleOAuthStateLifetimeSeconds = 600;

const algorithm = "aes-256-gcm";
const ivBytes = 12;
const stateBytes = 32;
const verifierBytes = 32;

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

function encodeState(payload: StoredGoogleOAuthState, secret: string): string {
  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv(algorithm, deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

function decodeState(value: string, secret: string): StoredGoogleOAuthState | null {
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null;

  try {
    const decipher = createDecipheriv(algorithm, deriveKey(secret), Buffer.from(parts[0]!, "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2]!, "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(parts[1]!, "base64url")), decipher.final()]).toString(
      "utf8"
    );
    const parsed: unknown = JSON.parse(plaintext);
    if (!isStoredState(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isStoredState(value: unknown): value is StoredGoogleOAuthState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<StoredGoogleOAuthState>;
  return (
    typeof candidate.state === "string" &&
    /^[A-Za-z0-9_-]{32,128}$/.test(candidate.state) &&
    typeof candidate.codeVerifier === "string" &&
    /^[A-Za-z0-9_-]{32,128}$/.test(candidate.codeVerifier) &&
    (candidate.intent === "LOGIN" || candidate.intent === "REGISTER") &&
    (candidate.role === null || candidate.role === "TENANT" || candidate.role === "LANDLORD") &&
    (candidate.phone === null || typeof candidate.phone === "string") &&
    Number.isSafeInteger(candidate.createdAt)
  );
}

function assertStateInput(input: GoogleOAuthStateInput): void {
  if (input.intent === "LOGIN" && (input.role !== null || input.phone !== null)) {
    throw new Error("Google login state must not contain a registration role or phone.");
  }
  if (input.intent === "REGISTER" && input.role === null) {
    throw new Error("Google registration state requires a role.");
  }
  if (input.role !== "LANDLORD" && input.phone !== null) {
    throw new Error("Google registration phone is only valid for landlords.");
  }
}

function invalidState(): ApplicationError {
  return new ApplicationError("GOOGLE_AUTH_FAILED", "Google authentication could not be verified.");
}

export function createGoogleOAuthStateService(
  options: Readonly<{ secret: string; secure: boolean }>
): GoogleOAuthStateService {
  if (!options.secret.trim()) throw new Error("Google OAuth state secret must be nonblank.");
  if (typeof options.secure !== "boolean") throw new Error("Google OAuth state secure configuration must be boolean.");

  const cookieOptions = Object.freeze({
    httpOnly: true,
    sameSite: "lax" as const,
    secure: options.secure,
    path: "/"
  });

  return Object.freeze({
    create(response: Response, input: GoogleOAuthStateInput): GoogleOAuthState {
      assertStateInput(input);
      const state = randomBytes(stateBytes).toString("base64url");
      const codeVerifier = randomBytes(verifierBytes).toString("base64url");
      const stored: StoredGoogleOAuthState = Object.freeze({
        ...input,
        state,
        codeVerifier,
        createdAt: Math.floor(Date.now() / 1000)
      });
      response.cookie(googleOAuthStateCookieName, encodeState(stored, options.secret), {
        ...cookieOptions,
        maxAge: googleOAuthStateLifetimeSeconds * 1000
      });
      return Object.freeze({ state, codeVerifier, ...input });
    },

    consume(request: Request, response: Response, expectedState: string): GoogleOAuthState {
      const raw = request.cookies[googleOAuthStateCookieName];
      response.clearCookie(googleOAuthStateCookieName, cookieOptions);
      if (!raw || !/^[A-Za-z0-9_.-]+$/.test(raw) || !/^[A-Za-z0-9_-]{32,128}$/.test(expectedState)) {
        throw invalidState();
      }

      const parsed = decodeState(raw, options.secret);
      const now = Math.floor(Date.now() / 1000);
      if (
        !parsed ||
        parsed.state !== expectedState ||
        parsed.createdAt > now + 30 ||
        now - parsed.createdAt > googleOAuthStateLifetimeSeconds
      ) {
        throw invalidState();
      }

      return Object.freeze({
        state: parsed.state,
        codeVerifier: parsed.codeVerifier,
        intent: parsed.intent,
        role: parsed.role,
        phone: parsed.phone
      });
    },

    clear(response: Response): void {
      response.clearCookie(googleOAuthStateCookieName, cookieOptions);
    }
  });
}
