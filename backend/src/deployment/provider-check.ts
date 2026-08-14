import { v2 as cloudinary } from "cloudinary";
import type { BackendConfig, EnvironmentSource } from "../config/env.js";
import {
  createNominatimClient,
  NOMINATIM_TIMEOUT_MS,
  type NominatimCandidate
} from "../integrations/nominatim.client.js";
import { createLogger } from "../shared/logging/logger.js";
import {
  loadValidatedProductionEnvironment,
  validateProductionEnvironment
} from "./validate-production-environment.js";

export interface ProviderCheckConfiguration {
  readonly backend: BackendConfig;
  readonly address: string;
}

export interface ProviderCheckDependencies {
  readonly cloudinaryPing: () => Promise<void>;
  readonly nominatimForwardGeocode: (address: string) => Promise<readonly NominatimCandidate[]>;
}

export interface ProviderCheckResult {
  readonly cloudinary: Readonly<{ status: "PASS" | "FAIL" }>;
  readonly nominatim: Readonly<{ status: "PASS" | "FAIL"; candidateCount: number | null }>;
  readonly passed: boolean;
}

export class ProviderCheckConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderCheckConfigurationError";
  }
}

export function readProviderCheckConfiguration(
  source: EnvironmentSource,
  backend: BackendConfig = validateProductionEnvironment(source)
): ProviderCheckConfiguration {
  const address = source.RENTMATE_PROVIDER_CHECK_ADDRESS?.trim();
  if (!address || address.length > 500) {
    throw new ProviderCheckConfigurationError(
      "RENTMATE_PROVIDER_CHECK_ADDRESS must contain between 1 and 500 characters."
    );
  }
  return Object.freeze({ backend, address });
}

export function createLiveProviderCheckDependencies(backend: BackendConfig): ProviderCheckDependencies {
  cloudinary.config({
    cloud_name: backend.cloudinary.cloudName,
    api_key: backend.cloudinary.apiKey,
    api_secret: backend.cloudinary.apiSecret,
    secure: true
  });
  const nominatim = createNominatimClient({
    baseUrl: backend.nominatim.baseUrl,
    userAgent: backend.nominatim.userAgent,
    timeoutMs: NOMINATIM_TIMEOUT_MS
  });

  return Object.freeze({
    async cloudinaryPing(): Promise<void> {
      await cloudinary.api.ping();
    },
    nominatimForwardGeocode: nominatim.forwardGeocode
  });
}

export async function runProviderChecks(
  configuration: ProviderCheckConfiguration,
  dependencies: ProviderCheckDependencies
): Promise<ProviderCheckResult> {
  const [cloudinaryResult, nominatimResult] = await Promise.allSettled([
    dependencies.cloudinaryPing(),
    dependencies.nominatimForwardGeocode(configuration.address)
  ]);

  const cloudinaryStatus = cloudinaryResult.status === "fulfilled" ? "PASS" : "FAIL";
  const nominatimStatus = nominatimResult.status === "fulfilled" ? "PASS" : "FAIL";
  const candidateCount = nominatimResult.status === "fulfilled" ? nominatimResult.value.length : null;
  if (candidateCount !== null && (candidateCount < 0 || candidateCount > 5)) {
    return Object.freeze({
      cloudinary: Object.freeze({ status: cloudinaryStatus }),
      nominatim: Object.freeze({ status: "FAIL", candidateCount: null }),
      passed: false
    });
  }

  return Object.freeze({
    cloudinary: Object.freeze({ status: cloudinaryStatus }),
    nominatim: Object.freeze({ status: nominatimStatus, candidateCount }),
    passed: cloudinaryStatus === "PASS" && nominatimStatus === "PASS"
  });
}

export async function runProviderCheckCommand(): Promise<void> {
  const logger = createLogger("info");
  try {
    const backend = loadValidatedProductionEnvironment();
    const configuration = readProviderCheckConfiguration(process.env, backend);
    const result = await runProviderChecks(configuration, createLiveProviderCheckDependencies(backend));
    logger.info(`Cloudinary connectivity = ${result.cloudinary.status}`);
    logger.info(`Nominatim connectivity = ${result.nominatim.status}`, {
      candidateCount: result.nominatim.candidateCount
    });
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    logger.error("Provider connectivity checks failed", {
      reason:
        error instanceof ProviderCheckConfigurationError
          ? error.message
          : "Provider configuration or connectivity failed."
    });
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void runProviderCheckCommand();
}
