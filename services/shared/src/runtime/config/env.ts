import dotenv from "dotenv";
import path from "node:path";

export const runtimeEnvironments = ["development", "test", "production"] as const;
export const logLevels = ["debug", "info", "warn", "error"] as const;
export const deploymentRegions = ["HO_CHI_MINH_CITY_VN"] as const;

export const jwtLifetimeSeconds = 7_200;
export const maximumImagesPerListing = 8;
export const maximumImageBytes = 5_242_880;
export const maximumSearchRadiusKm = 50;
export const defaultBcryptCost = 12;

export type RuntimeEnvironment = (typeof runtimeEnvironments)[number];
export type LogLevel = (typeof logLevels)[number];
export type DeploymentRegion = (typeof deploymentRegions)[number];
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export interface RuntimeConfig {
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
    readonly max: number;
    readonly connectionTimeoutMillis: number;
    readonly idleTimeoutMillis: number;
  };
  readonly auth: {
    readonly jwtSecret: string;
    readonly jwtExpiresInSeconds: 7200;
    readonly bcryptCost: number;
    readonly cookieSecure: boolean;
  };
  readonly cloudinary: {
    readonly cloudName: string;
    readonly apiKey: string;
    readonly apiSecret: string;
  };
  readonly nominatim: {
    readonly baseUrl: string;
    readonly userAgent: string;
  };
  readonly verification: {
    readonly deliveryUrl: string;
    readonly deliveryToken: string;
  };
  readonly googleOAuth: {
    readonly enabled: boolean;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly redirectUri: string;
  };
  readonly images: {
    readonly maximumCount: 8;
    readonly maximumBytes: 5242880;
  };
  readonly deployment: {
    readonly region: DeploymentRegion;
    readonly maximumSearchRadiusKm: 50;
  };
  readonly listingAvailability: {
    readonly reminderDays: number;
    readonly graceDays: number;
    readonly scanIntervalMs: number;
    readonly batchSize: number;
  };
}

