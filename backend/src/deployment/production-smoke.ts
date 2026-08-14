import type { BackendConfig, EnvironmentSource } from "../config/env.js";
import { createLogger } from "../shared/logging/logger.js";
import {
  loadValidatedProductionEnvironment,
  validateProductionEnvironment
} from "./validate-production-environment.js";

type SmokeRole = "tenant" | "landlord" | "admin";
type SmokeFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const productionSmokeEndpointInventory = Object.freeze([
  { method: "GET", path: "frontend-root", effect: "read" },
  { method: "GET", path: "/api/health", effect: "read" },
  { method: "GET", path: "/api/v1/listings", effect: "read" },
  { method: "GET", path: "/api/v1/listings/:listingId", effect: "read" },
  { method: "POST", path: "/api/v1/auth/login", effect: "session" },
  { method: "GET", path: "/api/v1/favorites", effect: "read" },
  { method: "POST", path: "/api/v1/auth/logout", effect: "session" },
  { method: "POST", path: "/api/v1/auth/login", effect: "session" },
  { method: "GET", path: "/api/v1/landlord/listings", effect: "read" },
  { method: "POST", path: "/api/v1/auth/logout", effect: "session" },
  { method: "POST", path: "/api/v1/auth/login", effect: "session" },
  { method: "GET", path: "/api/v1/admin/listings", effect: "read" },
  { method: "POST", path: "/api/v1/auth/logout", effect: "session" }
] as const);

interface SmokeActorCredentials {
  readonly email: string;
  readonly password: string;
}

export interface ProductionSmokeConfiguration {
  readonly frontendOrigin: string;
  readonly apiOrigin: string;
  readonly publicListingId: number;
  readonly tenant: SmokeActorCredentials;
  readonly landlord: SmokeActorCredentials;
  readonly admin: SmokeActorCredentials;
}

export interface ProductionSmokeResult {
  readonly checkCount: number;
  readonly readOnlyProductData: true;
}

export class ProductionSmokeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionSmokeConfigurationError";
  }
}

export class ProductionSmokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionSmokeError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readHttpsOrigin(value: string | undefined, key: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new ProductionSmokeConfigurationError(`${key} is required.`);

  try {
    const parsed = new URL(normalized);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.hostname.includes("*") ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("unsafe origin");
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.startsWith("127.") ||
      hostname.endsWith(".local")
    ) {
      throw new Error("local origin");
    }
    return parsed.origin;
  } catch {
    throw new ProductionSmokeConfigurationError(`${key} must be a non-local absolute HTTPS origin.`);
  }
}

function readEmail(source: EnvironmentSource, key: string): string {
  const value = source[key]?.trim().toLowerCase();
  if (!value || value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new ProductionSmokeConfigurationError(`${key} must contain a valid email address.`);
  }
  return value;
}

function readPassword(source: EnvironmentSource, key: string): string {
  const value = source[key];
  if (!value || value.trim().length === 0) {
    throw new ProductionSmokeConfigurationError(`${key} is required.`);
  }
  return value;
}

function readCredentials(source: EnvironmentSource, role: SmokeRole): SmokeActorCredentials {
  const prefix = `RENTMATE_SMOKE_${role.toUpperCase()}`;
  return Object.freeze({
    email: readEmail(source, `${prefix}_EMAIL`),
    password: readPassword(source, `${prefix}_PASSWORD`)
  });
}

function readListingId(source: EnvironmentSource): number {
  const value = Number(source.RENTMATE_SMOKE_PUBLIC_LISTING_ID?.trim());
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new ProductionSmokeConfigurationError("RENTMATE_SMOKE_PUBLIC_LISTING_ID must be a positive 32-bit integer.");
  }
  return value;
}

export function readProductionSmokeConfiguration(
  source: EnvironmentSource,
  backendConfig: BackendConfig = validateProductionEnvironment(source)
): ProductionSmokeConfiguration {
  return Object.freeze({
    frontendOrigin: readHttpsOrigin(backendConfig.frontendOrigin, "FRONTEND_ORIGIN"),
    apiOrigin: readHttpsOrigin(source.NEXT_PUBLIC_API_BASE_URL, "NEXT_PUBLIC_API_BASE_URL"),
    publicListingId: readListingId(source),
    tenant: readCredentials(source, "tenant"),
    landlord: readCredentials(source, "landlord"),
    admin: readCredentials(source, "admin")
  });
}

function failure(step: string): never {
  throw new ProductionSmokeError(`${step} failed.`);
}

