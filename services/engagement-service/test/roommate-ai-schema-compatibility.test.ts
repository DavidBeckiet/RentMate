import assert from "node:assert/strict";
import test from "node:test";
import {
  assertGeminiJsonSchemaCompatible,
  findGeminiJsonSchemaIssues,
  toGeminiJsonSchema
} from "../src/modules/roommate-ai/providers/gemini-schema-adapter.js";
import { GeminiAiProvider } from "../src/modules/roommate-ai/providers/gemini-ai-provider.js";
import { infrastructureTestJsonSchema } from "../src/modules/roommate-ai/schemas/infrastructure-test-schema.js";
import {
  roommateAiExplanationJsonSchema,
  validateRoommateAiExplanationOutput
} from "../src/modules/roommate-ai/schemas/explanation-schema.js";
import {
  normalizeRoommateAiPreferencePreviewProviderOutput,
  roommateAiPreferencePreviewGeminiJsonSchema,
  roommateAiPreferencePreviewJsonSchema,
  validateRoommateAiPreferencePreviewOutput
} from "../src/modules/roommate-ai/schemas/preference-preview-schema.js";
import {
  roommateAiRecommendationJsonSchema,
  validateRoommateAiRecommendationOutput
} from "../src/modules/roommate-ai/schemas/recommendation-schema.js";
import {
  roommateAiSafetyJsonSchema,
  validateRoommateAiSafetyOutput
} from "../src/modules/roommate-ai/safety-analysis.js";

const providerSchemas = [
  ["infrastructure", infrastructureTestJsonSchema],
  ["preference PROFILE", roommateAiPreferencePreviewGeminiJsonSchema("PROFILE")],
  ["preference REQUEST", roommateAiPreferencePreviewGeminiJsonSchema("REQUEST")],
  ["recommendation", roommateAiRecommendationJsonSchema],
  ["explanation", roommateAiExplanationJsonSchema],
  ["safety", roommateAiSafetyJsonSchema]
] as const;

test("all Roommate Gemini schemas project to the supported structured-output subset", () => {
  const originalIssues = new Map(providerSchemas.map(([name, schema]) => [name, findGeminiJsonSchemaIssues(schema)]));
  assert.deepEqual(
    originalIssues.get("preference PROFILE"),
    [],
    "the parser schema itself must not contain unsupported keywords"
  );
  assert.deepEqual(
    originalIssues.get("preference REQUEST"),
    [],
    "the parser schema itself must not contain unsupported keywords"
  );
  assert.deepEqual(
    originalIssues.get("recommendation")?.map((issue) => `${issue.path}:${issue.keyword}`),
    [
      "$.properties.assertions.items.properties.token.minLength:minLength",
      "$.properties.assertions.items.properties.token.maxLength:maxLength"
    ]
  );
  assert.deepEqual(
    originalIssues.get("explanation")?.map((issue) => `${issue.path}:${issue.keyword}`),
    [
      "$.properties.summary.minLength:minLength",
      "$.properties.summary.maxLength:maxLength",
      "$.properties.cautions.items.properties.text.minLength:minLength",
      "$.properties.cautions.items.properties.text.maxLength:maxLength"
    ]
  );
  assert.deepEqual(
    originalIssues.get("safety")?.map((issue) => `${issue.path}:${issue.keyword}`),
    ["$.properties.signals.items.properties.evidenceMessageTokens.items.pattern:pattern"]
  );

  for (const [name, schema] of providerSchemas) {
    const projected = toGeminiJsonSchema(schema);
    assert.doesNotThrow(() => assertGeminiJsonSchemaCompatible(projected), name);
    assert.deepEqual(findGeminiJsonSchemaIssues(projected), [], name);
  }
});

test("schema adapter preserves supported references and removes incompatible siblings", () => {
  const referencedSchema = {
    type: "object",
    $defs: {
      message: { type: "string", minLength: 1 }
    },
    properties: { message: { $ref: "#/$defs/message" } }
  };
  const projected = toGeminiJsonSchema(referencedSchema);
  assert.deepEqual(projected, {
    type: "object",
    $defs: { message: { type: "string" } },
    properties: { message: { $ref: "#/$defs/message" } }
  });
  assert.deepEqual(findGeminiJsonSchemaIssues(projected), []);

  assert.throws(
    () => assertGeminiJsonSchemaCompatible({ $ref: "#/$defs/message", type: "string" }),
    /Gemini JSON schema is incompatible/
  );
  assert.deepEqual(toGeminiJsonSchema({ $ref: "#/$defs/message", type: "string" }), {
    $ref: "#/$defs/message"
  });

  const nullableReference = {
    type: "object",
    additionalProperties: false,
    required: ["message"],
    $defs: { message: { type: "string" } },
    properties: { message: { anyOf: [{ $ref: "#/$defs/message" }, { type: "null" }] } }
  };
  assert.deepEqual(findGeminiJsonSchemaIssues(nullableReference), []);

  const cyclicReference = {
    $defs: {
      first: { $ref: "#/$defs/second" },
      second: { $ref: "#/$defs/first" }
    },
    $ref: "#/$defs/first"
  };
  assert.equal(
    findGeminiJsonSchemaIssues(cyclicReference).some((issue) => issue.kind === "CIRCULAR_SCHEMA"),
    true
  );
  assert.equal(
    findGeminiJsonSchemaIssues({ $ref: "#/$defs/missing" }).some((issue) => issue.kind === "INVALID_REF"),
    true
  );
});

