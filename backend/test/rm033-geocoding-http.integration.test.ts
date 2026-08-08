import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { NominatimClient } from "../src/integrations/nominatim.client.js";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import { InMemoryRateLimitStore, type RateLimitStore } from "../src/shared/middleware/rate-limit.js";
import type { UserRole } from "../src/shared/types/authentication.js";

const origin = "http://localhost:3000";
const secret = "rm033-http-test-secret";
const nowSeconds = 1_900_000_000;

function result<Row extends QueryResultRow>(rows: Row[] = []): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

class AuthenticationExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  active = true;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (!query.text.includes("FROM users")) throw new Error(`Unexpected RM-033 SQL: ${query.text}`);
    const userId = Number(query.values[0]);
    const role: UserRole = userId === 10 ? "TENANT" : userId === 11 ? "ADMIN" : "LANDLORD";
    return result([{ id: userId, role, is_active: this.active }] as unknown as Row[]);
  }
}

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

const allowAllStore = (): RateLimitStore => ({ consume: vi.fn(() => ({ allowed: true })) });

function provider(): NominatimClient {
  return {
    forwardGeocode: vi.fn(async () => [
      { displayName: "Ben Thanh, Ho Chi Minh City", latitude: 10.772341987, longitude: 106.697912345 }
    ])
  };
}

interface AppOptions {
  readonly executor?: AuthenticationExecutor;
  readonly nominatimClient?: NominatimClient;
  readonly userStore?: RateLimitStore;
  readonly providerStore?: RateLimitStore;
  readonly clock?: () => number;
}

async function makeApp(options: AppOptions = {}) {
  const executor = options.executor ?? new AuthenticationExecutor();
  const nominatimClient = options.nominatimClient ?? provider();
  const clock = options.clock ?? (() => 0);
  const app = await createBackendApp({
    frontendOrigin: origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => nowSeconds,
    authRateLimitClock: () => 0,
    nominatimClient,
    geocodingUserRateLimitStore: options.userStore,
    geocodingUserRateLimitClock: clock,
    nominatimProviderRateLimitStore: options.providerStore,
    nominatimProviderRateLimitClock: clock
  });
  return { app, executor, provider: nominatimClient };
}

async function cookie(userId = 9, role: UserRole = "LANDLORD") {
  const token = await createSessionTokenService({ secret, nowSeconds: () => nowSeconds }).sign({ userId, role });
  return `rentmate_session=${token}`;
}

function geocode(application: Awaited<ReturnType<typeof makeApp>>["app"], auth: string, addressText = " Address ") {
  return request(application)
    .post("/api/v1/geocoding/forward")
    .set("Origin", origin)
    .set("Cookie", auth)
    .send({ addressText });
}