async function expectResponse(
  fetcher: SmokeFetch,
  step: string,
  url: string,
  expectedStatus: number,
  init: RequestInit = {}
): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, redirect: "error" });
  } catch {
    return failure(step);
  }
  if (response.status !== expectedStatus) return failure(step);
  return response;
}

async function readJsonRecord(response: Response, step: string): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    if (!isRecord(value)) return failure(step);
    return value;
  } catch {
    return failure(step);
  }
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], step: string): void {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== [...expected].sort()[index])) {
    failure(step);
  }
}

function assertLookup(value: unknown, step: string): void {
  if (!isRecord(value)) return failure(step);
  assertExactKeys(value, ["code", "label"], step);
}

function assertPublicImage(value: unknown, step: string): void {
  if (!isRecord(value)) return failure(step);
  assertExactKeys(value, ["altText", "displayOrder", "url"], step);
}

function assertPublicSummary(value: unknown, step: string): void {
  if (!isRecord(value)) return failure(step);
  assertExactKeys(
    value,
    [
      "amenities",
      "areaName",
      "coverImage",
      "id",
      "latitude",
      "longitude",
      "monthlyRent",
      "propertyType",
      "roomAreaSqm",
      "title",
      "updatedAt"
    ],
    step
  );
  assertLookup(value.propertyType, step);
  if (!Array.isArray(value.amenities)) return failure(step);
  value.amenities.forEach((item) => assertLookup(item, step));
  assertPublicImage(value.coverImage, step);
}

function assertPublicDetail(value: unknown, step: string): void {
  if (!isRecord(value)) return failure(step);
  assertExactKeys(
    value,
    [
      "amenities",
      "areaName",
      "description",
      "id",
      "images",
      "latitude",
      "longitude",
      "monthlyRent",
      "propertyType",
      "roomAreaSqm",
      "title",
      "updatedAt"
    ],
    step
  );
  assertLookup(value.propertyType, step);
  if (!Array.isArray(value.amenities) || !Array.isArray(value.images)) return failure(step);
  value.amenities.forEach((item) => assertLookup(item, step));
  value.images.forEach((item) => assertPublicImage(item, step));
}

function pageData(payload: Record<string, unknown>, step: string): readonly unknown[] {
  assertExactKeys(payload, ["data", "pagination"], step);
  if (!Array.isArray(payload.data) || !isRecord(payload.pagination)) return failure(step);
  assertExactKeys(payload.pagination, ["hasNextPage", "page", "pageSize"], step);
  return payload.data;
}

function assertCors(response: Response, frontendOrigin: string, step: string): void {
  if (
    response.headers.get("access-control-allow-origin") !== frontendOrigin ||
    response.headers.get("access-control-allow-credentials")?.toLowerCase() !== "true"
  ) {
    failure(step);
  }
}

function inspectSessionCookie(response: Response, step: string, allowEmptyValue = false): string {
  const header = response.headers.get("set-cookie");
  if (!header) return failure(step);
  const segments = header.split(";").map((segment) => segment.trim());
  const [nameValue = ""] = segments;
  const separator = nameValue.indexOf("=");
  const name = separator < 0 ? "" : nameValue.slice(0, separator);
  const value = separator < 0 ? "" : nameValue.slice(separator + 1);
  const attributes = segments.slice(1).map((segment) => segment.toLowerCase());
  if (
    name !== "rentmate_session" ||
    (!allowEmptyValue && value.length === 0) ||
    !attributes.includes("httponly") ||
    !attributes.includes("secure") ||
    !attributes.includes("samesite=lax") ||
    !attributes.includes("path=/") ||
    attributes.some((attribute) => attribute.startsWith("domain="))
  ) {
    return failure(step);
  }
  return nameValue;
}

function apiUrl(configuration: ProductionSmokeConfiguration, pathValue: string): string {
  return new URL(pathValue, `${configuration.apiOrigin}/`).href;
}

async function login(
  fetcher: SmokeFetch,
  configuration: ProductionSmokeConfiguration,
  role: SmokeRole,
  credentials: SmokeActorCredentials
): Promise<string> {
  const step = `${role} login`;
  const response = await expectResponse(fetcher, step, apiUrl(configuration, "/api/v1/auth/login"), 200, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Origin: configuration.frontendOrigin },
    body: JSON.stringify(credentials)
  });
  assertCors(response, configuration.frontendOrigin, step);
  return inspectSessionCookie(response, step);
}

