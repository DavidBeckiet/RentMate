import { describe, expect, it } from "vitest";
import { geocodingUserRateLimitPolicy, nominatimProviderRateLimitPolicy } from "../src/modules/listings/routes.js";
import { InMemoryRateLimitStore, rateLimitedMessage } from "../src/shared/middleware/rate-limit.js";
import {
  allowAllRateLimitStore,
  createRm034Fixture,
  geocodeRequest,
  MutableRm034Clock,
  RecordingRateLimitStore,
  rm034Cookie
} from "./helpers/rm034-geocoding-fixture.js";

describe("RM-034 exact geocoding limiter policies", () => {
  it("locks the per-user and provider-global policies", () => {
    expect(geocodingUserRateLimitPolicy).toStrictEqual({
      scope: "geocoding-user",
      limit: 1,
      windowMs: 1_000
    });
    expect(nominatimProviderRateLimitPolicy).toStrictEqual({
      scope: "nominatim-provider",
      limit: 1,
      windowMs: 1_000
    });
  });

  it("enforces the exact per-user t=0, t=999, and t=1000 boundary", async () => {
    const clock = new MutableRm034Clock(0);
    const userStore = new RecordingRateLimitStore(new InMemoryRateLimitStore());
    const fixture = await createRm034Fixture({
      userStore,
      providerStore: allowAllRateLimitStore(),
      userClock: clock.read
    });
    const auth = await rm034Cookie(1);

    await geocodeRequest(fixture.app, auth).expect(200);
    clock.now = 999;
    await geocodeRequest(fixture.app, auth).expect(429);
    clock.now = 1_000;
    await geocodeRequest(fixture.app, auth).expect(200);

    expect(userStore.calls.map((call) => call.now)).toStrictEqual([0, 999, 1_000]);
    expect(userStore.calls.map((call) => call.key)).toStrictEqual([
      '["geocoding-user","1"]',
      '["geocoding-user","1"]',
      '["geocoding-user","1"]'
    ]);
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledTimes(2);
  });

  it("keeps authenticated user buckets independent from one another and from IP", async () => {
    const userStore = new RecordingRateLimitStore(new InMemoryRateLimitStore());
    const fixture = await createRm034Fixture({
      userStore,
      providerStore: allowAllRateLimitStore()
    });

    await geocodeRequest(fixture.app, await rm034Cookie(1)).expect(200);
    await geocodeRequest(fixture.app, await rm034Cookie(1)).expect(429);
    await geocodeRequest(fixture.app, await rm034Cookie(2)).expect(200);

    expect(userStore.calls.map((call) => call.key)).toStrictEqual([
      '["geocoding-user","1"]',
      '["geocoding-user","1"]',
      '["geocoding-user","2"]'
    ]);
    expect(userStore.calls.every((call) => !call.key.includes("127.0.0.1"))).toBe(true);
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledTimes(2);
  });

  it("enforces the exact cross-user provider-global t=0, t=999, and t=1000 boundary", async () => {
    const clock = new MutableRm034Clock(0);
    const providerStore = new RecordingRateLimitStore(new InMemoryRateLimitStore());
    const fixture = await createRm034Fixture({
      userStore: allowAllRateLimitStore(),
      providerStore,
      providerClock: clock.read
    });

    await geocodeRequest(fixture.app, await rm034Cookie(1)).expect(200);
    clock.now = 999;
    await geocodeRequest(fixture.app, await rm034Cookie(2)).expect(429);
    clock.now = 1_000;
    await geocodeRequest(fixture.app, await rm034Cookie(2)).expect(200);

    expect(providerStore.calls.map((call) => call.now)).toStrictEqual([0, 999, 1_000]);
    expect(providerStore.calls.map((call) => call.key)).toStrictEqual([
      '["nominatim-provider","nominatim"]',
      '["nominatim-provider","nominatim"]',
      '["nominatim-provider","nominatim"]'
    ]);
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledTimes(2);
  });
});

