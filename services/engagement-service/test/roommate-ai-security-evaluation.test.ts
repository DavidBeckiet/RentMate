import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import { parseRoommateAiConfiguration } from "../src/modules/roommate-ai/config/roommate-ai-config.js";
import { GeminiAiProvider } from "../src/modules/roommate-ai/providers/gemini-ai-provider.js";
import type { AiGenerationRequest } from "../src/modules/roommate-ai/providers/ai-provider.js";
import type { RoommateAiSafetyRepository } from "../src/modules/roommate-ai/repositories/roommate-ai-safety-repository.js";
import { RoommateAiCapabilityService } from "../src/modules/roommate-ai/services/roommate-ai-capability-service.js";
import {
  createRoommateAiSafetyWorker,
  roommateAiSafetyWorkerPolicy
} from "../src/modules/roommate-ai/services/roommate-ai-safety-worker.js";
import {
  buildRoommateAiSafetyContext,
  redactRoommateAiSafetyText
} from "../src/modules/roommate-ai/safety-analysis.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const serviceDirectory = path.resolve(testDirectory, "..");
const repositoryDirectory = path.resolve(serviceDirectory, "..", "..");
const roommateAiSourceDirectory = path.join(serviceDirectory, "src", "modules", "roommate-ai");

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      return ["node_modules", ".next", "coverage"].includes(entry) ? [] : sourceFiles(absolute);
    }
    return absolute.endsWith(".ts") || absolute.endsWith(".tsx") ? [absolute] : [];
  });
}

test("V3-07 source audit keeps Gemini server-only, stateless, tool-free, and on one fixed outbound path", async () => {
  const files = sourceFiles(roommateAiSourceDirectory);
  const sources = files.map((file) => Object.freeze({ file, content: readFileSync(file, "utf8") }));
  assert.deepEqual(
    sources.filter(({ content }) => /console\.(?:log|debug|info|warn|error)\s*\(/u.test(content)),
    []
  );
  assert.deepEqual(
    sources
      .filter(({ content }) => content.includes("https://"))
      .map(({ file }) => path.relative(serviceDirectory, file).replaceAll("\\", "/")),
    ["src/modules/roommate-ai/providers/gemini-ai-provider.ts"]
  );
  assert.deepEqual(
    sources
      .filter(({ content }) => /\bfetch(?:Implementation)?\s*\(/u.test(content))
      .map(({ file }) => path.relative(serviceDirectory, file).replaceAll("\\", "/")),
    ["src/modules/roommate-ai/providers/gemini-ai-provider.ts"]
  );

  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const provider = new GeminiAiProvider({
    apiKey: "synthetic-server-only-key",
    fetchImplementation: async (input, init) => {
      capturedUrl = input.toString();
      capturedInit = init;
      return new Response(
        JSON.stringify({
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ status: "OK" }) }] } }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  });
  const request: AiGenerationRequest<{ readonly status: "OK" }> = {
    task: "ROOMMATE_V3_SECURITY_EVALUATION",
    instructions: "Synthetic structured evaluation.",
    input: { fixture: "synthetic-only" },
    responseJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["status"],
      properties: { status: { type: "string", enum: ["OK"] } }
    },
    model: "synthetic-model",
    maxOutputTokens: 16,
    timeoutMs: 100,
    versions: { promptVersion: "SYNTHETIC_PROMPT_V1", schemaVersion: "SYNTHETIC_SCHEMA_V1" },
    validateOutput: (value) => {
      assert.deepEqual(value, { status: "OK" });
      return value as { readonly status: "OK" };
    }
  };
  await provider.generate(request);
  const body = JSON.parse(String(capturedInit?.body)) as Readonly<Record<string, unknown>>;
  assert.equal(capturedUrl.includes("synthetic-server-only-key"), false);
  assert.equal(
    (capturedInit?.headers as Readonly<Record<string, string>>)["x-goog-api-key"],
    "synthetic-server-only-key"
  );
  assert.deepEqual(Object.keys(body).sort(), ["contents", "generationConfig", "systemInstruction"]);
  for (const forbidden of ["tools", "toolConfig", "grounding", "cachedContent", "files", "session", "url"]) {
    assert.equal(forbidden in body, false, forbidden);
  }
  const generationConfig = body.generationConfig as Readonly<Record<string, unknown>>;
  assert.equal(generationConfig.candidateCount, 1);
  assert.equal(generationConfig.responseMimeType, "application/json");
  assert.deepEqual(generationConfig.responseJsonSchema, request.responseJsonSchema);
});

