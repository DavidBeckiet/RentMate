import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import { FakeAiProvider, fakeAiProviderScenarios } from "../src/modules/roommate-ai/providers/fake-ai-provider.js";
import { GeminiAiProvider } from "../src/modules/roommate-ai/providers/gemini-ai-provider.js";
import type { AiGenerationRequest } from "../src/modules/roommate-ai/providers/ai-provider.js";
import {
  infrastructureTestInstructions,
  infrastructureTestJsonSchema,
  infrastructureTestPromptVersion,
  infrastructureTestSchemaVersion,
  infrastructureTestTask,
  validateInfrastructureTestOutput,
  type InfrastructureTestOutput
} from "../src/modules/roommate-ai/schemas/infrastructure-test-schema.js";

function request(
  overrides: Partial<AiGenerationRequest<InfrastructureTestOutput>> = {}
): AiGenerationRequest<InfrastructureTestOutput> {
  return {
    task: infrastructureTestTask,
    instructions: infrastructureTestInstructions,
    input: { fixture: "synthetic" },
    responseJsonSchema: infrastructureTestJsonSchema,
    model: "gemini-test-model",
    maxOutputTokens: 32,
    timeoutMs: 100,
    versions: { promptVersion: infrastructureTestPromptVersion, schemaVersion: infrastructureTestSchemaVersion },
    validateOutput: validateInfrastructureTestOutput,
    ...overrides
  };
}

function geminiResponse(output: unknown, overrides: Readonly<Record<string, unknown>> = {}): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(output) }] } }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
      ...overrides
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

test("FakeAiProvider is deterministic and maps all failure scenarios to sanitized application errors", async () => {
  const provider = new FakeAiProvider();
  const result = await provider.generate(request());
  assert.deepEqual(result.output, { status: "OK", labels: ["A"] });
  assert.equal(provider.requests.length, 1);

  for (const scenario of fakeAiProviderScenarios.filter((value) => value !== "SUCCESS")) {
    await assert.rejects(
      () => new FakeAiProvider({ scenario }).generate(request()),
      (error: unknown) => {
        assert.equal(error instanceof ApplicationError, true, scenario);
        assert.equal(
          error instanceof ApplicationError &&
            ["AI_TIMEOUT", "AI_PROVIDER_UNAVAILABLE", "AI_OUTPUT_INVALID"].includes(error.code),
          true,
          scenario
        );
        return true;
      }
    );
  }
});

test("the independent infrastructure validator rejects complete invalid shapes without partial salvage", () => {
  assert.deepEqual(validateInfrastructureTestOutput({ status: "OK", labels: ["A"] }), { status: "OK", labels: ["A"] });
  for (const value of [
    { labels: ["A"] },
    { status: "OTHER", labels: ["A"] },
    { status: "OK", labels: ["A", "B", "C", "A"] },
    { status: "OK", labels: [["A"]] },
    { status: "OK", labels: ["A"], unexpected: true }
  ]) {
    assert.throws(() => validateInfrastructureTestOutput(value));
  }
  assert.equal(infrastructureTestPromptVersion, "ROOMMATE_AI_INFRASTRUCTURE_PROMPT_V1");
  assert.equal(infrastructureTestSchemaVersion, "ROOMMATE_AI_INFRASTRUCTURE_SCHEMA_V1");
});

test("GeminiAiProvider uses one stateless structured generateContent request without leaking the API key into its URL", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const provider = new GeminiAiProvider({
    apiKey: "test-server-key",
    fetchImplementation: async (input, init) => {
      capturedUrl = input.toString();
      capturedInit = init;
      return geminiResponse({ status: "OK", labels: ["A", "B"] });
    }
  });

  const result = await provider.generate(request());
  assert.deepEqual(result, {
    output: { status: "OK", labels: ["A", "B"] },
    usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 }
  });
  assert.equal(
    capturedUrl,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent"
  );
  assert.equal(capturedUrl.includes("test-server-key"), false);
  assert.equal(capturedInit?.method, "POST");
  assert.equal((capturedInit?.headers as Record<string, string>)["x-goog-api-key"], "test-server-key");
  const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
  assert.deepEqual(body.generationConfig, {
    candidateCount: 1,
    maxOutputTokens: 32,
    responseMimeType: "application/json",
    responseJsonSchema: infrastructureTestJsonSchema
  });
  assert.equal("tools" in body, false);
  assert.equal("cachedContent" in body, false);
  assert.equal("systemInstruction" in body, true);
  assert.equal(Array.isArray(body.contents), true);
  assert.equal(capturedInit?.signal instanceof AbortSignal, true);
});

test("GeminiAiProvider rejects safety, invalid output, provider status, transport, and timeout cases without raw errors", async () => {
  const cases: readonly [string, typeof fetch, string][] = [
    [
      "safety block",
      async () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 }),
      "AI_OUTPUT_INVALID"
    ],
    [
      "multiple candidates",
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              { finishReason: "STOP", content: { parts: [{ text: '{"status":"OK","labels":["A"]}' }] } },
              { finishReason: "STOP", content: { parts: [{ text: '{"status":"OK","labels":["A"]}' }] } }
            ]
          }),
          { status: 200 }
        ),
      "AI_OUTPUT_INVALID"
    ],
    [
      "additional property",
      async () => geminiResponse({ status: "OK", labels: ["A"], extra: true }),
      "AI_OUTPUT_INVALID"
    ],
    ["malformed JSON", async () => new Response("not-json", { status: 200 }), "AI_OUTPUT_INVALID"],
    ["rate limit", async () => new Response("ignored", { status: 429 }), "AI_PROVIDER_UNAVAILABLE"],
    ["permission", async () => new Response("ignored", { status: 403 }), "AI_PROVIDER_UNAVAILABLE"],
    ["server error", async () => new Response("ignored", { status: 503 }), "AI_PROVIDER_UNAVAILABLE"],
    ["transport", async () => Promise.reject(new Error("network detail")), "AI_PROVIDER_UNAVAILABLE"],
    [
      "timeout",
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
          );
        }),
      "AI_TIMEOUT"
    ]
  ];

  for (const [label, fetchImplementation, expectedCode] of cases) {
    await assert.rejects(
      () =>
        new GeminiAiProvider({ apiKey: "test-server-key", fetchImplementation }).generate(request({ timeoutMs: 5 })),
      (error: unknown) => {
        assert.equal(error instanceof ApplicationError, true, label);
        assert.equal(error instanceof ApplicationError && error.code, expectedCode, label);
        assert.equal(error instanceof Error && error.message.includes("network detail"), false, label);
        return true;
      }
    );
  }
});
