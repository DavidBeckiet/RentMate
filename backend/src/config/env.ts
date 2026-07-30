import dotenv from "dotenv";
import path from "node:path";

export const runtimeEnvironments = ["development", "test", "production"] as const;
export const logLevels = ["debug", "info", "warn", "error"] as const;

export type RuntimeEnvironment = (typeof runtimeEnvironments)[number];
export type LogLevel = (typeof logLevels)[number];

export interface BackendConfig {
  readonly nodeEnv: RuntimeEnvironment;
  readonly port: number;
  readonly frontendOrigin: string;
  readonly logLevel: LogLevel;
  readonly database: {
    readonly host: string;
    readonly port: number;
    readonly database: string;
    readonly user: string;
    readonly password: string;
  };
}

export class EnvironmentConfigurationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid backend configuration: ${issues.join("; ")}`);
    this.name = "EnvironmentConfigurationError";
  }
}

const rootEnvironmentPath = path.resolve(__dirname, "../../..", ".env");
const developmentDatabasePassword = "rentmate_dev_password";

let cachedConfig: BackendConfig | undefined;
let environmentFileLoaded = false;

function loadEnvironmentFile(): void {
  if (environmentFileLoaded) {
    return;
  }

  const result = dotenv.config({ path: rootEnvironmentPath });
  environmentFileLoaded = true;

  if (result.error && "code" in result.error && result.error.code !== "ENOENT") {
    throw new EnvironmentConfigurationError(["the repository .env file could not be read"]);
  }
}

function readEnum<T extends string>(
  source: NodeJS.ProcessEnv,
  key: string,
  allowedValues: readonly T[],
  fallback: T,
  issues: string[]
): T {
  const value = source[key]?.trim() || fallback;

  if (!allowedValues.includes(value as T)) {
    issues.push(`${key} must be one of: ${allowedValues.join(", ")}`);
    return fallback;
  }

  return value as T;
}

function readPort(
  source: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  required: boolean,
  issues: string[]
): number {
  const rawValue = source[key]?.trim();

  if (!rawValue) {
    if (required) {
      issues.push(`${key} is required`);
    }

    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    issues.push(`${key} must be an integer between 1 and 65535`);
    return fallback;
  }

  return parsed;
}

function readString(
  source: NodeJS.ProcessEnv,
  key: string,
  fallback: string,
  required: boolean,
  issues: string[],
  trim = true
): string {
  const rawValue = source[key];
  const value = trim ? rawValue?.trim() : rawValue;

  if (!value) {
    if (required) {
      issues.push(`${key} is required`);
    }

    return fallback;
  }

  return value;
}

function readFrontendOrigin(source: NodeJS.ProcessEnv, nodeEnv: RuntimeEnvironment, issues: string[]): string {
  const fallback = "http://localhost:3000";
  const value = readString(source, "FRONTEND_ORIGIN", fallback, nodeEnv === "production", issues);

  try {
    const parsed = new URL(value);
    const isHttpOrigin = parsed.protocol === "http:" || parsed.protocol === "https:";
    const isExactOrigin = value === parsed.origin;

    if (!isHttpOrigin || !isExactOrigin) {
      issues.push("FRONTEND_ORIGIN must be an exact HTTP or HTTPS origin");
    } else if (nodeEnv === "production" && parsed.protocol !== "https:") {
      issues.push("FRONTEND_ORIGIN must use HTTPS in production");
    }
  } catch {
    issues.push("FRONTEND_ORIGIN must be a valid URL origin");
  }

  return value;
}

function parseEnvironment(source: NodeJS.ProcessEnv): BackendConfig {
  const issues: string[] = [];
  const nodeEnv = readEnum(source, "NODE_ENV", runtimeEnvironments, "development", issues);
  const production = nodeEnv === "production";
  const password = readString(source, "DB_PASSWORD", developmentDatabasePassword, production, issues, false);

  if (production && password === developmentDatabasePassword) {
    issues.push("DB_PASSWORD must not use the development default in production");
  }

  const config: BackendConfig = {
    nodeEnv,
    port: readPort(source, "PORT", 4000, production, issues),
    frontendOrigin: readFrontendOrigin(source, nodeEnv, issues),
    logLevel: readEnum(source, "LOG_LEVEL", logLevels, "info", issues),
    database: {
      host: readString(source, "DB_HOST", "localhost", production, issues),
      port: readPort(source, "DB_PORT", 5432, production, issues),
      database: readString(source, "DB_NAME", "rentmate", production, issues),
      user: readString(source, "DB_USER", "rentmate", production, issues),
      password
    }
  };

  if (issues.length > 0) {
    throw new EnvironmentConfigurationError(issues);
  }

  return config;
}

export function loadEnvironment(): BackendConfig {
  if (!cachedConfig) {
    loadEnvironmentFile();
    cachedConfig = parseEnvironment(process.env);
  }

  return cachedConfig;
}
