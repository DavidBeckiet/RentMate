import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createNominatimClient, NominatimClientError } from "../src/integrations/nominatim.client.js";
import { InMemoryRateLimitStore } from "../src/shared/middleware/rate-limit.js";
import {
  allowAllRateLimitStore,
  createRecordingProvider,
  createRm034Fixture,
  geocodeRequest,
  jsonResponse,
  providerCandidate,
  RecordingRateLimitStore,
  rm034Cookie,
  rm034NowSeconds,
  rm034Origin,
  serializedLogs
} from "./helpers/rm034-geocoding-fixture.js";

function expectNoGeocodingWork(
  userStore: RecordingRateLimitStore,
  providerStore: RecordingRateLimitStore,
  provider: ReturnType<typeof createRecordingProvider>
): void {
  expect(userStore.calls).toHaveLength(0);
  expect(providerStore.calls).toHaveLength(0);
  expect(provider.forwardGeocode).not.toHaveBeenCalled();
}

describe("RM-034 V1-22 authentication and Origin", () => {
  it("allows only an active LANDLORD to reach the provider", async () => {
    const userStore = allowAllRateLimitStore();
    const providerStore = allowAllRateLimitStore();
    const fixture = await createRm034Fixture({ userStore, providerStore });

    await geocodeRequest(fixture.app, await rm034Cookie()).expect(200);

    expect(userStore.calls).toHaveLength(1);
    expect(userStore.calls[0]).toMatchObject({ key: '["geocoding-user","1"]', limit: 1, windowMs: 1_000 });
    expect(providerStore.calls).toHaveLength(1);
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledOnce();
    expect(fixture.executor.queries).toHaveLength(1);
  });

  it.each([
    ["missing session", null, 1, "LANDLORD"],
    ["invalid token", "rentmate_session=invalid", 1, "LANDLORD"],
    ["expired token", "expired", 1, "LANDLORD"],
    ["inactive landlord", "inactive", 5, "LANDLORD"],
    ["tenant", "role", 3, "TENANT"],
    ["admin", "role", 4, "ADMIN"]
  ] as const)("rejects %s before geocoding work", async (_label, cookieKind, userId, role) => {
    const userStore = allowAllRateLimitStore();
    const providerStore = allowAllRateLimitStore();
    const fixture = await createRm034Fixture({ userStore, providerStore });
    const pending = request(fixture.app)
      .post("/api/v1/geocoding/forward")
      .set("Origin", rm034Origin)
      .send({ addressText: "Address" });
    let cookie: string | null = cookieKind;
    if (cookieKind === "expired") cookie = await rm034Cookie(userId, role, rm034NowSeconds - 7_201);
    if (cookieKind === "inactive" || cookieKind === "role") cookie = await rm034Cookie(userId, role);
    const response = cookie === null ? await pending : await pending.set("Cookie", cookie);

    expect(response.status).toBe(role === "LANDLORD" ? 401 : 403);
    expectNoGeocodingWork(userStore, providerStore, fixture.provider);
  });

  it.each([
    ["missing", null, 403],
    ["denied", "https://denied.example", 403],
    ["allowed", rm034Origin, 200]
  ] as const)("handles %s Origin before route-specific work", async (_label, origin, status) => {
    const userStore = allowAllRateLimitStore();
    const providerStore = allowAllRateLimitStore();
    const fixture = await createRm034Fixture({ userStore, providerStore });
    const pending = request(fixture.app)
      .post("/api/v1/geocoding/forward")
      .set("Cookie", await rm034Cookie())
      .send({ addressText: "Address" });
    const response = origin === null ? await pending : await pending.set("Origin", origin);

    expect(response.status).toBe(status);
    if (status === 403) {
      expectNoGeocodingWork(userStore, providerStore, fixture.provider);
      expect(fixture.executor.queries).toHaveLength(0);
    } else {
      expect(fixture.provider.forwardGeocode).toHaveBeenCalledOnce();
    }
  });
});

