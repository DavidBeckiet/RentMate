import type { Express } from "express";
import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { vi } from "vitest";
import type { NominatimCandidate, NominatimClient } from "../../src/integrations/nominatim.client.js";
import type { ParameterizedQuery, SqlExecutor } from "../../src/db/sql-executor.js";
import { createSessionTokenService } from "../../src/modules/auth/session-token.js";
import { createBackendApp } from "../../src/server-composition.js";
import type { LogContext, Logger } from "../../src/shared/logging/logger.js";
import type {
  Clock,
  RateLimitConsumeInput,
  RateLimitConsumeResult,
  RateLimitStore
} from "../../src/shared/middleware/rate-limit.js";
import type { UserRole } from "../../src/shared/types/authentication.js";

export const rm034Origin = "http://localhost:3000";
export const rm034Secret = "rm034-test-only-session-secret";
export const rm034NowSeconds = 1_900_000_000;
export const rm034DefaultAddress = "101 Example Street";

export interface Rm034LogEntry {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message: string;
  readonly context?: LogContext;
}

interface TestAccount {
  readonly role: UserRole;
  readonly active: boolean;
}

function queryResult<Row extends QueryResultRow>(rows: Row[] = []): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

export class Rm034AuthenticationExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  readonly accounts = new Map<number, TestAccount>([
    [1, { role: "LANDLORD", active: true }],
    [2, { role: "LANDLORD", active: true }],
    [3, { role: "TENANT", active: true }],
    [4, { role: "ADMIN", active: true }],
    [5, { role: "LANDLORD", active: false }]
  ]);

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push({ text: query.text, values: [...query.values] });
    if (!/^\s*SELECT\b/i.test(query.text) || !/\bFROM\s+users\b/i.test(query.text)) {
      throw new Error(`Unexpected RM-034 SQL: ${query.text}`);
    }

    const userId = Number(query.values[0]);
    const account = this.accounts.get(userId);
    if (!account) return queryResult();
    return queryResult([{ id: userId, role: account.role, is_active: account.active }] as unknown as Row[]);
  }
}

export class MutableRm034Clock {
  constructor(public now = 0) {}

  readonly read: Clock = () => this.now;
}

export class RecordingRateLimitStore implements RateLimitStore {
  readonly calls: RateLimitConsumeInput[] = [];

  constructor(
    private readonly delegate: RateLimitStore = {
      consume: () => Object.freeze({ allowed: true })
    }
  ) {}

  consume(input: RateLimitConsumeInput): RateLimitConsumeResult | Promise<RateLimitConsumeResult> {
    this.calls.push(Object.freeze({ ...input }));
    return this.delegate.consume(input);
  }
}

export function allowAllRateLimitStore(): RecordingRateLimitStore {
  return new RecordingRateLimitStore();
}

export function createRecordingProvider(
  implementation: NominatimClient["forwardGeocode"] = async () => [
    {
      displayName: "Ben Thanh, Ho Chi Minh City",
      latitude: 10.772341987,
      longitude: 106.697912345
    }
  ]
) {
  const forwardGeocode = vi.fn(implementation);
  return {
    client: Object.freeze<NominatimClient>({ forwardGeocode }),
    forwardGeocode
  };
}

function createRecordingLogger(entries: Rm034LogEntry[]): Logger {
  const append = (level: Rm034LogEntry["level"], message: string, context?: LogContext): void => {
    entries.push({ level, message, context });
  };
  return {
    debug: (message, context) => append("debug", message, context),
    info: (message, context) => append("info", message, context),
    warn: (message, context) => append("warn", message, context),
    error: (message, context) => append("error", message, context)
  };
}

export interface Rm034FixtureOptions {
  readonly executor?: Rm034AuthenticationExecutor;
  readonly provider?: ReturnType<typeof createRecordingProvider>;
  readonly userStore?: RateLimitStore;
  readonly providerStore?: RateLimitStore;
  readonly userClock?: Clock;
  readonly providerClock?: Clock;
}

export interface Rm034Fixture {
  readonly app: Express;
  readonly executor: Rm034AuthenticationExecutor;
  readonly provider: ReturnType<typeof createRecordingProvider>;
  readonly logs: readonly Rm034LogEntry[];
  readonly draftState: Readonly<{
    id: number;
    status: "DRAFT";
    addressText: string;
    latitude: number | null;
    longitude: number | null;
  }>;
}

export async function createRm034Fixture(options: Rm034FixtureOptions = {}): Promise<Rm034Fixture> {
  const executor = options.executor ?? new Rm034AuthenticationExecutor();
  const provider = options.provider ?? createRecordingProvider();
  const logs: Rm034LogEntry[] = [];
  const draftState = Object.freeze({
    id: 700,
    status: "DRAFT" as const,
    addressText: "Unchanged draft address",
    latitude: null,
    longitude: null
  });
  const app = await createBackendApp({
    frontendOrigin: rm034Origin,
    logger: createRecordingLogger(logs),
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: rm034Secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => rm034NowSeconds,
    authRateLimitClock: () => 0,
    nominatimClient: provider.client,
    geocodingUserRateLimitStore: options.userStore,
    geocodingUserRateLimitClock: options.userClock ?? (() => 0),
    nominatimProviderRateLimitStore: options.providerStore,
    nominatimProviderRateLimitClock: options.providerClock ?? (() => 0)
  });

  return { app, executor, provider, logs, draftState };
}

export async function rm034Cookie(
  userId = 1,
  role: UserRole = "LANDLORD",
  issuedAt = rm034NowSeconds
): Promise<string> {
  const token = await createSessionTokenService({ secret: rm034Secret, nowSeconds: () => issuedAt }).sign({
    userId,
    role
  });
  return `rentmate_session=${token}`;
}

export function geocodeRequest(app: Express, cookie: string, addressText = rm034DefaultAddress, origin = rm034Origin) {
  return request(app)
    .post("/api/v1/geocoding/forward")
    .set("Origin", origin)
    .set("Cookie", cookie)
    .send({ addressText });
}

export function providerCandidate(index = 1, overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    place_id: 9_000 + index,
    osm_id: 8_000 + index,
    osm_type: "node",
    licence: "RM034_PRIVATE_LICENCE",
    class: "place",
    type: "house",
    importance: 0.75,
    boundingbox: ["10", "11", "106", "107"],
    address: { private: "RM034_PRIVATE_ADDRESS_OBJECT" },
    extratags: { private: true },
    namedetails: { private: true },
    arbitraryUnknownField: "RM034_PRIVATE_UNKNOWN",
    nestedRawMetadata: { secret: "RM034_PRIVATE_NESTED" },
    display_name: ` Candidate ${index} `,
    lat: `10.77${index}`,
    lon: `106.69${index}`,
    ...overrides
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Provider-Private": "RM034_PROVIDER_HEADER" }
  });
}

export function serializedLogs(logs: readonly Rm034LogEntry[]): string {
  return JSON.stringify(logs);
}

export function candidateData(displayName: string, latitude: number, longitude: number): NominatimCandidate {
  return { displayName, latitude, longitude };
}
