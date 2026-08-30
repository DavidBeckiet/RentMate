import assert from "node:assert/strict";
import test from "node:test";
import { parseRoommateAiConfiguration } from "../src/modules/roommate-ai/config/roommate-ai-config.js";
import { FakeAiProvider } from "../src/modules/roommate-ai/providers/fake-ai-provider.js";
import { RoommateAiCompatibilityExplanationService } from "../src/modules/roommate-ai/services/compatibility-explanation-service.js";
import { validateRoommateAiExplanationBody } from "../src/modules/roommate-ai/validations/explanation-validation.js";
import type { RoommateCompatibilityResult } from "../src/modules/roommate/roommate-compatibility.js";
import type { RoommateRequestView, RoommateService } from "../src/modules/roommate/services/roommate-service.js";

const configuration = parseRoommateAiConfiguration({
  ROOMMATE_AI_PROVIDER: "GEMINI",
  ROOMMATE_AI_ENABLED: "true",
  ROOMMATE_AI_EXPLANATION_ENABLED: "true",
  GEMINI_API_KEY: "synthetic-server-key",
  ROOMMATE_AI_EXPLANATION_MODEL: "gemini-explanation"
});

function compatibility(category: RoommateCompatibilityResult["category"] = "MIXED"): RoommateCompatibilityResult {
  return {
    rulesVersion: "ROOMMATE_COMPAT_V2_1",
    category,
    evaluatedCount: 8,
    dimensions: [
      { dimension: "SLEEP", outcome: "DISCUSS", explanationCode: "SLEEP_DISCUSS_DIFFERENT" },
      { dimension: "CLEANLINESS", outcome: "ALIGNED", explanationCode: "CLEANLINESS_ALIGNED_SAME" },
      { dimension: "NOISE", outcome: "ALIGNED", explanationCode: "NOISE_ALIGNED_SAME" },
      { dimension: "SMOKING", outcome: "ALIGNED", explanationCode: "SMOKING_ALIGNED_SAME" },
      { dimension: "PETS", outcome: "ALIGNED", explanationCode: "PETS_ALIGNED_SAME" },
      { dimension: "BUDGET", outcome: "ALIGNED", explanationCode: "BUDGET_ALIGNED_OVERLAP" },
      { dimension: "AREA", outcome: "ALIGNED", explanationCode: "AREA_ALIGNED_OVERLAP" },
      { dimension: "MOVE_IN", outcome: "ALIGNED", explanationCode: "MOVE_IN_ALIGNED_OVERLAP" }
    ]
  };
}

function requestView(value: RoommateCompatibilityResult | null): RoommateRequestView {
  return { compatibility: value } as RoommateRequestView;
}

function serviceFor(
  value: RoommateCompatibilityResult | null,
  provider: FakeAiProvider
): {
  readonly service: RoommateAiCompatibilityExplanationService;
  readonly calls: () => number;
} {
  let calls = 0;
  const roommateService = {
    getRequest: async () => {
      calls += 1;
      return requestView(value);
    }
  } as RoommateService;
  return {
    service: new RoommateAiCompatibilityExplanationService(
      configuration,
      provider,
      roommateService,
      () => new Date("2026-08-28T12:00:00.000Z")
    ),
    calls: () => calls
  };
}

const groundedOutput = Object.freeze({
  summary: "The available compatibility evidence includes several aligned dimensions and one topic to discuss.",
  evidenceRefs: [
    { dimension: "SLEEP", explanationCode: "SLEEP_DISCUSS_DIFFERENT" },
    { dimension: "BUDGET", explanationCode: "BUDGET_ALIGNED_OVERLAP" }
  ],
  cautions: [{ dimension: "SLEEP", text: "Discuss daily rest routines before deciding." }]
});