describe("RM-033 geocoding HTTP", () => {
  it("returns exact normalized candidate data for an active LANDLORD", async () => {
    const fixture = await makeApp();
    const response = await geocode(fixture.app, await cookie()).expect(200);

    expect(response.body).toStrictEqual({
      data: [
        {
          displayName: "Ben Thanh, Ho Chi Minh City",
          latitude: 10.772341987,
          longitude: 106.697912345
        }
      ]
    });
    expect(Object.keys(response.body.data[0]).sort()).toStrictEqual(["displayName", "latitude", "longitude"].sort());
    expect(JSON.stringify(response.body)).not.toMatch(/place_id|osm_id|osm_type|licence|boundingbox|"lat"|"lon"/);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledWith("Address");
  });

  it("returns 200 with an empty candidate collection", async () => {
    const empty: NominatimClient = { forwardGeocode: vi.fn(async () => []) };
    const fixture = await makeApp({ nominatimClient: empty });
    await expect(geocode(fixture.app, await cookie())).resolves.toMatchObject({ status: 200, body: { data: [] } });
  });

  it("enforces Origin and authentication before provider work", async () => {
    const fixture = await makeApp();
    await request(fixture.app).post("/api/v1/geocoding/forward").send({ addressText: "Address" }).expect(403);
    await request(fixture.app)
      .post("/api/v1/geocoding/forward")
      .set("Origin", "http://denied.test")
      .send({ addressText: "Address" })
      .expect(403);
    await request(fixture.app)
      .post("/api/v1/geocoding/forward")
      .set("Origin", origin)
      .send({ addressText: "Address" })
      .expect(401);
    await request(fixture.app)
      .post("/api/v1/geocoding/forward")
      .set("Origin", origin)
      .set("Cookie", "rentmate_session=invalid")
      .send({ addressText: "Address" })
      .expect(401);
    expect(fixture.provider.forwardGeocode).not.toHaveBeenCalled();
  });

  it("rejects inactive authentication before provider work", async () => {
    const executor = new AuthenticationExecutor();
    executor.active = false;
    const fixture = await makeApp({ executor });
    await geocode(fixture.app, await cookie()).expect(401);
    expect(fixture.provider.forwardGeocode).not.toHaveBeenCalled();
  });

  it.each([
    [10, "TENANT"],
    [11, "ADMIN"]
  ] as const)("rejects active %s role before provider work", async (userId, role) => {
    const fixture = await makeApp();
    await geocode(fixture.app, await cookie(userId, role)).expect(403);
    expect(fixture.provider.forwardGeocode).not.toHaveBeenCalled();
  });

  it("validates query and body before consuming either limiter", async () => {
    const userStore = allowAllStore();
    const providerStore = allowAllStore();
    const fixture = await makeApp({ userStore, providerStore });
    const auth = await cookie();
    await request(fixture.app)
      .post("/api/v1/geocoding/forward?extra=1")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({ addressText: "Address" })
      .expect(422);
    await geocode(fixture.app, auth, "   ").expect(422);
    await request(fixture.app)
      .post("/api/v1/geocoding/forward")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({ addressText: "Address", listingId: 7 })
      .expect(422);
    expect(userStore.consume).not.toHaveBeenCalled();
    expect(providerStore.consume).not.toHaveBeenCalled();
    expect(fixture.provider.forwardGeocode).not.toHaveBeenCalled();
  });

  it("maps provider failure to sanitized 502", async () => {
    const failing: NominatimClient = {
      forwardGeocode: vi.fn(async () => {
        const { NominatimClientError } = await import("../src/integrations/nominatim.client.js");
        throw new NominatimClientError();
      })
    };
    const fixture = await makeApp({ nominatimClient: failing });
    const response = await geocode(fixture.app, await cookie()).expect(502);
    expect(response.body.error).toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      message: "The geocoding provider is unavailable."
    });
    expect(response.body.error.details).toBeUndefined();
  });

  it("enforces the user window and skips the provider limiter on user rejection", async () => {
    let now = 0;
    const providerStore = allowAllStore();
    const fixture = await makeApp({
      userStore: new InMemoryRateLimitStore(),
      providerStore,
      clock: () => now
    });
    const auth = await cookie();
    await geocode(fixture.app, auth).expect(200);
    await geocode(fixture.app, auth).expect(429);
    expect(providerStore.consume).toHaveBeenCalledTimes(1);
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledTimes(1);
    now = 1_000;
    await geocode(fixture.app, auth).expect(200);
  });

  it("keeps user buckets independent when provider limiting is permissive", async () => {
    const fixture = await makeApp({
      userStore: new InMemoryRateLimitStore(),
      providerStore: allowAllStore()
    });
    await geocode(fixture.app, await cookie(9)).expect(200);
    await geocode(fixture.app, await cookie(12)).expect(200);
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledTimes(2);
  });

  it("enforces the provider-global window across users and resets at the boundary", async () => {
    let now = 0;
    const fixture = await makeApp({
      userStore: allowAllStore(),
      providerStore: new InMemoryRateLimitStore(),
      clock: () => now
    });
    await geocode(fixture.app, await cookie(9)).expect(200);
    await geocode(fixture.app, await cookie(12)).expect(429);
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledTimes(1);
    now = 1_000;
    await geocode(fixture.app, await cookie(12)).expect(200);
  });
});
