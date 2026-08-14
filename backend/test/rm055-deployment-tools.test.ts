import { describe, expect, it, vi } from "vitest";
import type { EnvironmentSource } from "../src/config/env.js";
import { readProviderCheckConfiguration, runProviderChecks } from "../src/deployment/provider-check.js";
import {
  productionSmokeEndpointInventory,
  ProductionSmokeError,
  readProductionSmokeConfiguration,
  runProductionSmoke
} from "../src/deployment/production-smoke.js";
import {
  productionBackendEnvironmentVariableNames,
  ProductionEnvironmentValidationError,
  validateProductionEnvironment
} from "../src/deployment/validate-production-environment.js";

const validProductionEnvironment: EnvironmentSource = Object.freeze({
  NODE_ENV: "production",
  PORT: "4000",
  FRONTEND_ORIGIN: "https://app.rentmate.example",
  LOG_LEVEL: "info",
  DB_HOST: "postgres.internal",
  DB_PORT: "5432",
  DB_NAME: "rentmate",
  DB_USER: "rentmate_app",
  DB_PASSWORD: "operator-managed-database-secret",
  DB_POOL_MAX: "10",
  DB_CONNECTION_TIMEOUT_MS: "5000",
  DB_IDLE_TIMEOUT_MS: "30000",
  JWT_SECRET: "operator-managed-jwt-secret",
  JWT_EXPIRES_IN_SECONDS: "7200",
  BCRYPT_COST: "12",
  COOKIE_SECURE: "true",
  CLOUDINARY_CLOUD_NAME: "rentmate-production",
  CLOUDINARY_API_KEY: "operator-managed-cloudinary-key",
  CLOUDINARY_API_SECRET: "operator-managed-cloudinary-secret",
  NOMINATIM_BASE_URL: "https://nominatim.openstreetmap.org",
  NOMINATIM_USER_AGENT: "RentMate production operator@example.com",
  MAX_IMAGES_PER_LISTING: "8",
  MAX_IMAGE_BYTES: "5242880",
  DEPLOYMENT_REGION: "HO_CHI_MINH_CITY_VN",
  MAX_SEARCH_RADIUS_KM: "50",
  NEXT_PUBLIC_API_BASE_URL: "https://api.rentmate.example",
  RENTMATE_SMOKE_PUBLIC_LISTING_ID: "42",
  RENTMATE_SMOKE_TENANT_EMAIL: "smoke.tenant@example.com",
  RENTMATE_SMOKE_TENANT_PASSWORD: "tenant-smoke-secret",
  RENTMATE_SMOKE_LANDLORD_EMAIL: "smoke.landlord@example.com",
  RENTMATE_SMOKE_LANDLORD_PASSWORD: "landlord-smoke-secret",
  RENTMATE_SMOKE_ADMIN_EMAIL: "smoke.admin@example.com",
  RENTMATE_SMOKE_ADMIN_PASSWORD: "admin-smoke-secret",
  RENTMATE_PROVIDER_CHECK_ADDRESS: "Ben Thanh, Ho Chi Minh City"
});

function environment(overrides: EnvironmentSource = {}): EnvironmentSource {
  return { ...validProductionEnvironment, ...overrides };
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers }
  });
}

const publicSummary = Object.freeze({
  id: 42,
  title: "Public smoke listing",
  monthlyRent: 7_500_000,
  roomAreaSqm: 28.5,
  areaName: "Ben Thanh, District 1",
  latitude: 10.772,
  longitude: 106.698,
  propertyType: { code: "STUDIO", label: "Studio" },
  amenities: [{ code: "WIFI", label: "Wi-Fi" }],
  coverImage: { url: "https://res.cloudinary.com/example/image.webp", altText: null, displayOrder: 1 },
  updatedAt: "2026-08-14T00:00:00.000Z"
});

const publicDetail = Object.freeze({
  id: 42,
  title: "Public smoke listing",
  description: "Privacy-safe public detail.",
  monthlyRent: 7_500_000,
  roomAreaSqm: 28.5,
  areaName: "Ben Thanh, District 1",
  latitude: 10.772,
  longitude: 106.698,
  propertyType: { code: "STUDIO", label: "Studio" },
  amenities: [{ code: "WIFI", label: "Wi-Fi" }],
  images: [{ url: "https://res.cloudinary.com/example/image.webp", altText: null, displayOrder: 1 }],
  updatedAt: "2026-08-14T00:00:00.000Z"
});

function page(data: readonly unknown[] = []): object {
  return { data, pagination: { page: 1, pageSize: 1, hasNextPage: false } };
}