export class EnvironmentConfigurationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid service configuration: ${issues.join("; ")}`);
    this.name = "EnvironmentConfigurationError";
  }
}

const rootEnvironmentPath = path.resolve(__dirname, "../../..", ".env");
const developmentDatabasePassword = "rentmate_dev_password";
const developmentJwtSecret = "rentmate_local_jwt_secret_not_for_production";
const defaultNominatimBaseUrl = "https://nominatim.openstreetmap.org";
const defaultNominatimUserAgent = "RentMate local development";
const minimumBcryptCost = 4;
const maximumBcryptCost = 31;

let cachedConfig: RuntimeConfig | undefined;
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
  source: EnvironmentSource,
  key: string,
  allowedValues: readonly T[],
  fallback: T,
  required: boolean,
  issues: string[]
): T {
  const rawValue = source[key]?.trim();
  if (!rawValue) {
    if (required) {
      issues.push(`${key} is required in production`);
    }

    return fallback;
  }

  if (!allowedValues.includes(rawValue as T)) {
    issues.push(`${key} must be one of: ${allowedValues.join(", ")}`);
    return fallback;
  }

  return rawValue as T;
}

function readInteger(
  source: EnvironmentSource,
  key: string,
  fallback: number,
  required: boolean,
  minimum: number,
  maximum: number,
  issues: string[]
): number {
  const rawValue = source[key]?.trim();

  if (!rawValue) {
    if (required) {
      issues.push(`${key} is required in production`);
    }

    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    issues.push(`${key} must be an integer between ${minimum} and ${maximum}`);
    return fallback;
  }

  return parsed;
}

function isDocumentedPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    (normalized.startsWith("<") && normalized.endsWith(">")) ||
    normalized === "placeholder" ||
    normalized === "changeme" ||
    normalized === "change_me" ||
    normalized === "replace_me" ||
    normalized === "replace-me" ||
    normalized.startsWith("your_") ||
    normalized.startsWith("your-")
  );
}

function readString(
  source: EnvironmentSource,
  key: string,
  fallback: string,
  required: boolean,
  issues: string[],
  options: {
    readonly trim?: boolean;
    readonly rejectPlaceholder?: boolean;
  } = {}
): string {
  const rawValue = source[key];
  const value = options.trim === false ? rawValue : rawValue?.trim();

  if (!value || value.trim().length === 0) {
    if (required) {
      issues.push(`${key} is required in production`);
    }

    return fallback;
  }

  if (options.rejectPlaceholder && isDocumentedPlaceholder(value)) {
    issues.push(`${key} must not use a documented placeholder in production`);
    return fallback;
  }

  return value;
}

function readBoolean(
  source: EnvironmentSource,
  key: string,
  fallback: boolean,
  required: boolean,
  issues: string[]
): boolean {
  const rawValue = source[key]?.trim().toLowerCase();

  if (!rawValue) {
    if (required) {
      issues.push(`${key} is required in production`);
    }

    return fallback;
  }

  if (rawValue !== "true" && rawValue !== "false") {
    issues.push(`${key} must be either true or false`);
    return fallback;
  }

  return rawValue === "true";
}

function readFrontendOrigin(source: EnvironmentSource, nodeEnv: RuntimeEnvironment, issues: string[]): string {
  const fallback = "http://localhost:3000";
  const value = readString(source, "FRONTEND_ORIGIN", fallback, nodeEnv === "production", issues);

  try {
    const parsed = new URL(value);
    const isHttpOrigin = parsed.protocol === "http:" || parsed.protocol === "https:";
    const hasOnlyOriginPath = parsed.pathname === "/";
    const hasCredentials = parsed.username.length > 0 || parsed.password.length > 0;

    if (
      !isHttpOrigin ||
      !parsed.hostname ||
      !hasOnlyOriginPath ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0 ||
      parsed.hostname.includes("*") ||
      hasCredentials
    ) {
      issues.push("FRONTEND_ORIGIN must contain only an exact HTTP or HTTPS origin");
    } else if (nodeEnv === "production" && parsed.protocol !== "https:") {
      issues.push("FRONTEND_ORIGIN must use HTTPS in production");
    } else {
      return parsed.origin;
    }
  } catch {
    issues.push("FRONTEND_ORIGIN must be a valid URL origin");
  }

  return fallback;
}

function readDatabaseHost(source: EnvironmentSource, production: boolean, issues: string[]): string {
  const fallback = "localhost";
  const value = readString(source, "DB_HOST", fallback, production, issues, {
    rejectPlaceholder: production
  });

  if (/[\s/@?#]/.test(value) || value.includes("://")) {
    issues.push("DB_HOST must be a hostname or IP address without credentials or URL components");
    return fallback;
  }

  return value;
}

function readNominatimBaseUrl(source: EnvironmentSource, production: boolean, issues: string[]): string {
  const value = readString(source, "NOMINATIM_BASE_URL", defaultNominatimBaseUrl, production, issues, {
    rejectPlaceholder: production
  });

  try {
    const parsed = new URL(value);
    const hasCredentials = parsed.username.length > 0 || parsed.password.length > 0;

    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0 ||
      parsed.hostname.includes("*") ||
      hasCredentials
    ) {
      issues.push("NOMINATIM_BASE_URL must be an absolute HTTP or HTTPS base URL without credentials");
    } else if (production && parsed.protocol !== "https:") {
      issues.push("NOMINATIM_BASE_URL must use HTTPS in production");
    } else {
      return parsed.href.replace(/\/$/, "");
    }
  } catch {
    issues.push("NOMINATIM_BASE_URL must be a valid URL");
  }

  return defaultNominatimBaseUrl;
}

function readVerificationDeliveryUrl(source: EnvironmentSource, production: boolean, issues: string[]): string {
  const value = readString(source, "VERIFICATION_DELIVERY_URL", "", production, issues, {
    rejectPlaceholder: production
  });
  if (!value) return "";

  try {
    const parsed = new URL(value);
    const hasCredentials = parsed.username.length > 0 || parsed.password.length > 0;
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0 ||
      parsed.hostname.includes("*") ||
      hasCredentials
    ) {
      issues.push("VERIFICATION_DELIVERY_URL must be an absolute HTTP or HTTPS URL without credentials");
    } else if (production && parsed.protocol !== "https:") {
      issues.push("VERIFICATION_DELIVERY_URL must use HTTPS in production");
    } else {
      return parsed.href.replace(/\/$/, "");
    }
  } catch {
    issues.push("VERIFICATION_DELIVERY_URL must be a valid URL");
  }

  return "";
}

function readGoogleOAuthRedirectUri(source: EnvironmentSource, production: boolean, issues: string[]): string {
  const value = readString(source, "GOOGLE_OAUTH_REDIRECT_URI", "", false, issues, {
    rejectPlaceholder: true
  });
  if (!value) return "";

  try {
    const parsed = new URL(value);
    const hasCredentials = parsed.username.length > 0 || parsed.password.length > 0;
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0 ||
      parsed.hostname.includes("*") ||
      hasCredentials ||
      parsed.pathname === "/"
    ) {
      issues.push(
        "GOOGLE_OAUTH_REDIRECT_URI must be an absolute HTTP or HTTPS URL without credentials or query parameters"
      );
    } else if (production && parsed.protocol !== "https:") {
      issues.push("GOOGLE_OAUTH_REDIRECT_URI must use HTTPS in production");
    } else {
      return parsed.href;
    }
  } catch {
    issues.push("GOOGLE_OAUTH_REDIRECT_URI must be a valid URL");
  }

  return "";
}

function readGoogleOAuthConfig(
  source: EnvironmentSource,
  production: boolean,
  issues: string[]
): RuntimeConfig["googleOAuth"] {
  const clientId = readString(source, "GOOGLE_OAUTH_CLIENT_ID", "", false, issues, {
    rejectPlaceholder: true
  });
  const clientSecret = readString(source, "GOOGLE_OAUTH_CLIENT_SECRET", "", false, issues, {
    trim: false,
    rejectPlaceholder: true
  });
  const configured = Boolean(clientId || clientSecret);
  const redirectUri = configured ? readGoogleOAuthRedirectUri(source, production, issues) : "";

  if (!configured) {
    return Object.freeze({ enabled: false, clientId: "", clientSecret: "", redirectUri: "" });
  }

  if (!clientId) issues.push("GOOGLE_OAUTH_CLIENT_ID is required when Google OAuth is configured");
  if (!clientSecret) issues.push("GOOGLE_OAUTH_CLIENT_SECRET is required when Google OAuth is configured");
  if (!redirectUri) issues.push("GOOGLE_OAUTH_REDIRECT_URI is required when Google OAuth is configured");

  return Object.freeze({
    enabled: Boolean(clientId && clientSecret && redirectUri),
    clientId,
    clientSecret,
    redirectUri
  });
}

function requireExactValue(
  source: EnvironmentSource,
  key: string,
  expected: number,
  production: boolean,
  issues: string[]
): number {
  const value = readInteger(source, key, expected, production, 1, Number.MAX_SAFE_INTEGER, issues);

  if (value !== expected) {
    issues.push(`${key} must equal the frozen value ${expected}`);
    return expected;
  }

  return value;
}

export function parseEnvironment(source: EnvironmentSource): RuntimeConfig {
  const issues: string[] = [];
  const nodeEnv = readEnum(source, "NODE_ENV", runtimeEnvironments, "development", false, issues);
  const production = nodeEnv === "production";
  const password = readString(source, "DB_PASSWORD", developmentDatabasePassword, production, issues, {
    trim: false,
    rejectPlaceholder: production
  });
  const jwtSecret = readString(source, "JWT_SECRET", developmentJwtSecret, production, issues, {
    trim: false,
    rejectPlaceholder: production
  });
  const cookieSecure = readBoolean(source, "COOKIE_SECURE", false, production, issues);

  if (production && source.DB_PASSWORD?.trim() === developmentDatabasePassword) {
    issues.push("DB_PASSWORD must not use the development default in production");
  }

  if (production && source.JWT_SECRET?.trim() === developmentJwtSecret) {
    issues.push("JWT_SECRET must not use the development default in production");
  }

  if (production && !cookieSecure) {
    issues.push("COOKIE_SECURE must be true in production");
  }

  const config: RuntimeConfig = {
    nodeEnv,
    port: readInteger(source, "PORT", 4000, production, 1, 65_535, issues),
    frontendOrigin: readFrontendOrigin(source, nodeEnv, issues),
    logLevel: readEnum(source, "LOG_LEVEL", logLevels, "info", production, issues),
    database: {
      host: readDatabaseHost(source, production, issues),
      port: readInteger(source, "DB_PORT", 5432, production, 1, 65_535, issues),
      database: readString(source, "DB_NAME", "rentmate", production, issues, {
        rejectPlaceholder: production
      }),
      user: readString(source, "DB_USER", "rentmate", production, issues, {
        rejectPlaceholder: production
      }),
      password,
      max: readInteger(source, "DB_POOL_MAX", 10, production, 1, 100, issues),
      connectionTimeoutMillis: readInteger(source, "DB_CONNECTION_TIMEOUT_MS", 5_000, production, 1, 60_000, issues),
      idleTimeoutMillis: readInteger(source, "DB_IDLE_TIMEOUT_MS", 30_000, production, 1_000, 600_000, issues)
    },
    auth: {
      jwtSecret,
      jwtExpiresInSeconds: requireExactValue(
        source,
        "JWT_EXPIRES_IN_SECONDS",
        jwtLifetimeSeconds,
        production,
        issues
      ) as 7200,
      bcryptCost: readInteger(
        source,
        "BCRYPT_COST",
        defaultBcryptCost,
        production,
        minimumBcryptCost,
        maximumBcryptCost,
        issues
      ),
      cookieSecure
    },
    cloudinary: {
      cloudName: readString(source, "CLOUDINARY_CLOUD_NAME", "", production, issues, {
        rejectPlaceholder: production
      }),
      apiKey: readString(source, "CLOUDINARY_API_KEY", "", production, issues, {
        trim: false,
        rejectPlaceholder: production
      }),
      apiSecret: readString(source, "CLOUDINARY_API_SECRET", "", production, issues, {
        trim: false,
        rejectPlaceholder: production
      })
    },
    nominatim: {
      baseUrl: readNominatimBaseUrl(source, production, issues),
      userAgent: readString(source, "NOMINATIM_USER_AGENT", defaultNominatimUserAgent, production, issues, {
        rejectPlaceholder: production
      })
    },
    verification: {
      deliveryUrl: readVerificationDeliveryUrl(source, production, issues),
      deliveryToken: readString(source, "VERIFICATION_DELIVERY_TOKEN", "", production, issues, {
        trim: false,
        rejectPlaceholder: production
      })
    },
    googleOAuth: readGoogleOAuthConfig(source, production, issues),
    images: {
      maximumCount: requireExactValue(
        source,
        "MAX_IMAGES_PER_LISTING",
        maximumImagesPerListing,
        production,
        issues
      ) as 8,
      maximumBytes: requireExactValue(source, "MAX_IMAGE_BYTES", maximumImageBytes, production, issues) as 5242880
    },
    deployment: {
      region: readEnum(source, "DEPLOYMENT_REGION", deploymentRegions, "HO_CHI_MINH_CITY_VN", production, issues),
      maximumSearchRadiusKm: requireExactValue(
        source,
        "MAX_SEARCH_RADIUS_KM",
        maximumSearchRadiusKm,
        production,
        issues
      ) as 50
    },
    listingAvailability: {
      reminderDays: readInteger(source, "LISTING_STALE_REMINDER_DAYS", 30, false, 1, 3_650, issues),
      graceDays: readInteger(source, "LISTING_STALE_GRACE_DAYS", 7, false, 1, 365, issues),
      scanIntervalMs: readInteger(source, "LISTING_STALE_SCAN_INTERVAL_MS", 30_000, false, 1_000, 3_600_000, issues),
      batchSize: readInteger(source, "LISTING_STALE_BATCH_SIZE", 100, false, 1, 1_000, issues)
    }
  };

  if (issues.length > 0) {
    throw new EnvironmentConfigurationError(issues);
  }

  return config;
}

export function loadEnvironment(): RuntimeConfig {
  if (!cachedConfig) {
    loadEnvironmentFile();
    cachedConfig = parseEnvironment(process.env);
  }

  return cachedConfig;
}
