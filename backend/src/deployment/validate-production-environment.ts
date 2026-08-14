import {
  EnvironmentConfigurationError,
  loadEnvironment,
  parseEnvironment,
  type BackendConfig,
  type EnvironmentSource
} from "../config/env.js";
import { createLogger } from "../shared/logging/logger.js";

export const productionBackendEnvironmentVariableNames = Object.freeze([
  "NODE_ENV",
  "PORT",
  "FRONTEND_ORIGIN",
  "LOG_LEVEL",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DB_POOL_MAX",
  "DB_CONNECTION_TIMEOUT_MS",
  "DB_IDLE_TIMEOUT_MS",
  "JWT_SECRET",
  "JWT_EXPIRES_IN_SECONDS",
  "BCRYPT_COST",
  "COOKIE_SECURE",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "NOMINATIM_BASE_URL",
  "NOMINATIM_USER_AGENT",
  "MAX_IMAGES_PER_LISTING",
  "MAX_IMAGE_BYTES",
  "DEPLOYMENT_REGION",
  "MAX_SEARCH_RADIUS_KM"
] as const);

export class ProductionEnvironmentValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Production environment validation failed: ${issues.join("; ")}`);
    this.name = "ProductionEnvironmentValidationError";
  }
}

function requireProduction(config: BackendConfig): BackendConfig {
  if (config.nodeEnv !== "production") {
    throw new ProductionEnvironmentValidationError(["NODE_ENV must equal production"]);
  }

  return config;
}

export function validateProductionEnvironment(source: EnvironmentSource): BackendConfig {
  return requireProduction(parseEnvironment(source));
}

export function loadValidatedProductionEnvironment(): BackendConfig {
  return requireProduction(loadEnvironment());
}

export async function runProductionEnvironmentValidationCommand(): Promise<void> {
  const logger = createLogger("info");

  try {
    loadValidatedProductionEnvironment();
    logger.info("Production environment validation passed", {
      validatedVariableCount: productionBackendEnvironmentVariableNames.length,
      externalConnectivityChecked: false
    });
  } catch (error) {
    const reason =
      error instanceof EnvironmentConfigurationError || error instanceof ProductionEnvironmentValidationError
        ? error.message
        : "Unexpected production environment validation error";
    logger.error("Production environment validation failed", { reason });
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void runProductionEnvironmentValidationCommand();
}
