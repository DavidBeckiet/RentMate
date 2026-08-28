import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import { parseRoommateAiConfiguration } from "../src/modules/roommate-ai/config/roommate-ai-config.js";
import { FakeAiProvider } from "../src/modules/roommate-ai/providers/fake-ai-provider.js";
import { RoommateAiPreferencePreviewService } from "../src/modules/roommate-ai/services/preference-preview-service.js";
import { validateRoommateAiPreferencePreviewOutput } from "../src/modules/roommate-ai/schemas/preference-preview-schema.js";
import { validateRoommateAiPreferencePreviewBody } from "../src/modules/roommate-ai/validations/preference-preview-validation.js";

const enabledConfig = parseRoommateAiConfiguration({
  ROOMMATE_AI_PROVIDER: "GEMINI",
  ROOMMATE_AI_ENABLED: "true",
  ROOMMATE_AI_PARSER_ENABLED: "true",
  GEMINI_API_KEY: "synthetic-server-key",
  ROOMMATE_AI_PARSER_MODEL: "gemini-test"
});

test("normalizes parser input by NFC, CRLF, trimming, and Unicode code points", () => {
  const text = `  Mình thích yên tĩnh\r\n${"😀".repeat(4)} và không hút thuốc  `;
  const result = validateRoommateAiPreferencePreviewBody({ target: "PROFILE", text, locale: "vi" });
  assert.equal(result.text, `Mình thích yên tĩnh\n${"😀".repeat(4)} và không hút thuốc`);
  assert.throws(() =>
    validateRoommateAiPreferencePreviewBody({ target: "PROFILE", text: "a".repeat(19), locale: "vi" })
  );
  assert.doesNotThrow(() =>
    validateRoommateAiPreferencePreviewBody({ target: "PROFILE", text: "😀".repeat(20), locale: "vi" })
  );
  assert.throws(() =>
    validateRoommateAiPreferencePreviewBody({ target: "PROFILE", text: "😀".repeat(2001), locale: "vi" })
  );
  assert.throws(() =>
    validateRoommateAiPreferencePreviewBody({ target: "PROFILE", text: "a".repeat(20), locale: "fr" })
  );
  assert.throws(() =>
    validateRoommateAiPreferencePreviewBody({ target: "PROFILE", text: "a".repeat(20), locale: "vi", extra: true })
  );
});

test("validates profile and request proposals, evidence, unknown fields, and sensitive unresolved content", () => {
  const text = "Mình cần nhà yên tĩnh, không hút thuốc và khu vực Quận 1.";
  const profile = validateRoommateAiPreferencePreviewOutput(
    {
      proposal: {
        noisePreference: { value: "QUIET", confidence: "HIGH", evidenceRanges: [{ start: 11, end: 20 }] },
        smokingEnvironment: { value: "SMOKE_FREE", confidence: "MEDIUM", evidenceRanges: [{ start: 22, end: 36 }] }
      },
      unresolved: [{ reason: "SENSITIVE_OR_PROTECTED_ATTRIBUTE", evidenceRanges: [{ start: 0, end: 4 }] }]
    },
    "PROFILE",
    text
  );
  assert.equal(profile.proposal.noisePreference?.value, "QUIET");
  assert.equal(profile.unresolved[0]?.reason, "SENSITIVE_OR_PROTECTED_ATTRIBUTE");
  assert.throws(() =>
    validateRoommateAiPreferencePreviewOutput(
      {
        proposal: { tenantId: { value: 1, confidence: "HIGH", evidenceRanges: [{ start: 0, end: 1 }] } },
        unresolved: []
      },
      "PROFILE",
      text
    )
  );
  assert.throws(() =>
    validateRoommateAiPreferencePreviewOutput(
      {
        proposal: { noisePreference: { value: "QUIET", confidence: "HIGH", evidenceRanges: [{ start: 4, end: 3 }] } },
        unresolved: []
      },
      "PROFILE",
      text
    )
  );

  const request = validateRoommateAiPreferencePreviewOutput(
    {
      proposal: {
        preferredAreaKeys: { value: ["Quận 1", "Quận 3"], confidence: "LOW", evidenceRanges: [{ start: 42, end: 48 }] },
        budgetMinPerPerson: { value: 3000000, confidence: "HIGH", evidenceRanges: [{ start: 0, end: 4 }] },
        budgetMaxPerPerson: { value: 5000000, confidence: "HIGH", evidenceRanges: [{ start: 5, end: 10 }] }
      },
      unresolved: []
    },
    "REQUEST",
    text
  );
  assert.deepEqual(request.proposal.preferredAreaKeys?.value, ["Quận 1", "Quận 3"]);
});

test("previews use only the provider boundary and never mutate Roommate state", async () => {
  const provider = new FakeAiProvider({
    output: {
      proposal: { sleepSchedule: { value: "EARLY", confidence: "HIGH", evidenceRanges: [{ start: 0, end: 5 }] } },
      unresolved: []
    }
  });
  const service = new RoommateAiPreferencePreviewService(enabledConfig, provider);
  const result = await service.preview(
    { userId: 42, role: "TENANT" },
    validateRoommateAiPreferencePreviewBody({
      target: "PROFILE",
      text: "Dậy sớm mỗi ngày và thích nhà yên tĩnh.",
      locale: "vi"
    })
  );
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.proposal.sleepSchedule?.value, "EARLY");
  assert.equal(provider.requests.length, 1);
  assert.deepEqual(Object.keys(provider.requests[0]?.input as object), ["target", "locale", "text"]);

  await assert.rejects(
    () =>
      new RoommateAiPreferencePreviewService(parseRoommateAiConfiguration({}), provider).preview(
        { userId: 42, role: "TENANT" },
        validateRoommateAiPreferencePreviewBody({
          target: "PROFILE",
          text: "Dậy sớm mỗi ngày và thích nhà yên tĩnh.",
          locale: "vi"
        })
      ),
    (error: unknown) => error instanceof ApplicationError && error.code === "AI_FEATURE_UNAVAILABLE"
  );
  assert.equal(provider.requests.length, 1);
});