test("GeminiAiProvider sends only the projected schema to the provider", async () => {
  let capturedBody: Readonly<Record<string, unknown>> | null = null;
  const provider = new GeminiAiProvider({
    apiKey: "synthetic-server-only-key",
    fetchImplementation: async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Readonly<Record<string, unknown>>;
      return new Response(
        JSON.stringify({
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"message":"ok"}' }] } }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  });
  await provider.generate({
    task: "SYNTHETIC_SCHEMA_PROJECTION",
    instructions: "Return the requested JSON object.",
    input: { fixture: "synthetic" },
    responseJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["message"],
      properties: { message: { type: "string", minLength: 1, maxLength: 20 } }
    },
    model: "synthetic-model",
    maxOutputTokens: 16,
    timeoutMs: 100,
    versions: { promptVersion: "SYNTHETIC_PROMPT_V1", schemaVersion: "SYNTHETIC_SCHEMA_V1" },
    validateOutput: (value) => {
      assert.deepEqual(value, { message: "ok" });
      return value as { readonly message: string };
    }
  });
  const generationConfig = capturedBody?.generationConfig as Readonly<Record<string, unknown>>;
  assert.deepEqual(generationConfig.responseJsonSchema, {
    type: "object",
    additionalProperties: false,
    required: ["message"],
    properties: { message: { type: "string" } }
  });
});

test("strict parser validation remains authoritative after provider projection", () => {
  const text = "Mình thường ngủ sớm và thích nhà yên tĩnh.";
  const valid = {
    proposal: {
      sleepSchedule: { value: "EARLY", confidence: "HIGH", evidenceRanges: [{ start: 0, end: 4 }] }
    },
    unresolved: []
  };
  assert.doesNotThrow(() => validateRoommateAiPreferencePreviewOutput(valid, "PROFILE", text));
  assert.throws(() =>
    validateRoommateAiPreferencePreviewOutput(
      { ...valid, proposal: { ...valid.proposal, protectedField: valid.proposal.sleepSchedule } },
      "PROFILE",
      text
    )
  );
  assert.throws(() =>
    validateRoommateAiPreferencePreviewOutput(
      { ...valid, proposal: { sleepSchedule: { ...valid.proposal.sleepSchedule, value: "UNKNOWN" } } },
      "PROFILE",
      text
    )
  );
  assert.throws(() =>
    validateRoommateAiPreferencePreviewOutput(
      {
        ...valid,
        proposal: { sleepSchedule: { ...valid.proposal.sleepSchedule, evidenceRanges: [{ start: 0, end: 999 }] } }
      },
      "PROFILE",
      text
    )
  );
});

test("parser transport ranges decode back to the unchanged strict application shape", () => {
  const text = "Mình thường ngủ sớm và thích nhà yên tĩnh.";
  const transportOutput = {
    proposal: {
      sleepSchedule: { value: "EARLY", confidence: "HIGH", evidenceRanges: ["0:4"] }
    },
    unresolved: [{ reason: "AMBIGUOUS", evidenceRanges: ["5:9"] }]
  };
  const normalized = normalizeRoommateAiPreferencePreviewProviderOutput(transportOutput);
  assert.deepEqual(normalized, {
    proposal: {
      sleepSchedule: { value: "EARLY", confidence: "HIGH", evidenceRanges: [{ start: 0, end: 4 }] }
    },
    unresolved: [{ reason: "AMBIGUOUS", evidenceRanges: [{ start: 5, end: 9 }] }]
  });
  assert.doesNotThrow(() => validateRoommateAiPreferencePreviewOutput(normalized, "PROFILE", text));
  assert.throws(() =>
    validateRoommateAiPreferencePreviewOutput(
      normalizeRoommateAiPreferencePreviewProviderOutput({
        ...transportOutput,
        proposal: { sleepSchedule: { ...transportOutput.proposal.sleepSchedule, evidenceRanges: ["malformed"] } }
      }),
      "PROFILE",
      text
    )
  );
  assert.deepEqual(findGeminiJsonSchemaIssues(roommateAiPreferencePreviewJsonSchema("PROFILE")), []);
});

test("parser transport rejects malformed, unsafe, and out-of-input ranges", () => {
  const text = "synthetic preference text";
  const invalidRanges = ["abc", "10:", ":20", "-1:5", "10:2", "1.5:5", "NaN:5", "1:2:3", "0:999"];
  for (const encodedRange of invalidRanges) {
    const output = {
      proposal: {
        sleepSchedule: { value: "EARLY", confidence: "HIGH", evidenceRanges: [encodedRange] }
      },
      unresolved: []
    };
    assert.throws(
      () =>
        validateRoommateAiPreferencePreviewOutput(
          normalizeRoommateAiPreferencePreviewProviderOutput(output),
          "PROFILE",
          text
        ),
      encodedRange
    );
  }
});

test("strict downstream validators retain bounds and grounding omitted by Gemini", () => {
  const sources = new Map([["123456789", { PROFILE_INTRO: "123456789", REQUEST_NOTE: null }]] as const);
  assert.throws(() =>
    validateRoommateAiRecommendationOutput(
      {
        assertions: [{ token: "123456789", concept: "QUIET_HOME", source: "PROFILE_INTRO", start: 0, end: 9 }]
      },
      sources
    )
  );

  assert.throws(() =>
    validateRoommateAiExplanationOutput(
      {
        summary: "x".repeat(601),
        evidenceRefs: [{ dimension: "ROUTINE", explanationCode: "ALIGNED" }],
        cautions: []
      },
      []
    )
  );

  assert.throws(() =>
    validateRoommateAiSafetyOutput({ signals: [{ code: "OTP_REQUEST", evidenceMessageTokens: ["M6"] }] }, [
      { token: "M0", role: "SENDER", text: "synthetic" }
    ])
  );
});
