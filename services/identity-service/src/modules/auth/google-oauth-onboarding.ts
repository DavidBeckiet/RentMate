import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { ApplicationError } from "../../../../shared/src/runtime/shared/errors/application-error.js";

export interface GoogleOAuthOnboardingProfile {
  readonly providerSubject: string;
  readonly email: string;
  readonly displayName: string | null;
}

export interface GoogleOAuthOnboardingTicketService {
  create(response: Response, profile: GoogleOAuthOnboardingProfile): void;
  consume(request: Request, response: Response): GoogleOAuthOnboardingProfile;
  clear(response: Response): void;
}

export const googleOAuthOnboardingCookieName = "rentmate_google_oauth_onboarding";
export const googleOAuthOnboardingLifetimeSeconds = 600;

const algorithm = "aes-256-gcm";
const ivBytes = 12;

interface StoredGoogleOAuthOnboardingTicket {
  readonly role: "LANDLORD";
  readonly profile: GoogleOAuthOnboardingProfile;
  readonly createdAt: number;
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

function encodeTicket(payload: StoredGoogleOAuthOnboardingTicket, secret: string): string {
  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv(algorithm, deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

function decodeTicket(value: string, secret: string): StoredGoogleOAuthOnboardingTicket | null {
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null;

  try {
    const decipher = createDecipheriv(algorithm, deriveKey(secret), Buffer.from(parts[0]!, "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2]!, "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(parts[1]!, "base64url")), decipher.final()]).toString(
      "utf8"
    );
    const parsed: unknown = JSON.parse(plaintext);
    return isStoredTicket(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isStoredTicket(value: unknown): value is StoredGoogleOAuthOnboardingTicket {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<StoredGoogleOAuthOnboardingTicket>;
  const profile = candidate.profile;
  if (typeof profile !== "object" || profile === null || Array.isArray(profile)) return false;

  const profileCandidate = profile as Partial<GoogleOAuthOnboardingProfile>;
  return (
    candidate.role === "LANDLORD" &&
    Number.isSafeInteger(candidate.createdAt) &&
    typeof profileCandidate.providerSubject === "string" &&
    /^[A-Za-z0-9_-]{1,255}$/.test(profileCandidate.providerSubject) &&
    typeof profileCandidate.email === "string" &&
    profileCandidate.email.length > 0 &&
    profileCandidate.email.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileCandidate.email) &&
    (profileCandidate.displayName === null ||
      (typeof profileCandidate.displayName === "string" && [...profileCandidate.displayName].length <= 120))
  );
}

function invalidTicket(): ApplicationError {
  return new ApplicationError(
    "GOOGLE_ONBOARDING_REQUIRED",
    "The Google landlord onboarding session is missing or expired."
  );
}

export function createGoogleOAuthOnboardingTicketService(
  options: Readonly<{ secret: string; secure: boolean }>
): GoogleOAuthOnboardingTicketService {
  if (!options.secret.trim()) throw new Error("Google OAuth onboarding secret must be nonblank.");
  if (typeof options.secure !== "boolean")
    throw new Error("Google OAuth onboarding secure configuration must be boolean.");

  const cookieOptions = Object.freeze({
    httpOnly: true,
    sameSite: "lax" as const,
    secure: options.secure,
    path: "/"
  });

  return Object.freeze({
    create(response: Response, profile: GoogleOAuthOnboardingProfile): void {
      const payload: StoredGoogleOAuthOnboardingTicket = Object.freeze({
        role: "LANDLORD",
        profile: Object.freeze({ ...profile }),
        createdAt: Math.floor(Date.now() / 1000)
      });
      response.cookie(googleOAuthOnboardingCookieName, encodeTicket(payload, options.secret), {
        ...cookieOptions,
        maxAge: googleOAuthOnboardingLifetimeSeconds * 1000
      });
    },

    consume(request: Request, response: Response): GoogleOAuthOnboardingProfile {
      const raw = request.cookies[googleOAuthOnboardingCookieName];
      response.clearCookie(googleOAuthOnboardingCookieName, cookieOptions);
      if (!raw || !/^[A-Za-z0-9_.-]+$/.test(raw)) throw invalidTicket();

      const parsed = decodeTicket(raw, options.secret);
      const now = Math.floor(Date.now() / 1000);
      if (!parsed || parsed.createdAt > now + 30 || now - parsed.createdAt > googleOAuthOnboardingLifetimeSeconds) {
        throw invalidTicket();
      }

      return Object.freeze({ ...parsed.profile });
    },

    clear(response: Response): void {
      response.clearCookie(googleOAuthOnboardingCookieName, cookieOptions);
    }
  });
}