function createSmokeFetcher() {
  const requests: Array<Readonly<{ method: string; path: string; cookie: string | null }>> = [];
  const frontendOrigin = validProductionEnvironment.FRONTEND_ORIGIN!;
  const corsHeaders = {
    "Access-Control-Allow-Origin": frontendOrigin,
    "Access-Control-Allow-Credentials": "true"
  };
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    requests.push(Object.freeze({ method, path: url.pathname, cookie: headers.get("Cookie") }));

    if (url.origin === frontendOrigin && url.pathname === "/") {
      return new Response("<html><title>RentMate</title></html>", { status: 200 });
    }
    if (url.pathname === "/api/health") return jsonResponse({ status: "ok", database: "connected" });
    if (url.pathname === "/api/v1/listings" && url.searchParams.has("page")) {
      return jsonResponse(page([publicSummary]));
    }
    if (url.pathname === "/api/v1/listings/42") return jsonResponse({ data: publicDetail });
    if (url.pathname === "/api/v1/auth/login") {
      const body = JSON.parse(String(init?.body)) as { email: string };
      const role = body.email.split(".")[1];
      return jsonResponse(
        { data: { role: role?.toUpperCase() } },
        {
          headers: {
            ...corsHeaders,
            "Set-Cookie": `rentmate_session=${role}-memory-only; Path=/; HttpOnly; Secure; SameSite=Lax`
          }
        }
      );
    }
    if (url.pathname === "/api/v1/auth/logout") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "Set-Cookie": "rentmate_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
        }
      });
    }
    if (url.pathname === "/api/v1/favorites") return jsonResponse(page([publicSummary]));
    if (url.pathname === "/api/v1/landlord/listings") return jsonResponse(page());
    if (url.pathname === "/api/v1/admin/listings") return jsonResponse(page());
    return jsonResponse({ error: { code: "NOT_FOUND" } }, { status: 404 });
  });
  return { fetcher, requests };
}

describe("RM-055 production environment validation", () => {
  it("validates the complete current production variable contract without connectivity", () => {
    expect(productionBackendEnvironmentVariableNames).toHaveLength(25);
    expect(validateProductionEnvironment(validProductionEnvironment)).toMatchObject({
      nodeEnv: "production",
      frontendOrigin: "https://app.rentmate.example",
      auth: { jwtExpiresInSeconds: 7200, cookieSecure: true },
      images: { maximumCount: 8, maximumBytes: 5_242_880 },
      deployment: { region: "HO_CHI_MINH_CITY_VN", maximumSearchRadiusKm: 50 }
    });
  });

  it("requires explicit production mode", () => {
    expect(() => validateProductionEnvironment({ NODE_ENV: "test" })).toThrow(ProductionEnvironmentValidationError);
  });

  it.each([
    ["DB_PASSWORD", "<database-password>"],
    ["JWT_SECRET", "rentmate_local_jwt_secret_not_for_production"],
    ["FRONTEND_ORIGIN", "http://app.rentmate.example"],
    ["COOKIE_SECURE", "false"],
    ["NOMINATIM_BASE_URL", "http://nominatim.example"],
    ["JWT_EXPIRES_IN_SECONDS", "3600"],
    ["MAX_IMAGES_PER_LISTING", "7"],
    ["MAX_IMAGE_BYTES", "5000000"],
    ["DEPLOYMENT_REGION", "ANOTHER_REGION"],
    ["MAX_SEARCH_RADIUS_KM", "51"]
  ])("rejects unsafe production %s", (key, value) => {
    expect(() => validateProductionEnvironment(environment({ [key]: value }))).toThrow(key);
  });

  it("does not disclose an offending secret", () => {
    const secret = "<do-not-print-this-secret>";
    expect(() => validateProductionEnvironment(environment({ JWT_SECRET: secret }))).toThrowError(
      expect.objectContaining({ message: expect.not.stringContaining(secret) })
    );
  });
});

