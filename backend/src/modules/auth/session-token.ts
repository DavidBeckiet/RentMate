import { errors, jwtVerify, SignJWT } from "jose";
import { jwtLifetimeSeconds } from "../../config/env.js";
import {
  isUserRole,
  type AuthenticatedPrincipal,
  type SessionVerificationResult,
  type UserRole,
  type VerifiedSessionClaims,
  type VerifySessionToken
} from "../../shared/types/authentication.js";

const sessionAlgorithm = "HS256";
const maximumUserId = 2_147_483_647;
const canonicalUserIdPattern = /^[1-9][0-9]*$/;
const allowedPayloadClaims = ["exp", "iat", "role", "sub"] as const;
const defaultNowSeconds = (): number => Math.floor(Date.now() / 1000);
const invalidVerificationResult = Object.freeze({ status: "invalid" as const });

export interface SessionTokenService {
  sign(principal: AuthenticatedPrincipal): Promise<string>;
  readonly verify: VerifySessionToken;
}

function readNowSeconds(nowSeconds: () => number): number {
  const value = nowSeconds();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Session token clock must return a non-negative safe integer epoch second.");
  }

  return value;
}

function isValidUserId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= maximumUserId;
}

function assertValidPrincipal(principal: AuthenticatedPrincipal): void {
  if (
    typeof principal !== "object" ||
    principal === null ||
    !isValidUserId(principal.userId) ||
    !isUserRole(principal.role)
  ) {
    throw new Error("Session token principal is invalid.");
  }
}

function hasExactPayloadClaims(payload: Readonly<Record<string, unknown>>): boolean {
  const keys = Object.keys(payload).sort();
  return keys.length === allowedPayloadClaims.length && keys.every((key, index) => key === allowedPayloadClaims[index]);
}

function mapVerifiedPayload(
  payload: Readonly<Record<string, unknown>>,
  currentEpochSecond: number
): SessionVerificationResult {
  if (!hasExactPayloadClaims(payload)) {
    return invalidVerificationResult;
  }

  const { sub, role, iat, exp } = payload;
  if (
    typeof sub !== "string" ||
    !canonicalUserIdPattern.test(sub) ||
    !isUserRole(role) ||
    !Number.isInteger(iat) ||
    !Number.isInteger(exp)
  ) {
    return invalidVerificationResult;
  }

  const userId = Number(sub);
  if (
    !isValidUserId(userId) ||
    (iat as number) > currentEpochSecond ||
    (exp as number) - (iat as number) !== jwtLifetimeSeconds
  ) {
    return invalidVerificationResult;
  }

  const claims: VerifiedSessionClaims = Object.freeze({ userId, role: role as UserRole });
  return Object.freeze({ status: "valid", claims });
}

export function createSessionTokenService(
  options: Readonly<{
    secret: string;
    nowSeconds?: () => number;
  }>
): SessionTokenService {
  if (typeof options.secret !== "string" || options.secret.trim().length === 0) {
    throw new Error("Session token secret must be a nonblank string.");
  }

  const nowSeconds = options.nowSeconds ?? defaultNowSeconds;
  if (typeof nowSeconds !== "function") {
    throw new Error("Session token clock must be a function.");
  }
  readNowSeconds(nowSeconds);

  const secretKey = new TextEncoder().encode(options.secret);

  const verify: VerifySessionToken = async (token) => {
    const currentEpochSecond = readNowSeconds(nowSeconds);

    try {
      const { payload } = await jwtVerify(token, secretKey, {
        algorithms: [sessionAlgorithm],
        clockTolerance: 0,
        currentDate: new Date(currentEpochSecond * 1000),
        requiredClaims: [...allowedPayloadClaims]
      });

      return mapVerifiedPayload(payload, currentEpochSecond);
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        return invalidVerificationResult;
      }

      throw error;
    }
  };

  return Object.freeze({
    async sign(principal: AuthenticatedPrincipal): Promise<string> {
      assertValidPrincipal(principal);
      const issuedAt = readNowSeconds(nowSeconds);

      return new SignJWT({ role: principal.role })
        .setProtectedHeader({ alg: sessionAlgorithm })
        .setSubject(String(principal.userId))
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + jwtLifetimeSeconds)
        .sign(secretKey);
    },
    verify
  });
}
