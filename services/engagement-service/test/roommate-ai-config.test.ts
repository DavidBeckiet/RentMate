import assert from "node:assert/strict";
import test from "node:test";
import {
  RoommateAiConfigurationError,
  isRoommateAiFeatureEnabled,
  parseRoommateAiConfiguration
} from "../src/modules/roommate-ai/config/roommate-ai-config.js";

const enabledParserEnvironment = Object.freeze({
  ROOMMATE_AI_PROVIDER: "GEMINI",
  ROOMMATE_AI_ENABLED: "true",
  ROOMMATE_AI_PARSER_ENABLED: "true",
  GEMINI_API_KEY: "test-server-key",
  ROOMMATE_AI_PARSER_MODEL: "gemini-test"
});

test("Roommate AI defaults to disabled without a Gemini key or feature models", () => {
  const config = parseRoommateAiConfiguration({});
  assert.equal(config.provider, "DISABLED");
  assert.equal(config.enabled, false);
  assert.equal(config.safetyMode, "OFF");
  assert.deepEqual(config.timeoutsMs, {
    parser: 5_000,
    recommendation: 8_000,
    explanation: 5_000,
    safety: 6_000
  });
  assert.equal(config.maximumConcurrency, 4);
  assert.equal(config.rolloutPercentage, 0);
  assert.equal(isRoommateAiFeatureEnabled(config, "PARSER"), false);
  assert.equal(isRoommateAiFeatureEnabled(config, "SAFETY"), false);
});

test("Roommate AI requires only models for enabled Gemini features", () => {
  const config = parseRoommateAiConfiguration(enabledParserEnvironment);
  assert.equal(isRoommateAiFeatureEnabled(config, "PARSER"), true);
  assert.equal(isRoommateAiFeatureEnabled(config, "RECOMMENDATION"), false);
  assert.equal(config.models.recommendation, "");

  for (const [key, value] of [
    ["GEMINI_API_KEY", ""],
    ["GEMINI_API_KEY", "<placeholder>"],
    ["ROOMMATE_AI_PARSER_MODEL", ""],
    ["ROOMMATE_AI_PARSER_MODEL", "your-model"]
  ] as const) {
    assert.throws(
      () => parseRoommateAiConfiguration({ ...enabledParserEnvironment, [key]: value }),
      (error: unknown) => {
        assert.equal(error instanceof RoommateAiConfigurationError, true);
        assert.equal(error instanceof Error && error.message.includes("test-server-key"), false);
        return true;
      }
    );
  }
});

test("Roommate AI validates provider, safety mode, bounds, and enabled safety model", () => {
  for (const [key, value] of [
    ["ROOMMATE_AI_PROVIDER", "OPENAI"],
    ["NEXT_PUBLIC_GEMINI_API_KEY", "test-browser-key"],
    ["ROOMMATE_AI_SAFETY_MODE", "WARN"],
    ["ROOMMATE_AI_PARSER_TIMEOUT_MS", "99"],
    ["ROOMMATE_AI_MAX_CONCURRENCY", "17"],
    ["ROOMMATE_AI_ROLLOUT_PERCENTAGE", "101"]
  ] as const) {
    assert.throws(() => parseRoommateAiConfiguration({ [key]: value }), new RegExp(key, "u"));
  }

  assert.throws(
    () =>
      parseRoommateAiConfiguration({
        ROOMMATE_AI_PROVIDER: "GEMINI",
        ROOMMATE_AI_ENABLED: "true",
        ROOMMATE_AI_SAFETY_MODE: "SHADOW",
        GEMINI_API_KEY: "test-server-key"
      }),
    /ROOMMATE_AI_SAFETY_MODEL/u
  );
});
