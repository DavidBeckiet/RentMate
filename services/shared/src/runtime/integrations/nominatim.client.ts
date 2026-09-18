export const NOMINATIM_TIMEOUT_MS = 5_000;

export interface NominatimCandidate {
  readonly displayName: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface NominatimReverseResult {
  readonly addressText: string;
  readonly areaName: string;
}

export interface NominatimClient {
  readonly forwardGeocode: (addressText: string) => Promise<readonly NominatimCandidate[]>;
  readonly reverseGeocode: (latitude: number, longitude: number) => Promise<NominatimReverseResult | null>;
}

type FetchImplementation = typeof fetch;

export interface NominatimClientConfiguration {
  readonly baseUrl: string;
  readonly userAgent: string;
  readonly fetchImpl?: FetchImplementation;
  readonly timeoutMs?: number;
}

export class NominatimClientError extends Error {
  constructor() {
    super("The Nominatim operation failed.");
    this.name = "NominatimClientError";
  }
}

function normalizeBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      throw new Error("Invalid Nominatim base URL.");
    }

    return url.href.replace(/\/$/, "");
  } catch {
    throw new Error("Nominatim base URL must be an absolute HTTP or HTTPS URL.");
  }
}

function normalizeUserAgent(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || /[\r\n]/.test(normalized)) {
    throw new Error("Nominatim User-Agent must not be blank or contain line breaks.");
  }

  return normalized;
}

function normalizeTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Nominatim timeout must be a positive safe integer.");
  }

  return value;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const numericTextPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function normalizeCoordinate(value: unknown, minimum: number, maximum: number): number {
  let coordinate: number;
  if (typeof value === "number") {
    coordinate = value;
  } else if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.length === 0 || !numericTextPattern.test(normalized)) throw new NominatimClientError();
    coordinate = Number(normalized);
  } else {
    throw new NominatimClientError();
  }

  if (!Number.isFinite(coordinate) || coordinate < minimum || coordinate > maximum) {
    throw new NominatimClientError();
  }

  return coordinate;
}

function normalizeCandidate(value: unknown): NominatimCandidate {
  if (!isPlainObject(value)) throw new NominatimClientError();
  const displayName = value.display_name;
  if (typeof displayName !== "string" || displayName.trim().length === 0) throw new NominatimClientError();

  return Object.freeze({
    displayName: displayName.trim(),
    latitude: normalizeCoordinate(value.lat, -90, 90),
    longitude: normalizeCoordinate(value.lon, -180, 180)
  });
}

function normalizeResponse(value: unknown): readonly NominatimCandidate[] {
  if (!Array.isArray(value)) throw new NominatimClientError();
  return Object.freeze(value.slice(0, 5).map(normalizeCandidate));
}

function normalizedAddressPart(address: Readonly<Record<string, unknown>>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = address[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function truncateCodePoints(value: string, maximumLength: number): string {
  return [...value].slice(0, maximumLength).join("").trim();
}

function normalizeReverseResponse(value: unknown): NominatimReverseResult | null {
  if (!isPlainObject(value)) throw new NominatimClientError();
  if (typeof value.error === "string") return null;

  const displayName = value.display_name;
  if (typeof displayName !== "string" || displayName.trim().length === 0) throw new NominatimClientError();
  if (!isPlainObject(value.address)) throw new NominatimClientError();

  const address = value.address;
  const areaParts = [
    normalizedAddressPart(address, ["neighbourhood", "quarter", "suburb", "residential", "village", "town"]),
    normalizedAddressPart(address, ["city", "municipality", "province", "state"])
  ].filter((part): part is string => part !== null);
  const uniqueAreaParts = areaParts.filter(
    (part, index) => areaParts.findIndex((candidate) => candidate.localeCompare(part, "vi", { sensitivity: "base" }) === 0) === index
  );
  const areaName = truncateCodePoints(uniqueAreaParts.join(", ") || displayName.trim(), 120);
  if (!areaName) throw new NominatimClientError();

  return Object.freeze({
    addressText: truncateCodePoints(displayName.trim(), 500),
    areaName
  });
}

export const unavailableNominatimClient = Object.freeze<NominatimClient>({
  async forwardGeocode(): Promise<readonly NominatimCandidate[]> {
    throw new NominatimClientError();
  },
  async reverseGeocode(): Promise<NominatimReverseResult | null> {
    throw new NominatimClientError();
  }
});

export function createNominatimClient(configuration: NominatimClientConfiguration): NominatimClient {
  const baseUrl = normalizeBaseUrl(configuration.baseUrl);
  const userAgent = normalizeUserAgent(configuration.userAgent);
  const timeoutMs = normalizeTimeout(configuration.timeoutMs ?? NOMINATIM_TIMEOUT_MS);
  const fetchImpl = configuration.fetchImpl ?? globalThis.fetch;

  return Object.freeze({
    async forwardGeocode(addressText: string): Promise<readonly NominatimCandidate[]> {
      const url = new URL("search", `${baseUrl}/`);
      url.searchParams.set("q", addressText.trim());
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "5");

      try {
        const response = await fetchImpl(url, {
          method: "GET",
          headers: {
            "User-Agent": userAgent
          },
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (!response.ok) throw new NominatimClientError();
        return normalizeResponse(await response.json());
      } catch {
        throw new NominatimClientError();
      }
    },

    async reverseGeocode(latitude: number, longitude: number): Promise<NominatimReverseResult | null> {
      const url = new URL("reverse", `${baseUrl}/`);
      url.searchParams.set("lat", String(latitude));
      url.searchParams.set("lon", String(longitude));
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("layer", "address");
      url.searchParams.set("accept-language", "vi");

      try {
        const response = await fetchImpl(url, {
          method: "GET",
          headers: {
            "User-Agent": userAgent
          },
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (!response.ok) throw new NominatimClientError();
        return normalizeReverseResponse(await response.json());
      } catch {
        throw new NominatimClientError();
      }
    }
  });
}