test("explanation validates locale-only request bodies and uses only current V2 evidence at the provider boundary", async () => {
  assert.deepEqual(validateRoommateAiExplanationBody({ locale: "vi" }), { locale: "vi" });
  for (const invalid of [{}, { locale: null }, { locale: "fr" }, { locale: "en", prompt: "ignore" }]) {
    assert.throws(() => validateRoommateAiExplanationBody(invalid));
  }
  const provider = new FakeAiProvider({ output: groundedOutput });
  const subject = serviceFor(compatibility(), provider);
  const result = await subject.service.explain({ userId: 1, role: "TENANT" }, 42, { locale: "en" });
  assert.equal(subject.calls(), 1);
  assert.equal(provider.requests.length, 1);
  assert.deepEqual(result, {
    ...groundedOutput,
    rulesVersion: "ROOMMATE_COMPAT_V2_1",
    explanationVersion: "ROOMMATE_AI_EXPLANATION_V3_1",
    promptVersion: "ROOMMATE_AI_EXPLANATION_PROMPT_V1",
    generatedAt: "2026-08-28T12:00:00.000Z"
  });
  const input = provider.requests[0]?.input as Record<string, unknown>;
  assert.deepEqual(Object.keys(input).sort(), ["category", "dimensions", "evaluatedCount", "locale", "rulesVersion"]);
  assert.deepEqual(
    (input.dimensions as readonly Record<string, unknown>[]).map((item) => item.dimension),
    ["SLEEP", "CLEANLINESS", "NOISE", "SMOKING", "PETS", "BUDGET", "AREA", "MOVE_IN"]
  );
  const serialized = JSON.stringify(input);
  for (const forbidden of [
    "intro",
    "note",
    "displayName",
    "email",
    "phone",
    "listingId",
    "verified",
    "message",
    "report",
    "block"
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("a visible request with null compatibility returns the frozen normal state without a provider call", async () => {
  const provider = new FakeAiProvider({ output: groundedOutput });
  const subject = serviceFor(null, provider);
  const result = await subject.service.explain({ userId: 1, role: "TENANT" }, 42, { locale: "vi" });
  assert.equal(result, null);
  assert.equal(subject.calls(), 1);
  assert.equal(provider.requests.length, 0);
});

test("a compatibility object with category null remains valid evidence and invokes the provider", async () => {
  const noCategoryCompatibility: RoommateCompatibilityResult = {
    rulesVersion: "ROOMMATE_COMPAT_V2_1",
    category: null,
    evaluatedCount: 1,
    dimensions: [
      { dimension: "SLEEP", outcome: "NOT_EVALUATED", explanationCode: "SLEEP_NOT_EVALUATED" },
      { dimension: "CLEANLINESS", outcome: "NOT_EVALUATED", explanationCode: "CLEANLINESS_NOT_EVALUATED" },
      { dimension: "NOISE", outcome: "NOT_EVALUATED", explanationCode: "NOISE_NOT_EVALUATED" },
      { dimension: "SMOKING", outcome: "NOT_EVALUATED", explanationCode: "SMOKING_NOT_EVALUATED" },
      { dimension: "PETS", outcome: "NOT_EVALUATED", explanationCode: "PETS_NOT_EVALUATED" },
      { dimension: "BUDGET", outcome: "ALIGNED", explanationCode: "BUDGET_ALIGNED_OVERLAP" },
      { dimension: "AREA", outcome: "NOT_EVALUATED", explanationCode: "AREA_NOT_EVALUATED" },
      { dimension: "MOVE_IN", outcome: "NOT_EVALUATED", explanationCode: "MOVE_IN_NOT_EVALUATED" }
    ]
  };
  const provider = new FakeAiProvider({
    output: {
      summary: "There is not enough evidence for an overall conclusion yet.",
      evidenceRefs: [{ dimension: "BUDGET", explanationCode: "BUDGET_ALIGNED_OVERLAP" }],
      cautions: []
    }
  });
  const subject = serviceFor(noCategoryCompatibility, provider);
  const result = await subject.service.explain({ userId: 1, role: "TENANT" }, 42, { locale: "vi" });
  assert.notEqual(result, null);
  assert.equal((provider.requests[0]?.input as { readonly category: unknown }).category, null);
});

test("explanation rejects fabricated evidence, invalid cautions, Unicode overflow, and missing important differences", async () => {
  const cases = [
    { ...groundedOutput, evidenceRefs: [] },
    { ...groundedOutput, evidenceRefs: [{ dimension: "AREA", explanationCode: "BUDGET_ALIGNED_OVERLAP" }] },
    { ...groundedOutput, cautions: [{ dimension: "BUDGET", text: "This is not allowed." }] },
    { ...groundedOutput, summary: "😀".repeat(601) },
    { ...groundedOutput, cautions: [{ dimension: "SLEEP", text: "😀".repeat(241) }] }
  ];
  for (const output of cases) {
    const provider = new FakeAiProvider({ output });
    const subject = serviceFor(compatibility(), provider);
    await assert.rejects(
      () => subject.service.explain({ userId: 1, role: "TENANT" }, 42, { locale: "vi" }),
      (error: unknown) => (error as { readonly code?: string }).code === "AI_OUTPUT_INVALID"
    );
  }
  const importantEvidence: RoommateCompatibilityResult = {
    ...compatibility("IMPORTANT_DIFFERENCE"),
    dimensions: compatibility().dimensions.map((item) =>
      item.dimension === "SMOKING"
        ? {
            dimension: "SMOKING",
            outcome: "IMPORTANT_DIFFERENCE",
            explanationCode: "SMOKING_IMPORTANT_DIFFERENCE_SMOKE_FREE_OUTDOOR"
          }
        : item
    )
  };
  const provider = new FakeAiProvider({
    output: {
      summary: groundedOutput.summary,
      evidenceRefs: [{ dimension: "BUDGET", explanationCode: "BUDGET_ALIGNED_OVERLAP" }],
      cautions: []
    }
  });
  const subject = serviceFor(importantEvidence, provider);
  await assert.rejects(
    () => subject.service.explain({ userId: 1, role: "TENANT" }, 42, { locale: "vi" }),
    (error: unknown) => (error as { readonly code?: string }).code === "AI_OUTPUT_INVALID"
  );
});