test("V3-07 secret audit rejects browser Gemini configuration without reading or printing local credentials", () => {
  assert.throws(
    () => parseRoommateAiConfiguration({ NEXT_PUBLIC_GEMINI_API_KEY: "synthetic-browser-key" }),
    /NEXT_PUBLIC_GEMINI_API_KEY/u
  );
  const frontendFiles = sourceFiles(path.join(repositoryDirectory, "frontend"));
  const clientReferences = frontendFiles.filter((file) => readFileSync(file, "utf8").includes("GEMINI_API_KEY"));
  assert.deepEqual(clientReferences, []);
  const exampleEnvironment = readFileSync(path.join(repositoryDirectory, ".env.example"), "utf8");
  assert.match(exampleEnvironment, /^GEMINI_API_KEY=\s*$/mu);
  assert.doesNotMatch(exampleEnvironment, /^NEXT_PUBLIC_GEMINI_API_KEY=/mu);
});

test("V3-07 rollout cohorts are stable and OFF/SHADOW never expose tenant warnings", () => {
  const environment = {
    ROOMMATE_AI_PROVIDER: "GEMINI",
    ROOMMATE_AI_ENABLED: "true",
    ROOMMATE_AI_PARSER_ENABLED: "true",
    ROOMMATE_AI_RECOMMENDATION_ENABLED: "true",
    ROOMMATE_AI_EXPLANATION_ENABLED: "true",
    GEMINI_API_KEY: "synthetic-server-key",
    ROOMMATE_AI_PARSER_MODEL: "synthetic-parser",
    ROOMMATE_AI_RECOMMENDATION_MODEL: "synthetic-recommendation",
    ROOMMATE_AI_EXPLANATION_MODEL: "synthetic-explanation",
    ROOMMATE_AI_SAFETY_MODEL: "synthetic-safety",
    ROOMMATE_AI_ROLLOUT_PERCENTAGE: "37"
  } as const;
  const tenantMode = new RoommateAiCapabilityService(
    parseRoommateAiConfiguration({ ...environment, ROOMMATE_AI_SAFETY_MODE: "TENANT" })
  );
  const shadowMode = new RoommateAiCapabilityService(
    parseRoommateAiConfiguration({ ...environment, ROOMMATE_AI_SAFETY_MODE: "SHADOW" })
  );
  const offMode = new RoommateAiCapabilityService(
    parseRoommateAiConfiguration({ ...environment, ROOMMATE_AI_SAFETY_MODE: "OFF" })
  );
  const tenants = Array.from({ length: 200 }, (_, index) => ({ userId: index + 1, role: "TENANT" as const }));
  const first = tenants.map((principal) => tenantMode.getCapabilities(principal));
  const second = tenants.map((principal) => tenantMode.getCapabilities(principal));
  assert.deepEqual(second, first);
  assert.equal(
    first.some((capability) => capability.safetyWarnings),
    true
  );
  assert.equal(
    first.some((capability) => !capability.safetyWarnings),
    true
  );
  for (const principal of tenants) {
    assert.equal(shadowMode.getCapabilities(principal).safetyWarnings, false);
    assert.equal(offMode.getCapabilities(principal).safetyWarnings, false);
  }
});

test("V3-07 redaction handles synthetic punctuation variants and never follows supplied URLs", () => {
  const synthetic = [
    "email synthetic.user@example.invalid",
    "phone 000-000-0000",
    "url https://synthetic.invalid/path",
    "OTP: 000000",
    "account number 1111222233334444",
    "password: SYNTHETIC_ONLY",
    "emoji😊https://synthetic.invalid/next"
  ].join(" | ");
  const redacted = redactRoommateAiSafetyText(synthetic);
  for (const raw of [
    "synthetic.user@example.invalid",
    "000-000-0000",
    "https://synthetic.invalid/path",
    "000000",
    "1111222233334444",
    "SYNTHETIC_ONLY",
    "https://synthetic.invalid/next"
  ]) {
    assert.equal(redacted.includes(raw), false, raw);
  }
  for (const placeholder of ["<EMAIL>", "<PHONE>", "<URL>", "<OTP>", "<ACCOUNT>", "<SECRET>"]) {
    assert.equal(redacted.includes(placeholder), true, placeholder);
  }
  const context = buildRoommateAiSafetyContext({
    target: {
      id: 99,
      senderTenantId: 1,
      body: synthetic,
      createdAt: "2026-08-31T00:00:00.000Z"
    },
    previous: []
  });
  assert.deepEqual(Object.keys(context[0]!).sort(), ["role", "text", "token"]);
  assert.equal(context[0]?.token, "M0");
  assert.equal(JSON.stringify(context).includes("99"), false);
});