describe("RM-034 V1-22 request discipline", () => {
  it("keeps malformed JSON at 400 before validation and throttling", async () => {
    const userStore = allowAllRateLimitStore();
    const providerStore = allowAllRateLimitStore();
    const fixture = await createRm034Fixture({ userStore, providerStore });
    const response = await request(fixture.app)
      .post("/api/v1/geocoding/forward")
      .set("Origin", rm034Origin)
      .set("Cookie", await rm034Cookie())
      .set("Content-Type", "application/json")
      .send('{"addressText":')
      .expect(400);

    expect(response.body.error.code).toBe("MALFORMED_REQUEST");
    expect(response.status).not.toBe(422);
    expect(response.status).not.toBe(429);
    expect(response.status).not.toBe(502);
    expectNoGeocodingWork(userStore, providerStore, fixture.provider);
  });

  it("rejects a missing body before both limiters", async () => {
    const userStore = allowAllRateLimitStore();
    const providerStore = allowAllRateLimitStore();
    const fixture = await createRm034Fixture({ userStore, providerStore });
    await request(fixture.app)
      .post("/api/v1/geocoding/forward")
      .set("Origin", rm034Origin)
      .set("Cookie", await rm034Cookie())
      .expect(422);
    expectNoGeocodingWork(userStore, providerStore, fixture.provider);
  });

  it.each([
    null,
    [],
    "string",
    17,
    true,
    {},
    { addressText: null },
    { addressText: 17 },
    { addressText: true },
    { addressText: {} },
    { addressText: [] },
    { addressText: "", extra: "unknown" },
    { addressText: "Address", extra: 1 },
    { addressText: "Address", extra: 1, another: 2 },
    { addressText: "Address", listingId: 7 },
    { addressText: "Address", latitude: 10, longitude: 106 },
    { addressText: "Address", status: "APPROVED", userId: 1 }
  ])("rejects invalid body shape %# without consuming quota", async (body) => {
    const userStore = allowAllRateLimitStore();
    const providerStore = allowAllRateLimitStore();
    const fixture = await createRm034Fixture({ userStore, providerStore });
    const response = await request(fixture.app)
      .post("/api/v1/geocoding/forward")
      .set("Origin", rm034Origin)
      .set("Cookie", await rm034Cookie())
      .set("Content-Type", "application/json")
      .send(JSON.stringify(body));

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expectNoGeocodingWork(userStore, providerStore, fixture.provider);
  });

  it.each(["?foo=bar", "?a=1&b=2"])("rejects query string %s before throttling", async (query) => {
    const userStore = allowAllRateLimitStore();
    const providerStore = allowAllRateLimitStore();
    const fixture = await createRm034Fixture({ userStore, providerStore });
    await request(fixture.app)
      .post(`/api/v1/geocoding/forward${query}`)
      .set("Origin", rm034Origin)
      .set("Cookie", await rm034Cookie())
      .send({ addressText: "Address" })
      .expect(422);
    expectNoGeocodingWork(userStore, providerStore, fixture.provider);
  });

  it("trims only address edges and preserves internal spacing", async () => {
    const fixture = await createRm034Fixture({
      userStore: allowAllRateLimitStore(),
      providerStore: allowAllRateLimitStore()
    });
    const auth = await rm034Cookie();
    await geocodeRequest(fixture.app, auth, "Valid address").expect(200);
    await geocodeRequest(fixture.app, auth, "  Valid address  ").expect(200);
    await geocodeRequest(fixture.app, auth, "  101   Example Street  ").expect(200);

    expect(fixture.provider.forwardGeocode.mock.calls.map(([address]) => address)).toStrictEqual([
      "Valid address",
      "Valid address",
      "101   Example Street"
    ]);
    expect(fixture.provider.forwardGeocode).not.toHaveBeenCalledWith(expect.stringMatching(/Ho Chi Minh City|Vietnam/));
  });

  it("counts Unicode code points at the exact 500/501 boundary", async () => {
    const userStore = allowAllRateLimitStore();
    const providerStore = allowAllRateLimitStore();
    const fixture = await createRm034Fixture({ userStore, providerStore });
    const auth = await rm034Cookie();
    const fiveHundred = "😀".repeat(500);
    const fiveHundredOne = "😀".repeat(501);

    await geocodeRequest(fixture.app, auth, fiveHundred).expect(200);
    const callsAfterAcceptedBoundary = { user: userStore.calls.length, provider: providerStore.calls.length };
    await geocodeRequest(fixture.app, auth, fiveHundredOne).expect(422);

    expect(fixture.provider.forwardGeocode).toHaveBeenCalledOnce();
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledWith(fiveHundred);
    expect(userStore.calls).toHaveLength(callsAfterAcceptedBoundary.user);
    expect(providerStore.calls).toHaveLength(callsAfterAcceptedBoundary.provider);
  });
});

