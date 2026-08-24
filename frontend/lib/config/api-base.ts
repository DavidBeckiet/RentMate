export const LOCAL_API_GATEWAY_BASE_URL = "http://localhost:4001";

export class ProductionApiBaseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionApiBaseValidationError";
  }
}

function isLocalDevelopmentHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized === "host.docker.internal" ||
    normalized.startsWith("127.") ||
    normalized.endsWith(".local")
  );
}

export function validateProductionApiBase(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ProductionApiBaseValidationError("NEXT_PUBLIC_API_BASE_URL is required for production.");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new ProductionApiBaseValidationError("NEXT_PUBLIC_API_BASE_URL must be an absolute HTTPS origin.");
  }

  if (parsed.protocol !== "https:" || !parsed.hostname) {
    throw new ProductionApiBaseValidationError("NEXT_PUBLIC_API_BASE_URL must be an absolute HTTPS origin.");
  }
  if (parsed.username || parsed.password) {
    throw new ProductionApiBaseValidationError("NEXT_PUBLIC_API_BASE_URL must not contain credentials.");
  }
  if (parsed.hostname.includes("*")) {
    throw new ProductionApiBaseValidationError("NEXT_PUBLIC_API_BASE_URL must not contain a wildcard.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new ProductionApiBaseValidationError("NEXT_PUBLIC_API_BASE_URL must contain only an exact origin.");
  }
  if (isLocalDevelopmentHostname(parsed.hostname)) {
    throw new ProductionApiBaseValidationError("NEXT_PUBLIC_API_BASE_URL must not target a local development host.");
  }

  return parsed.origin;
}

export function validateProductionApiBaseForEnvironment(
  source: Readonly<Record<string, string | undefined>>
): string | null {
  return source.NODE_ENV === "production" ? validateProductionApiBase(source.NEXT_PUBLIC_API_BASE_URL) : null;
}

export function resolveApiBaseUrl(
  configuredValue: string | undefined = process.env.NEXT_PUBLIC_API_BASE_URL,
  environment: string | undefined = process.env.NODE_ENV
): string {
  if (environment === "production") return validateProductionApiBase(configuredValue);

  const normalized = configuredValue?.trim();
  return normalized ? normalized.replace(/\/+$/, "") : LOCAL_API_GATEWAY_BASE_URL;
}