describe("RM-034 limiter ordering and concurrency", () => {
  it("does not consume provider quota after the user limiter rejects", async () => {
    const userStore = new RecordingRateLimitStore(new InMemoryRateLimitStore());
    const providerStore = allowAllRateLimitStore();
    const fixture = await createRm034Fixture({ userStore, providerStore });
    const auth = await rm034Cookie(1);

    await geocodeRequest(fixture.app, auth).expect(200);
    await geocodeRequest(fixture.app, auth).expect(429);

    expect(userStore.calls).toHaveLength(2);
    expect(providerStore.calls).toHaveLength(1);
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledOnce();
  });

  it("consumes the user attempt before provider-global rejection without provider work", async () => {
    const userStore = allowAllRateLimitStore();
    const providerStore = new RecordingRateLimitStore(new InMemoryRateLimitStore());
    const fixture = await createRm034Fixture({ userStore, providerStore });

    await geocodeRequest(fixture.app, await rm034Cookie(1)).expect(200);
    await geocodeRequest(fixture.app, await rm034Cookie(2)).expect(429);

    expect(userStore.calls).toHaveLength(2);
    expect(providerStore.calls).toHaveLength(2);
    expect(providerStore.calls[1]).toMatchObject({
      key: '["nominatim-provider","nominatim"]',
      limit: 1,
      windowMs: 1_000
    });
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledOnce();
  });

  it("atomically gives one same-instant request the user slot", async () => {
    const userStore = new RecordingRateLimitStore(new InMemoryRateLimitStore());
    const fixture = await createRm034Fixture({
      userStore,
      providerStore: allowAllRateLimitStore(),
      userClock: () => 400
    });
    const auth = await rm034Cookie(1);

    const responses = await Promise.all([
      geocodeRequest(fixture.app, auth, "Concurrent A"),
      geocodeRequest(fixture.app, auth, "Concurrent B")
    ]);

    expect(responses.map((response) => response.status).sort()).toStrictEqual([200, 429]);
    expect(userStore.calls.map((call) => call.now)).toStrictEqual([400, 400]);
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledTimes(1);
  });

  it("atomically gives one same-instant cross-user request the provider-global slot", async () => {
    const providerStore = new RecordingRateLimitStore(new InMemoryRateLimitStore());
    const fixture = await createRm034Fixture({
      userStore: allowAllRateLimitStore(),
      providerStore,
      providerClock: () => 700
    });

    const responses = await Promise.all([
      geocodeRequest(fixture.app, await rm034Cookie(1), "Concurrent A"),
      geocodeRequest(fixture.app, await rm034Cookie(2), "Concurrent B")
    ]);

    expect(responses.map((response) => response.status).sort()).toStrictEqual([200, 429]);
    expect(providerStore.calls.map((call) => call.now)).toStrictEqual([700, 700]);
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledTimes(1);
  });
});

describe("RM-034 rate-limit privacy and repeated explicit calls", () => {
  it("returns the stable private 429 envelope", async () => {
    const address = "RM034_PRIVATE_RATE_LIMIT_ADDRESS";
    const fixture = await createRm034Fixture({
      userStore: new InMemoryRateLimitStore(),
      providerStore: allowAllRateLimitStore()
    });
    const auth = await rm034Cookie(1);
    await geocodeRequest(fixture.app, auth, address).expect(200);
    const response = await geocodeRequest(fixture.app, auth, address).expect(429);

    expect(response.body.error).toMatchObject({ code: "RATE_LIMITED", message: rateLimitedMessage });
    expect(response.body.error.requestId).toMatch(/^req_[a-f0-9]{32}$/);
    expect(Object.keys(response.body.error).sort()).toStrictEqual(["code", "message", "requestId"]);
    expect(response.text).not.toMatch(/geocoding-user|nominatim-provider|\["|internal count|windowMs|userId/i);
    expect(response.text).not.toContain(address);
  });

  it("calls the provider again for the same accepted address after both windows reset", async () => {
    const clock = new MutableRm034Clock(0);
    const fixture = await createRm034Fixture({
      userStore: new InMemoryRateLimitStore(),
      providerStore: new InMemoryRateLimitStore(),
      userClock: clock.read,
      providerClock: clock.read
    });
    const auth = await rm034Cookie(1);
    const address = "Exact repeated address";

    await geocodeRequest(fixture.app, auth, address).expect(200);
    clock.now = 1_000;
    await geocodeRequest(fixture.app, auth, address).expect(200);

    expect(fixture.provider.forwardGeocode).toHaveBeenCalledTimes(2);
    expect(fixture.provider.forwardGeocode).toHaveBeenNthCalledWith(1, address);
    expect(fixture.provider.forwardGeocode).toHaveBeenNthCalledWith(2, address);
  });
});
