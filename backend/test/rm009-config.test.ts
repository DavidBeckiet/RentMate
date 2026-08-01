import { describe, expect, it } from "vitest";
import { EnvironmentConfigurationError, parseEnvironment, type EnvironmentSource } from "../src/config/env.js";

const validProductionEnvironment: EnvironmentSource = {
  NODE_ENV: "production",
  PORT: "4000",
  FRONTEND_ORIGIN: "https://rentmate.example.com",
  LOG_LEVEL: "info",
  DB_HOST: "postgres.internal",
  DB_PORT: "5432",
  DB_NAME: "rentmate",
  DB_USER: "rentmate_app",
  DB_PASSWORD: "production-database-password",
  DB_POOL_MAX: "10",
  DB_CONNECTION_TIMEOUT_MS: "5000",
  DB_IDLE_TIMEOUT_MS: "30000",
  JWT_SECRET: "production-jwt-secret",
  JWT_EXPIRES_IN_SECONDS: "7200",
  BCRYPT_COST: "12",
  COOKIE_SECURE: "true",
  CLOUDINARY_CLOUD_NAME: "rentmate-production",
  CLOUDINARY_API_KEY: "cloudinary-api-key",
  CLOUDINARY_API_SECRET: "cloudinary-api-secret",
  NOMINATIM_BASE_URL: "https://nominatim.openstreetmap.org",
  NOMINATIM_USER_AGENT: "RentMate production contact@example.com",
  MAX_IMAGES_PER_LISTING: "8",
  MAX_IMAGE_BYTES: "5242880",
  DEPLOYMENT_REGION: "HO_CHI_MINH_CITY_VN",
  MAX_SEARCH_RADIUS_KM: "50"
};

function productionEnvironment(overrides: EnvironmentSource = {}): EnvironmentSource {
  return { ...validProductionEnvironment, ...overrides };
}

function expectConfigurationError(source: EnvironmentSource, expectedKey: string): EnvironmentConfigurationError {
  try {
    parseEnvironment(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvironmentConfigurationError);
    expect((error as Error).message).toContain(expectedKey);
    return error as EnvironmentConfigurationError;
  }

  throw new Error("Expected configuration parsing to fail");
}

describe("RM-009 environment parsing", () => {
  it("parses complete development defaults without mutating the source", () => {
    const source = Object.freeze({
      NODE_ENV: "development",
      FRONTEND_ORIGIN: "http://localhost:3000/"
    });
    const snapshot = { ...source };

    const config = parseEnvironment(source);

    expect(config).toMatchObject({
      nodeEnv: "development",
      port: 4000,
      frontendOrigin: "http://localhost:3000",
      database: {
        host: "localhost",
        port: 5432,
        max: 10,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000
      },
      auth: {
        jwtExpiresInSeconds: 7200,
        bcryptCost: 12,
        cookieSecure: false
      },
      images: {
        maximumCount: 8,
        maximumBytes: 5242880
      },
      deployment: {
        region: "HO_CHI_MINH_CITY_VN",
        maximumSearchRadiusKm: 50
      }
    });
    expect(source).toEqual(snapshot);
  });

  it("parses test configuration", () => {
    expect(parseEnvironment({ NODE_ENV: "test", LOG_LEVEL: "debug" })).toMatchObject({
      nodeEnv: "test",
      logLevel: "debug"
    });
  });

  it("parses a complete valid production configuration", () => {
    expect(parseEnvironment(validProductionEnvironment)).toMatchObject({
      nodeEnv: "production",
      frontendOrigin: "https://rentmate.example.com",
      auth: {
        jwtExpiresInSeconds: 7200,
        cookieSecure: true
      },
      nominatim: {
        baseUrl: "https://nominatim.openstreetmap.org"
      }
    });
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace-only", "   "]
  ])("rejects a %s required production value", (_description, value) => {
    expectConfigurationError(productionEnvironment({ CLOUDINARY_API_SECRET: value }), "CLOUDINARY_API_SECRET");
  });

  it.each([
    ["PORT", "0"],
    ["DB_PORT", "65536"],
    ["DB_POOL_MAX", "0"],
    ["DB_CONNECTION_TIMEOUT_MS", "0"],
    ["DB_IDLE_TIMEOUT_MS", "999"],
    ["BCRYPT_COST", "32"]
  ])("rejects an invalid %s integer", (key, value) => {
    expectConfigurationError(productionEnvironment({ [key]: value }), key);
  });

  it.each([
    ["not a URL", "FRONTEND_ORIGIN"],
    ["https://rentmate.example.com/path", "FRONTEND_ORIGIN"],
    ["https://rentmate.example.com?mode=test", "FRONTEND_ORIGIN"],
    ["https://rentmate.example.com#section", "FRONTEND_ORIGIN"],
    ["https://user:password@rentmate.example.com", "FRONTEND_ORIGIN"],
    ["https://*", "FRONTEND_ORIGIN"],
    ["http://rentmate.example.com", "FRONTEND_ORIGIN"],
    ["not a URL", "NOMINATIM_BASE_URL"],
    ["http://nominatim.example.com", "NOMINATIM_BASE_URL"]
  ])("rejects malformed or unsafe URL %s", (value, expectedKey) => {
    expectConfigurationError(productionEnvironment({ [expectedKey]: value }), expectedKey);
  });

  it("rejects invalid logging and missing production Nominatim identification", () => {
    expectConfigurationError(productionEnvironment({ LOG_LEVEL: "verbose" }), "LOG_LEVEL");
    expectConfigurationError(productionEnvironment({ NOMINATIM_USER_AGENT: "" }), "NOMINATIM_USER_AGENT");
  });

  it("rejects a database URL or credentials in the host-only DB_HOST setting", () => {
    expectConfigurationError(
      productionEnvironment({ DB_HOST: "postgresql://user:password@postgres.internal/rentmate" }),
      "DB_HOST"
    );
  });

  it.each([
    ["MAX_SEARCH_RADIUS_KM", "49"],
    ["MAX_IMAGES_PER_LISTING", "9"],
    ["MAX_IMAGE_BYTES", "5242879"],
    ["JWT_EXPIRES_IN_SECONDS", "3600"]
  ])("rejects an incorrect frozen %s value", (key, value) => {
    expectConfigurationError(productionEnvironment({ [key]: value }), key);
  });

  it("rejects known development credentials and production placeholders", () => {
    expectConfigurationError(productionEnvironment({ DB_PASSWORD: "rentmate_dev_password" }), "DB_PASSWORD");
    expectConfigurationError(productionEnvironment({ JWT_SECRET: "<jwt-secret>" }), "JWT_SECRET");
  });

  it("requires secure cookies in production", () => {
    expectConfigurationError(productionEnvironment({ COOKIE_SECURE: "false" }), "COOKIE_SECURE");
  });

  it("does not include secret input in validation errors", () => {
    const secret = "<super-sensitive-jwt-value>";
    const error = expectConfigurationError(productionEnvironment({ JWT_SECRET: secret }), "JWT_SECRET");

    expect(error.message).not.toContain(secret);
    expect(error.issues.join(" ")).not.toContain(secret);
  });
});