describe("RM-055 production smoke", () => {
  it("validates HTTPS inputs and all smoke actors without exposing credentials", () => {
    expect(readProductionSmokeConfiguration(validProductionEnvironment)).toMatchObject({
      frontendOrigin: "https://app.rentmate.example",
      apiOrigin: "https://api.rentmate.example",
      publicListingId: 42
    });
    expect(() =>
      readProductionSmokeConfiguration(environment({ NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000" }))
    ).toThrow(/HTTPS origin/);
    expect(() => readProductionSmokeConfiguration(environment({ RENTMATE_SMOKE_TENANT_PASSWORD: undefined }))).toThrow(
      "RENTMATE_SMOKE_TENANT_PASSWORD"
    );
  });

  it("keeps the default inventory read-only except for login/logout session cookies", () => {
    expect(productionSmokeEndpointInventory).toHaveLength(13);
    expect(new Set(productionSmokeEndpointInventory.map(({ method }) => method))).toEqual(new Set(["GET", "POST"]));
    expect(
      productionSmokeEndpointInventory
        .filter(({ effect }) => effect === "session")
        .every(({ path }) => ["/api/v1/auth/login", "/api/v1/auth/logout"].includes(path))
    ).toBe(true);
    expect(
      productionSmokeEndpointInventory.some(({ path }) => /register|moderation|activation|images/.test(path))
    ).toBe(false);
  });

  it("checks frontend, health, privacy-safe public reads, protected reads, cookie attributes, CORS, and logout", async () => {
    const configuration = readProductionSmokeConfiguration(validProductionEnvironment);
    const { fetcher, requests } = createSmokeFetcher();

    await expect(runProductionSmoke(configuration, fetcher)).resolves.toEqual({
      checkCount: 13,
      readOnlyProductData: true
    });
    expect(fetcher).toHaveBeenCalledTimes(13);
    expect(requests.filter(({ method }) => method === "POST").map(({ path }) => path)).toEqual([
      "/api/v1/auth/login",
      "/api/v1/auth/logout",
      "/api/v1/auth/login",
      "/api/v1/auth/logout",
      "/api/v1/auth/login",
      "/api/v1/auth/logout"
    ]);
    expect(requests.filter(({ path }) => /favorites|landlord|admin/.test(path)).every(({ cookie }) => cookie)).toBe(
      true
    );
  });

  it("rejects a cookie without production security attributes", async () => {
    const configuration = readProductionSmokeConfiguration(validProductionEnvironment);
    const { fetcher } = createSmokeFetcher();
    fetcher.mockImplementationOnce(async () => new Response("RentMate", { status: 200 }));
    fetcher.mockImplementationOnce(async () => jsonResponse({ status: "ok", database: "connected" }));
    fetcher.mockImplementationOnce(async () => jsonResponse(page([publicSummary])));
    fetcher.mockImplementationOnce(async () => jsonResponse({ data: publicDetail }));
    fetcher.mockImplementationOnce(async () =>
      jsonResponse(
        { data: {} },
        {
          headers: {
            "Access-Control-Allow-Origin": configuration.frontendOrigin,
            "Access-Control-Allow-Credentials": "true",
            "Set-Cookie": "rentmate_session=unsafe; Path=/; HttpOnly; SameSite=Lax"
          }
        }
      )
    );
    await expect(runProductionSmoke(configuration, fetcher)).rejects.toThrow(ProductionSmokeError);
  });

  it("sanitizes HTTP failures instead of including a response body", async () => {
    const secret = "response-body-secret";
    const fetcher = vi
      .fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response("RentMate", { status: 200 }))
      .mockResolvedValueOnce(new Response(secret, { status: 500 }));
    const error = await runProductionSmoke(readProductionSmokeConfiguration(validProductionEnvironment), fetcher).catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(ProductionSmokeError);
    expect((error as Error).message).not.toContain(secret);
  });
});

describe("RM-055 provider checks", () => {
  it("runs each injected non-mutating provider dependency exactly once", async () => {
    const cloudinaryPing = vi.fn(async () => undefined);
    const nominatimForwardGeocode = vi.fn(async () => [
      { displayName: "Ben Thanh", latitude: 10.772, longitude: 106.698 }
    ]);
    const configuration = readProviderCheckConfiguration(validProductionEnvironment);

    await expect(runProviderChecks(configuration, { cloudinaryPing, nominatimForwardGeocode })).resolves.toEqual({
      cloudinary: { status: "PASS" },
      nominatim: { status: "PASS", candidateCount: 1 },
      passed: true
    });
    expect(cloudinaryPing).toHaveBeenCalledTimes(1);
    expect(nominatimForwardGeocode).toHaveBeenCalledExactlyOnceWith("Ben Thanh, Ho Chi Minh City");
  });

  it("checks providers independently and returns only sanitized failure state", async () => {
    const providerSecret = "provider-secret-in-error";
    const result = await runProviderChecks(readProviderCheckConfiguration(validProductionEnvironment), {
      cloudinaryPing: async () => {
        throw new Error(providerSecret);
      },
      nominatimForwardGeocode: async () => []
    });
    expect(result).toEqual({
      cloudinary: { status: "FAIL" },
      nominatim: { status: "PASS", candidateCount: 0 },
      passed: false
    });
    expect(JSON.stringify(result)).not.toContain(providerSecret);
  });
});