test("V3-07 safety observability and failures remain aggregate and sanitized", async () => {
  const persistedErrors: string[] = [];
  const logged: unknown[] = [];
  const repository: RoommateAiSafetyRepository = {
    discover: async () => 1,
    terminalizeStale: async () => 0,
    claim: async () => [{ id: 1, messageId: 1, attemptCount: 1 }],
    loadContext: async () => ({
      target: {
        id: 1,
        senderTenantId: 1,
        body: "Synthetic message payload that must never be logged.",
        createdAt: "2026-08-31T00:00:00.000Z"
      },
      previous: []
    }),
    complete: async () => false,
    listCompletedProjections: async () => new Map(),
    fail: async (_executor, input) => {
      persistedErrors.push(input.errorCode);
      return true;
    },
    cleanup: async () => 0
  };
  const worker = createRoommateAiSafetyWorker({
    configuration: parseRoommateAiConfiguration({
      ROOMMATE_AI_PROVIDER: "GEMINI",
      ROOMMATE_AI_ENABLED: "true",
      ROOMMATE_AI_SAFETY_MODE: "SHADOW",
      GEMINI_API_KEY: "synthetic-server-key",
      ROOMMATE_AI_SAFETY_MODEL: "synthetic-safety"
    }),
    provider: {
      async generate() {
        throw new Error("Synthetic message payload that must never be logged.");
      }
    },
    repository,
    transactionRunner: { run: (operation) => operation({ query: async () => ({ rows: [], rowCount: 0 }) } as never) },
    logger: {
      info(message, metadata) {
        logged.push({ message, metadata });
      },
      error(message, metadata) {
        logged.push({ message, metadata });
      }
    }
  });
  const result = await worker.runOnce();
  assert.deepEqual(result, { discovered: 1, claimed: 1, completed: 0, failed: 1 });
  assert.deepEqual(persistedErrors, ["INTERNAL_ERROR"]);
  const serializedLogs = JSON.stringify(logged);
  assert.equal(serializedLogs.includes("Synthetic message payload"), false);
  assert.equal(serializedLogs.includes("synthetic-server-key"), false);
  assert.equal(serializedLogs.includes('"messageId"'), false);
  assert.deepEqual(logged, [
    {
      message: "Roommate AI safety worker completed",
      metadata: { discovered: 1, claimed: 1, completed: 0, failed: 1 }
    }
  ]);
});

test("V3-07 retention, timeout, and bounded-work policies remain frozen", () => {
  const disabled = parseRoommateAiConfiguration({});
  assert.equal(disabled.provider, "DISABLED");
  assert.equal(disabled.geminiApiKey, "");
  assert.deepEqual(disabled.timeoutsMs, {
    parser: 5_000,
    recommendation: 8_000,
    explanation: 5_000,
    safety: 6_000
  });
  assert.equal(roommateAiSafetyWorkerPolicy.retentionMs, 180 * 24 * 60 * 60 * 1_000);
  assert.equal(roommateAiSafetyWorkerPolicy.scanBatchSize, 100);
  assert.equal(roommateAiSafetyWorkerPolicy.processingBatchSize, 20);
  assert.equal(roommateAiSafetyWorkerPolicy.maximumAttempts, 2);
  assert.equal(roommateAiSafetyWorkerPolicy.maxOutputTokens, 300);

  const migration = readFileSync(
    path.join(serviceDirectory, "migrations", "0020_roommate_ai_safety_analyses.sql"),
    "utf8"
  );
  for (const forbiddenColumn of ["message_body", "raw_message", "prompt_body", "provider_response", "raw_response"]) {
    assert.doesNotMatch(migration, new RegExp(`\\b${forbiddenColumn}\\b`, "iu"));
  }
  for (const requiredMetadata of [
    "analysis_version",
    "prompt_version",
    "schema_version",
    "provider",
    "model_identifier",
    "status",
    "last_error_code",
    "analyzed_at"
  ]) {
    assert.match(migration, new RegExp(`\\b${requiredMetadata}\\b`, "u"));
  }
});

test("V3-07 capability lookup is provider-free by construction", () => {
  const configuration = parseRoommateAiConfiguration({});
  const capabilityService = new RoommateAiCapabilityService(configuration);
  const principal: AuthenticatedPrincipal = Object.freeze({ userId: 1, role: "TENANT" });
  assert.deepEqual(capabilityService.getCapabilities(principal), {
    preferenceParsing: false,
    semanticRecommendations: false,
    compatibilityExplanations: false,
    safetyWarnings: false
  });
});