describe("RM-034 validation ordering and mutation isolation", () => {
  it("does not spend user quota on an invalid request immediately followed by a valid request", async () => {
    const userStore = new RecordingRateLimitStore(new InMemoryRateLimitStore());
    const providerStore = allowAllRateLimitStore();
    const fixture = await createRm034Fixture({ userStore, providerStore });
    const auth = await rm034Cookie(1);

    await geocodeRequest(fixture.app, auth, "   ").expect(422);
    await geocodeRequest(fixture.app, auth, "Valid address").expect(200);

    expect(userStore.calls).toHaveLength(1);
    expect(providerStore.calls).toHaveLength(1);
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledOnce();
  });

  it("does not spend provider-global quota when another user's request is invalid", async () => {
    const userStore = allowAllRateLimitStore();
    const providerStore = new RecordingRateLimitStore(new InMemoryRateLimitStore());
    const fixture = await createRm034Fixture({ userStore, providerStore });

    await geocodeRequest(fixture.app, await rm034Cookie(1), "   ").expect(422);
    await geocodeRequest(fixture.app, await rm034Cookie(2), "Valid address").expect(200);

    expect(providerStore.calls).toHaveLength(1);
    expect(fixture.provider.forwardGeocode).toHaveBeenCalledOnce();
  });

  it.each(["success", "empty", "failure"] as const)("performs no listing or database mutation on %s", async (mode) => {
    const implementation =
      mode === "success"
        ? async () => [{ displayName: "Candidate", latitude: 10, longitude: 106 }]
        : mode === "empty"
          ? async () => []
          : async () => Promise.reject(new NominatimClientError());
    const fixture = await createRm034Fixture({
      provider: createRecordingProvider(implementation),
      userStore: allowAllRateLimitStore(),
      providerStore: allowAllRateLimitStore()
    });
    const before = JSON.stringify(fixture.draftState);
    const response = await geocodeRequest(fixture.app, await rm034Cookie());

    expect(response.status).toBe(mode === "failure" ? 502 : 200);
    expect(JSON.stringify(fixture.draftState)).toBe(before);
    expect(fixture.executor.queries).toHaveLength(1);
    expect(fixture.executor.queries[0]!.text).toMatch(/^\s*SELECT\b/i);
    expect(fixture.executor.queries[0]!.text).toMatch(/\bFROM\s+users\b/i);
    expect(fixture.executor.queries[0]!.text).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b|\blistings\b|moderation|latitude|longitude|status/i
    );
  });
});

describe("RM-034 geocoding logging privacy", () => {
  it("never logs request, provider, token, contact, or coordinate sentinels", async () => {
    const address = "RM034_SENSITIVE_ADDRESS";
    const contactSentinels = ["landlord-rm034@example.test", "+8499999034", "10.123456789", "106.987654321"];
    const successProvider = createRecordingProvider(async () => [
      {
        displayName: contactSentinels[0]!,
        latitude: Number(contactSentinels[2]),
        longitude: Number(contactSentinels[3])
      }
    ]);
    const successFixture = await createRm034Fixture({
      provider: successProvider,
      userStore: new InMemoryRateLimitStore(),
      providerStore: allowAllRateLimitStore()
    });
    const cookie = await rm034Cookie();
    const token = cookie.split("=", 2)[1]!;
    await geocodeRequest(successFixture.app, cookie, address).expect(200);
    await geocodeRequest(successFixture.app, cookie, address).expect(429);

    const providerFailureSentinel = "RM034_PRIVATE_PROVIDER_FAILURE";
    const realClient = createNominatimClient({
      baseUrl: "https://provider.test/private-query",
      userAgent: "RentMate RM034",
      fetchImpl: vi.fn(async () => Promise.reject(new TypeError(providerFailureSentinel)))
    });
    const failureFixture = await createRm034Fixture({
      provider: createRecordingProvider((value) => realClient.forwardGeocode(value)),
      userStore: allowAllRateLimitStore(),
      providerStore: allowAllRateLimitStore()
    });
    await geocodeRequest(failureFixture.app, cookie, address).expect(502);

    const timeoutSentinel = "RM034_PRIVATE_TIMEOUT_LOG";
    const timeoutClient = createNominatimClient({
      baseUrl: "https://provider.test/timeout-private-query",
      userAgent: "RentMate RM034",
      fetchImpl: vi.fn(async () => Promise.reject(new DOMException(timeoutSentinel, "AbortError")))
    });
    const timeoutFixture = await createRm034Fixture({
      provider: createRecordingProvider((value) => timeoutClient.forwardGeocode(value)),
      userStore: allowAllRateLimitStore(),
      providerStore: allowAllRateLimitStore()
    });
    await geocodeRequest(timeoutFixture.app, cookie, address).expect(502);

    const malformedFixture = await createRm034Fixture({
      provider: createRecordingProvider((value) =>
        createNominatimClient({
          baseUrl: "https://provider.test",
          userAgent: "RentMate RM034",
          fetchImpl: vi.fn(async () => jsonResponse([providerCandidate(1, { lat: "RM034_BAD_COORDINATE" })]))
        }).forwardGeocode(value)
      ),
      userStore: allowAllRateLimitStore(),
      providerStore: allowAllRateLimitStore()
    });
    await geocodeRequest(malformedFixture.app, cookie, address).expect(502);

    const logs = serializedLogs([
      ...successFixture.logs,
      ...failureFixture.logs,
      ...timeoutFixture.logs,
      ...malformedFixture.logs
    ]);
    for (const sentinel of [
      address,
      token,
      cookie,
      providerFailureSentinel,
      timeoutSentinel,
      "provider.test/private-query",
      "provider.test/timeout-private-query",
      "RM034_BAD_COORDINATE",
      ...contactSentinels
    ]) {
      expect(logs).not.toContain(sentinel);
    }
    expect(logs).toContain("HTTP request completed");
  });
});
