import type { Express } from "express";
import type { SqlExecutor } from "../../src/db/sql-executor.js";
import type { SessionCookieService } from "../../src/modules/auth/session-cookie.js";
import type { SessionTokenService } from "../../src/modules/auth/session-token.js";
import { createBackendApp } from "../../src/server-composition.js";
import type { LogContext, Logger } from "../../src/shared/logging/logger.js";
import type { Clock, RateLimitStore } from "../../src/shared/middleware/rate-limit.js";

export const authUsersOrigin = "http://localhost:3000";
export const authUsersTestJwtSecret = "rm018-test-only-jwt-secret-not-for-production";
export const authUsersNowSeconds = 1_900_000_000;

export interface CapturedLogEntry {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message: string;
  readonly context?: LogContext;
}

export interface AuthUsersFixtureOptions {
  readonly sqlExecutor: SqlExecutor;
  readonly checkDatabaseConnection?: () => Promise<void>;
  readonly frontendOrigin?: string;
  readonly cookieSecure?: boolean;
  readonly logger?: Logger;
  readonly sessionTokenClock?: () => number;
  readonly rateLimitClock?: Clock;
  readonly rateLimitStore?: RateLimitStore;
  readonly sessionTokenService?: SessionTokenService;
  readonly sessionCookieService?: SessionCookieService;
}

export interface AuthUsersFixture {
  readonly app: Express;
  readonly logs: readonly CapturedLogEntry[];
}

function createCapturingLogger(entries: CapturedLogEntry[]): Logger {
  return {
    debug: (message, context) => entries.push({ level: "debug", message, context }),
    info: (message, context) => entries.push({ level: "info", message, context }),
    warn: (message, context) => entries.push({ level: "warn", message, context }),
    error: (message, context) => entries.push({ level: "error", message, context })
  };
}

export async function createAuthUsersFixture(options: AuthUsersFixtureOptions): Promise<AuthUsersFixture> {
  const logs: CapturedLogEntry[] = [];
  const app = await createBackendApp({
    frontendOrigin: options.frontendOrigin ?? authUsersOrigin,
    logger: options.logger ?? createCapturingLogger(logs),
    checkDatabaseConnection: options.checkDatabaseConnection ?? (async () => undefined),
    sqlExecutor: options.sqlExecutor,
    jwtSecret: authUsersTestJwtSecret,
    bcryptCost: 4,
    cookieSecure: options.cookieSecure ?? false,
    sessionTokenClock: options.sessionTokenClock ?? (() => authUsersNowSeconds),
    authRateLimitClock: options.rateLimitClock ?? (() => 0),
    authRateLimitStore: options.rateLimitStore,
    sessionTokenService: options.sessionTokenService,
    sessionCookieService: options.sessionCookieService
  });

  return { app, logs };
}
