import { describe, expect, it, vi } from "vitest";
import {
  createNominatimClient,
  NominatimClientError,
  NOMINATIM_TIMEOUT_MS
} from "../src/integrations/nominatim.client.js";
import {
  allowAllRateLimitStore,
  createRecordingProvider,
  createRm034Fixture,
  geocodeRequest,
  jsonResponse,
  providerCandidate,
  rm034Cookie
} from "./helpers/rm034-geocoding-fixture.js";

const userAgent = "RentMate RM034 verification";
const privateAddress = "RM034_ADDRESS spaces, Việt Nam & # ? / + https://evil.test/override";

async function publicResponseForFetch(fetchImpl: typeof fetch, addressText = privateAddress) {
  const client = createNominatimClient({ baseUrl: "https://provider.test/nominatim", userAgent, fetchImpl });
  const provider = createRecordingProvider((address) => client.forwardGeocode(address));
  const fixture = await createRm034Fixture({
    provider,
    userStore: allowAllRateLimitStore(),
    providerStore: allowAllRateLimitStore()
  });
  const response = await geocodeRequest(fixture.app, await rm034Cookie(), addressText);
  return { fixture, response };
}

describe("RM-034 Nominatim request construction", () => {
  it.each([
    ["https://example.test", "https://example.test/search"],
    ["https://example.test/", "https://example.test/search"],
    ["https://example.test/nominatim", "https://example.test/nominatim/search"],
    ["https://example.test/nominatim/", "https://example.test/nominatim/search"]
  ])("preserves the configured base form %s", async (baseUrl, expectedTarget) => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse([]);
    });
    const client = createNominatimClient({ baseUrl, userAgent, fetchImpl });

    await client.forwardGeocode(`  ${privateAddress}  `);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [input, init] = fetchImpl.mock.calls[0]!;
    const url = new URL(input as URL);
    expect(`${url.origin}${url.pathname}`).toBe(expectedTarget);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("example.test");
    expect([...url.searchParams.entries()]).toStrictEqual([
      ["q", privateAddress],
      ["format", "jsonv2"],
      ["limit", "5"]
    ]);
    expect(init).toMatchObject({ method: "GET", headers: { "User-Agent": userAgent } });
    expect(Object.keys(init?.headers as Record<string, string>)).toStrictEqual(["User-Agent"]);
    expect(JSON.stringify(init?.headers)).not.toMatch(/authorization|cookie|jwt|email|phone|RM034_ADDRESS/i);
  });

  it("uses the locked 5000 ms timeout and aborts one unresolved attempt without retry", async () => {
    const controller = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("private timeout", "AbortError")), {
            once: true
          });
        })
    );
    const client = createNominatimClient({ baseUrl: "https://provider.test", userAgent, fetchImpl });

    try {
      const pending = client.forwardGeocode(privateAddress);
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
      expect(NOMINATIM_TIMEOUT_MS).toBe(5_000);
      expect(timeoutSpy).toHaveBeenCalledWith(5_000);
      controller.abort();
      await expect(pending).rejects.toStrictEqual(new NominatimClientError());
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});