async function logout(
  fetcher: SmokeFetch,
  configuration: ProductionSmokeConfiguration,
  role: SmokeRole,
  cookie: string
): Promise<void> {
  const step = `${role} logout`;
  const response = await expectResponse(fetcher, step, apiUrl(configuration, "/api/v1/auth/logout"), 204, {
    method: "POST",
    credentials: "include",
    headers: { Cookie: cookie, Origin: configuration.frontendOrigin }
  });
  assertCors(response, configuration.frontendOrigin, step);
  inspectSessionCookie(response, step, true);
}

export async function runProductionSmoke(
  configuration: ProductionSmokeConfiguration,
  fetcher: SmokeFetch = globalThis.fetch
): Promise<ProductionSmokeResult> {
  const frontend = await expectResponse(fetcher, "frontend root", configuration.frontendOrigin, 200, {
    method: "GET"
  });
  if (!(await frontend.text()).includes("RentMate")) failure("frontend root marker");

  const health = await readJsonRecord(
    await expectResponse(fetcher, "health", apiUrl(configuration, "/api/health"), 200, { method: "GET" }),
    "health"
  );
  assertExactKeys(health, ["database", "status"], "health");
  if (health.status !== "ok" || health.database !== "connected") failure("health");

  const search = await readJsonRecord(
    await expectResponse(fetcher, "public search", apiUrl(configuration, "/api/v1/listings?page=1&pageSize=1"), 200, {
      method: "GET"
    }),
    "public search"
  );
  pageData(search, "public search").forEach((item) => assertPublicSummary(item, "public search privacy"));

  const detail = await readJsonRecord(
    await expectResponse(
      fetcher,
      "public detail",
      apiUrl(configuration, `/api/v1/listings/${configuration.publicListingId}`),
      200,
      { method: "GET" }
    ),
    "public detail"
  );
  assertExactKeys(detail, ["data"], "public detail");
  assertPublicDetail(detail.data, "public detail privacy");

  const tenantCookie = await login(fetcher, configuration, "tenant", configuration.tenant);
  const favorites = await readJsonRecord(
    await expectResponse(
      fetcher,
      "tenant favorites",
      apiUrl(configuration, "/api/v1/favorites?page=1&pageSize=1"),
      200,
      {
        method: "GET",
        credentials: "include",
        headers: { Cookie: tenantCookie }
      }
    ),
    "tenant favorites"
  );
  pageData(favorites, "tenant favorites").forEach((item) => assertPublicSummary(item, "favorite privacy"));
  await logout(fetcher, configuration, "tenant", tenantCookie);

  const landlordCookie = await login(fetcher, configuration, "landlord", configuration.landlord);
  const ownerListings = await readJsonRecord(
    await expectResponse(
      fetcher,
      "landlord listing read",
      apiUrl(configuration, "/api/v1/landlord/listings?page=1&pageSize=1"),
      200,
      { method: "GET", credentials: "include", headers: { Cookie: landlordCookie } }
    ),
    "landlord listing read"
  );
  pageData(ownerListings, "landlord listing read");
  await logout(fetcher, configuration, "landlord", landlordCookie);

  const adminCookie = await login(fetcher, configuration, "admin", configuration.admin);
  const adminListings = await readJsonRecord(
    await expectResponse(
      fetcher,
      "admin listing read",
      apiUrl(configuration, "/api/v1/admin/listings?status=PENDING&page=1&pageSize=1"),
      200,
      { method: "GET", credentials: "include", headers: { Cookie: adminCookie } }
    ),
    "admin listing read"
  );
  pageData(adminListings, "admin listing read");
  await logout(fetcher, configuration, "admin", adminCookie);

  return Object.freeze({ checkCount: productionSmokeEndpointInventory.length, readOnlyProductData: true });
}

export async function runProductionSmokeCommand(): Promise<void> {
  const logger = createLogger("info");
  try {
    const backendConfig = loadValidatedProductionEnvironment();
    const result = await runProductionSmoke(readProductionSmokeConfiguration(process.env, backendConfig));
    logger.info("Production smoke passed", {
      checkCount: result.checkCount,
      readOnlyProductData: result.readOnlyProductData
    });
  } catch (error) {
    logger.error("Production smoke failed", {
      reason:
        error instanceof ProductionSmokeConfigurationError || error instanceof ProductionSmokeError
          ? error.message
          : "Production smoke configuration or connectivity failed."
    });
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void runProductionSmokeCommand();
}
