export const roommateAiProviderModes = ["DISABLED", "GEMINI"] as const;
export const roommateAiSafetyModes = ["OFF", "SHADOW", "TENANT"] as const;

export type RoommateAiProviderMode = (typeof roommateAiProviderModes)[number];
export type RoommateAiSafetyMode = (typeof roommateAiSafetyModes)[number];
export type RoommateAiFeature = "PARSER" | "RECOMMENDATION" | "EXPLANATION" | "SAFETY";
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export interface RoommateAiConfiguration {
  readonly provider: RoommateAiProviderMode;
  readonly enabled: boolean;
  readonly parserEnabled: boolean;
  readonly recommendationEnabled: boolean;
  readonly explanationEnabled: boolean;
  readonly safetyMode: RoommateAiSafetyMode;
  readonly geminiApiKey: string;
  readonly models: Readonly<{
    readonly parser: string;
    readonly recommendation: string;
    readonly explanation: string;
    readonly safety: string;
  }>;
  readonly timeoutsMs: Readonly<{
    readonly parser: number;
    readonly recommendation: number;
    readonly explanation: number;
    readonly safety: number;
  }>;
  readonly maximumConcurrency: number;
  readonly rolloutPercentage: number;
}

export class RoommateAiConfigurationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid Roommate AI configuration: ${issues.join("; ")}`);
    this.name = "RoommateAiConfigurationError";
  }
}

const timeoutDefaults = Object.freeze({
  parser: 5_000,
  recommendation: 8_000,
  explanation: 5_000,
  safety: 6_000
});

function isPlaceholder(value: string): boolean {
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

function readBoolean(source: EnvironmentSource, key: string, fallback: boolean, issues: string[]): boolean {
  const value = source[key]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value !== "true" && value !== "false") {
    issues.push(`${key} must be either true or false`);
    return fallback;
  }
  return value === "true";
}

function readInteger(
  source: EnvironmentSource,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
  issues: string[]
): number {
  const value = source[key]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    issues.push(`${key} must be an integer between ${minimum} and ${maximum}`);
    return fallback;
  }
  return parsed;
}

function readEnum<T extends string>(
  source: EnvironmentSource,
  key: string,
  allowedValues: readonly T[],
  fallback: T,
  issues: string[]
): T {
  const value = source[key]?.trim();
  if (!value) return fallback;
  if (!allowedValues.includes(value as T)) {
    issues.push(`${key} must be one of: ${allowedValues.join(", ")}`);
    return fallback;
  }
  return value as T;
}

function readOptionalString(source: EnvironmentSource, key: string): string {
  return source[key]?.trim() ?? "";
}

function isFeatureEnabled(
  config: Pick<
    RoommateAiConfiguration,
    "provider" | "enabled" | "parserEnabled" | "recommendationEnabled" | "explanationEnabled" | "safetyMode"
  >,
  feature: RoommateAiFeature
): boolean {
  if (config.provider !== "GEMINI" || !config.enabled) return false;
  if (feature === "PARSER") return config.parserEnabled;
  if (feature === "RECOMMENDATION") return config.recommendationEnabled;
  if (feature === "EXPLANATION") return config.explanationEnabled;
  return config.safetyMode !== "OFF";
}

export function parseRoommateAiConfiguration(source: EnvironmentSource): RoommateAiConfiguration {
  const issues: string[] = [];
  const provider = readEnum(source, "ROOMMATE_AI_PROVIDER", roommateAiProviderModes, "DISABLED", issues);
  const enabled = readBoolean(source, "ROOMMATE_AI_ENABLED", false, issues);
  const parserEnabled = readBoolean(source, "ROOMMATE_AI_PARSER_ENABLED", false, issues);
  const recommendationEnabled = readBoolean(source, "ROOMMATE_AI_RECOMMENDATION_ENABLED", false, issues);
  const explanationEnabled = readBoolean(source, "ROOMMATE_AI_EXPLANATION_ENABLED", false, issues);
  const safetyMode = readEnum(source, "ROOMMATE_AI_SAFETY_MODE", roommateAiSafetyModes, "OFF", issues);
  const geminiApiKey = readOptionalString(source, "GEMINI_API_KEY");
  if (readOptionalString(source, "NEXT_PUBLIC_GEMINI_API_KEY")) {
    issues.push("NEXT_PUBLIC_GEMINI_API_KEY is forbidden");
  }
  const models = Object.freeze({
    parser: readOptionalString(source, "ROOMMATE_AI_PARSER_MODEL"),
    recommendation: readOptionalString(source, "ROOMMATE_AI_RECOMMENDATION_MODEL"),
    explanation: readOptionalString(source, "ROOMMATE_AI_EXPLANATION_MODEL"),
    safety: readOptionalString(source, "ROOMMATE_AI_SAFETY_MODEL")
  });
  const timeoutsMs = Object.freeze({
    parser: readInteger(source, "ROOMMATE_AI_PARSER_TIMEOUT_MS", timeoutDefaults.parser, 100, 60_000, issues),
    recommendation: readInteger(
      source,
      "ROOMMATE_AI_RECOMMENDATION_TIMEOUT_MS",
      timeoutDefaults.recommendation,
      100,
      60_000,
      issues
    ),
    explanation: readInteger(
      source,
      "ROOMMATE_AI_EXPLANATION_TIMEOUT_MS",
      timeoutDefaults.explanation,
      100,
      60_000,
      issues
    ),
    safety: readInteger(source, "ROOMMATE_AI_SAFETY_TIMEOUT_MS", timeoutDefaults.safety, 100, 60_000, issues)
  });
  const maximumConcurrency = readInteger(source, "ROOMMATE_AI_MAX_CONCURRENCY", 4, 1, 16, issues);
  const rolloutPercentage = readInteger(source, "ROOMMATE_AI_ROLLOUT_PERCENTAGE", 0, 0, 100, issues);
  const configuration: RoommateAiConfiguration = Object.freeze({
    provider,
    enabled,
    parserEnabled,
    recommendationEnabled,
    explanationEnabled,
    safetyMode,
    geminiApiKey,
    models,
    timeoutsMs,
    maximumConcurrency,
    rolloutPercentage
  });

  const enabledFeatures: readonly [RoommateAiFeature, string][] = [
    ["PARSER", models.parser],
    ["RECOMMENDATION", models.recommendation],
    ["EXPLANATION", models.explanation],
    ["SAFETY", models.safety]
  ];
  if (enabledFeatures.some(([feature]) => isFeatureEnabled(configuration, feature))) {
    if (!geminiApiKey || isPlaceholder(geminiApiKey)) {
      issues.push("GEMINI_API_KEY must be configured with a non-placeholder server-side value when Gemini is enabled");
    }
  }
  for (const [feature, model] of enabledFeatures) {
    if (isFeatureEnabled(configuration, feature) && (!model || isPlaceholder(model))) {
      issues.push(
        `ROOMMATE_AI_${feature}_MODEL must be configured with a non-placeholder value when ${feature} is enabled`
      );
    }
  }

  if (issues.length > 0) throw new RoommateAiConfigurationError(issues);
  return configuration;
}

export function isRoommateAiFeatureEnabled(config: RoommateAiConfiguration, feature: RoommateAiFeature): boolean {
  return isFeatureEnabled(config, feature);
}