describe("RM-034 provider failures", () => {
  it.each([
    new TypeError("RM034_PRIVATE_NETWORK_TYPE_ERROR"),
    new Error("RM034_PRIVATE_GENERIC_ERROR"),
    new DOMException("RM034_PRIVATE_ABORT_ERROR", "AbortError")
  ])("maps a sanitized network failure to public 502 with one fetch", async (failure) => {
    const fetchImpl = vi.fn(async () => Promise.reject(failure));
    const { response } = await publicResponseForFetch(fetchImpl);

    expect(response.status).toBe(502);
    expect(response.body.error).toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      message: "The geocoding provider is unavailable."
    });
    expect(response.body.error.details).toBeUndefined();
    expect(response.text).not.toContain(failure.message);
    expect(response.text).not.toContain(privateAddress);
    expect(response.text).not.toContain("provider.test");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([400, 401, 403, 404, 429, 500, 503])(
    "maps upstream HTTP %s to 502 PROVIDER_UNAVAILABLE without retry",
    async (status) => {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({ privateBody: "RM034_PRIVATE_PROVIDER_BODY", q: privateAddress }, status)
      );
      const { response } = await publicResponseForFetch(fetchImpl);

      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe("PROVIDER_UNAVAILABLE");
      expect(response.body.error.message).toBe("The geocoding provider is unavailable.");
      expect(response.body.error.details).toBeUndefined();
      expect(response.text).not.toContain("RM034_PRIVATE_PROVIDER_BODY");
      expect(response.text).not.toContain("RM034_PROVIDER_HEADER");
      expect(response.text).not.toContain(privateAddress);
      expect(fetchImpl).toHaveBeenCalledOnce();
      if (status === 429) expect(response.body.error.code).not.toBe("RATE_LIMITED");
    }
  );

  it("maps a 200 response with invalid JSON to a private 502 without retry", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("RM034_PRIVATE_INVALID_JSON {", {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
    );
    const { response } = await publicResponseForFetch(fetchImpl);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(response.text).not.toContain("RM034_PRIVATE_INVALID_JSON");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([null, {}, "string", 123, true])("rejects invalid top-level provider payload %#", async (payload) => {
    const fetchImpl = vi.fn(async () => jsonResponse(payload));
    const { response } = await publicResponseForFetch(fetchImpl);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("RM-034 provider response normalization", () => {
  it("returns an exact empty response without exposing provider state", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const { fixture, response } = await publicResponseForFetch(fetchImpl);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({ data: [] });
    expect(fixture.executor.queries).toHaveLength(1);
    expect(fixture.draftState).toStrictEqual({
      id: 700,
      status: "DRAFT",
      addressText: "Unchanged draft address",
      latitude: null,
      longitude: null
    });
  });

  it("returns exactly five safe candidates in provider order", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(Array.from({ length: 5 }, (_, index) => providerCandidate(index + 1)))
    );
    const { response } = await publicResponseForFetch(fetchImpl);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(5);
    expect(response.body.data.map((candidate: { displayName: string }) => candidate.displayName)).toStrictEqual([
      "Candidate 1",
      "Candidate 2",
      "Candidate 3",
      "Candidate 4",
      "Candidate 5"
    ]);
    for (const candidate of response.body.data as Record<string, unknown>[]) {
      expect(Object.keys(candidate).sort()).toStrictEqual(["displayName", "latitude", "longitude"].sort());
    }
    expect(JSON.stringify(response.body)).not.toMatch(
      /place_id|osm_id|osm_type|licence|class|importance|boundingbox|extratags|namedetails|arbitraryUnknownField|nestedRawMetadata|"lat"|"lon"/
    );
  });

  it("caps a provider response at the first five without sorting, deduplication, or filtering", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        providerCandidate(5),
        providerCandidate(4),
        providerCandidate(4),
        providerCandidate(2),
        providerCandidate(1),
        providerCandidate(6, { display_name: "Sixth must not appear" })
      ])
    );
    const { response } = await publicResponseForFetch(fetchImpl);

    expect(response.status).toBe(200);
    expect(response.body.data.map((candidate: { displayName: string }) => candidate.displayName)).toStrictEqual([
      "Candidate 5",
      "Candidate 4",
      "Candidate 4",
      "Candidate 2",
      "Candidate 1"
    ]);
    expect(response.text).not.toContain("Sixth must not appear");
  });

  it("normalizes valid display names while preserving internal Unicode text", async () => {
    const payload = [
      providerCandidate(1, { display_name: "ASCII name" }),
      providerCandidate(2, { display_name: "  Đường Nguyễn Huệ  " }),
      providerCandidate(3, { display_name: "  Internal   spacing  " })
    ];
    const client = createNominatimClient({
      baseUrl: "https://provider.test",
      userAgent,
      fetchImpl: vi.fn(async () => jsonResponse(payload))
    });

    expect((await client.forwardGeocode("Address")).map((candidate) => candidate.displayName)).toStrictEqual([
      "ASCII name",
      "Đường Nguyễn Huệ",
      "Internal   spacing"
    ]);
  });

  it.each([undefined, null, 17, true, {}, [], "", "   "])(
    "rejects malformed display_name %# as a whole-call failure",
    async (displayName) => {
      const client = createNominatimClient({
        baseUrl: "https://provider.test",
        userAgent,
        fetchImpl: vi.fn(async () => jsonResponse([providerCandidate(1, { display_name: displayName })]))
      });
      await expect(client.forwardGeocode("Address")).rejects.toBeInstanceOf(NominatimClientError);
    }
  );

  it.each([
    ["10", "106", 10, 106],
    ["10.123456789", "106.987654321", 10.123456789, 106.987654321],
    ["-0", "-0", -0, -0],
    ["-90", "-180", -90, -180],
    ["90", "180", 90, 180],
    [10.772341987654, 106.697912345678, 10.772341987654, 106.697912345678]
  ])("preserves valid coordinate forms %#", async (lat, lon, expectedLatitude, expectedLongitude) => {
    const client = createNominatimClient({
      baseUrl: "https://provider.test",
      userAgent,
      fetchImpl: vi.fn(async () => jsonResponse([providerCandidate(1, { lat, lon })]))
    });
    const [candidate] = await client.forwardGeocode("Address");
    expect(candidate).toMatchObject({ latitude: expectedLatitude, longitude: expectedLongitude });
  });

  it.each([
    ["lat", ""],
    ["lat", " "],
    ["lat", "10abc"],
    ["lat", "1e999"],
    ["lat", "NaN"],
    ["lat", "Infinity"],
    ["lat", "-Infinity"],
    ["lat", null],
    ["lat", true],
    ["lat", {}],
    ["lat", []],
    ["lat", "-90.000001"],
    ["lat", "90.000001"],
    ["lon", "-180.000001"],
    ["lon", "180.000001"]
  ])("rejects invalid coordinate %s=%#", async (field, value) => {
    const client = createNominatimClient({
      baseUrl: "https://provider.test",
      userAgent,
      fetchImpl: vi.fn(async () => jsonResponse([providerCandidate(1, { [field]: value })]))
    });
    await expect(client.forwardGeocode("Address")).rejects.toBeInstanceOf(NominatimClientError);
  });

  it.each([0, 2, 4])("fails without partial data for a malformed considered candidate at index %s", async (index) => {
    const payload = Array.from({ length: 5 }, (_, candidateIndex) => providerCandidate(candidateIndex + 1));
    payload[index] = providerCandidate(index + 1, { lat: "invalid" });
    const fetchImpl = vi.fn(async () => jsonResponse(payload));
    const { response } = await publicResponseForFetch(fetchImpl);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(response.body.data).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("ignores a malformed sixth provider item after five valid candidates", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([...Array.from({ length: 5 }, (_, index) => providerCandidate(index + 1)), null])
    );
    const { response } = await publicResponseForFetch(fetchImpl);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(5);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
