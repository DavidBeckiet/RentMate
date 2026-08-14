import { fileURLToPath } from "node:url";

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

export function runProductionApiBaseValidationCommand(
  source: Readonly<Record<string, string | undefined>> = process.env
): void {
  try {
    validateProductionApiBase(source.NEXT_PUBLIC_API_BASE_URL);
    process.stdout.write("Frontend production API base validation = PASS\n");
  } catch (error) {
    const message =
      error instanceof ProductionApiBaseValidationError
        ? error.message
        : "Unexpected frontend production API-base validation error.";
    process.stderr.write(`Frontend production API base validation = FAIL: ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runProductionApiBaseValidationCommand();
}
