import { describe, expect, it, vi } from "vitest";
import {
  createNominatimClient,
  NominatimClientError,
  NOMINATIM_TIMEOUT_MS
} from "../src/integrations/nominatim.client.js";

const providerCandidate = (index = 1) => ({
  place_id: 900 + index,
  display_name: ` Candidate ${index} `,
  lat: `10.77${index}`,
  lon: `106.69${index}`,
  licence: "private provider field"
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("RM-033 Nominatim client", () => {
  it("constructs one bounded identified forward-search request", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse([providerCandidate()]);
    });
    const client = createNominatimClient({
      baseUrl: "https://provider.test/nominatim/",
      userAgent: "RentMate tests",
      fetchImpl
    });

    await client.forwardGeocode("  101 Example Street & Ward  ");

    expect(NOMINATIM_TIMEOUT_MS).toBe(5_000);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [input, init] = fetchImpl.mock.calls[0]!;
    const url = new URL(input as URL);
    expect(url.origin + url.pathname).toBe("https://provider.test/nominatim/search");
    expect([...url.searchParams.entries()]).toStrictEqual([
      ["q", "101 Example Street & Ward"],
      ["format", "jsonv2"],
      ["limit", "5"]
    ]);
    expect(init?.method).toBe("GET");
    expect(init?.headers).toStrictEqual({ "User-Agent": "RentMate tests" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("normalizes provider candidates without leaking raw fields or rounding", async () => {
    const raw = {
      ...providerCandidate(),
      display_name: "  Precise location  ",
      lat: "10.772341987654",
      lon: 106.697912345678
    };
    const client = createNominatimClient({
      baseUrl: "https://provider.test",
      userAgent: "RentMate tests",
      fetchImpl: vi.fn(async () => jsonResponse([raw]))
    });

    const candidates = await client.forwardGeocode("Address");

    expect(candidates).toStrictEqual([
      { displayName: "Precise location", latitude: 10.772341987654, longitude: 106.697912345678 }
    ]);
    expect(Object.keys(candidates[0]!).sort()).toStrictEqual(["displayName", "latitude", "longitude"].sort());
    expect(JSON.stringify(candidates)).not.toMatch(/place_id|licence|"lat"|"lon"/);
  });

  it("returns an empty result and caps valid provider-order output at five", async () => {
    const emptyClient = createNominatimClient({
      baseUrl: "https://provider.test",
      userAgent: "RentMate tests",
      fetchImpl: vi.fn(async () => jsonResponse([]))
    });
    expect(await emptyClient.forwardGeocode("Address")).toStrictEqual([]);

    const client = createNominatimClient({
      baseUrl: "https://provider.test",
      userAgent: "RentMate tests",
      fetchImpl: vi.fn(async () => jsonResponse(Array.from({ length: 6 }, (_, index) => providerCandidate(index + 1))))
    });
    expect((await client.forwardGeocode("Address")).map((candidate) => candidate.displayName)).toStrictEqual([
      "Candidate 1",
      "Candidate 2",
      "Candidate 3",
      "Candidate 4",
      "Candidate 5"
    ]);
  });

  it.each([
    { display_name: "", lat: "10", lon: "106" },
    { display_name: "Place", lat: "10abc", lon: "106" },
    { display_name: "Place", lat: "91", lon: "106" },
    { display_name: "Place", lat: "10", lon: "181" },
    null
  ])("fails the whole considered response for malformed candidate %#", async (candidate) => {
    const client = createNominatimClient({
      baseUrl: "https://provider.test",
      userAgent: "RentMate tests",
      fetchImpl: vi.fn(async () => jsonResponse([providerCandidate(), candidate]))
    });
    await expect(client.forwardGeocode("Address")).rejects.toBeInstanceOf(NominatimClientError);
  });

  it("does not inspect malformed provider entries beyond the five-result boundary", async () => {
    const client = createNominatimClient({
      baseUrl: "https://provider.test",
      userAgent: "RentMate tests",
      fetchImpl: vi.fn(async () => jsonResponse([...Array.from({ length: 5 }, () => providerCandidate()), null]))
    });
    await expect(client.forwardGeocode("Address")).resolves.toHaveLength(5);
  });

  it.each([{}, { data: [] }, "invalid", null])("rejects invalid top-level payload %#", async (payload) => {
    const client = createNominatimClient({
      baseUrl: "https://provider.test",
      userAgent: "RentMate tests",
      fetchImpl: vi.fn(async () => jsonResponse(payload))
    });
    await expect(client.forwardGeocode("Address")).rejects.toBeInstanceOf(NominatimClientError);
  });

  it.each([429, 500])("maps upstream HTTP %s without retry", async (status) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ private: "provider response" }, status));
    const client = createNominatimClient({ baseUrl: "https://provider.test", userAgent: "RentMate", fetchImpl });
    await expect(client.forwardGeocode("Sensitive address")).rejects.toStrictEqual(new NominatimClientError());
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([new Error("private network detail"), new DOMException("private abort detail", "AbortError")])(
    "sanitizes network or timeout rejection without retry",
    async (failure) => {
      const fetchImpl = vi.fn(async () => Promise.reject(failure));
      const client = createNominatimClient({
        baseUrl: "https://provider.test",
        userAgent: "RentMate",
        fetchImpl,
        timeoutMs: 5_000
      });
      await expect(client.forwardGeocode("Sensitive address")).rejects.toStrictEqual(new NominatimClientError());
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  );
});
