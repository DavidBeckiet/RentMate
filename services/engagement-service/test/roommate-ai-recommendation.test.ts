import assert from "node:assert/strict";
import test from "node:test";
import { parseRoommateAiConfiguration } from "../src/modules/roommate-ai/config/roommate-ai-config.js";
import { FakeAiProvider } from "../src/modules/roommate-ai/providers/fake-ai-provider.js";
import { validateRoommateAiRecommendationOutput } from "../src/modules/roommate-ai/schemas/recommendation-schema.js";
import { RoommateAiRecommendationService } from "../src/modules/roommate-ai/services/recommendation-service.js";
import type {
  RoommateProfileView,
  RoommateRequestView,
  RoommateService
} from "../src/modules/roommate/services/roommate-service.js";
import { validateRoommateAiRecommendationBody } from "../src/modules/roommate-ai/validations/recommendation-validation.js";

const config = parseRoommateAiConfiguration({
  ROOMMATE_AI_PROVIDER: "GEMINI",
  ROOMMATE_AI_ENABLED: "true",
  ROOMMATE_AI_RECOMMENDATION_ENABLED: "true",
  GEMINI_API_KEY: "synthetic-server-key",
  ROOMMATE_AI_RECOMMENDATION_MODEL: "gemini-test"
});
const profile = (intro: string): RoommateProfileView => ({
  intro,
  sleepSchedule: "STANDARD",
  cleanlinessLevel: "BALANCED",
  noisePreference: "QUIET",
  smokingEnvironment: "SMOKE_FREE",
  petEnvironment: "NO_PETS",
  displayName: "Never sent",
  memberSince: "2026-01-01",
  emailVerified: true,
  phoneVerified: false,
  profileCompleted: true
});
const request = (id: number, createdAt: string, intro = "Nhà yên tĩnh"): RoommateRequestView => ({
  id,
  listingId: null,
  listingMode: "UNLINKED",
  preferredAreaKeys: ["Quận 3"],
  budgetMinPerPerson: 3_000_000,
  budgetMaxPerPerson: 5_000_000,
  moveInFrom: "2026-09-01",
  moveInUntil: "2026-09-10",
  note: "Liên hệ a@example.com hoặc https://invalid.example/very-secret",
  status: "OPEN",
  expiresAt: "2026-10-01T00:00:00.000Z",
  listingLinkedAt: null,
  createdAt,
  updatedAt: createdAt,
  profile: profile(intro),
  listing: null,
  compatibility: {
    rulesVersion: "ROOMMATE_COMPAT_V2_1",
    category: "HIGH_ALIGNMENT",
    evaluatedCount: 3,
    dimensions: [
      { dimension: "BUDGET", outcome: "ALIGNED", explanationCode: "BUDGET_ALIGNED_OVERLAP" },
      { dimension: "NOISE", outcome: "ALIGNED", explanationCode: "NOISE_ALIGNED_SAME" }
    ]
  },
  signals: { profileCompleted: true, requestOpen: true, listingCurrentlyAvailable: null }
});

function roommateService(candidates: readonly RoommateRequestView[]): RoommateService {
  return {
    getProfile: async () => profile("Nhà yên tĩnh"),
    listDiscovery: async () => ({ data: candidates, page: 1, pageSize: 30, hasNextPage: false })
  } as RoommateService;
}

test("recommendation validates frozen body fields and output grounding", () => {
  assert.deepEqual(
    validateRoommateAiRecommendationBody({ filters: {}, limit: 10, locale: "vi" }).filters.listingMode,
    "ALL"
  );
  assert.throws(() => validateRoommateAiRecommendationBody({ filters: {} }));
  assert.throws(() => validateRoommateAiRecommendationBody({ filters: { page: 1 } }));
  assert.throws(() => validateRoommateAiRecommendationBody({ filters: {}, limit: 11 }));
  const sources = new Map([["SELF", { PROFILE_INTRO: "Nhà yên tĩnh", REQUEST_NOTE: null }]]);
  assert.throws(() =>
    validateRoommateAiRecommendationOutput(
      { assertions: [{ token: "C9", concept: "QUIET_HOME", source: "PROFILE_INTRO", start: 0, end: 3 }] },
      sources
    )
  );
  assert.throws(() =>
    validateRoommateAiRecommendationOutput(
      { assertions: [{ token: "SELF", concept: "UNKNOWN", source: "PROFILE_INTRO", start: 0, end: 3 }] },
      sources
    )
  );
});

test("recommendation reuses discovery candidates, redacts provider input, and orders only by server tuple", async () => {
  const provider = new FakeAiProvider({
    output: {
      assertions: [
        { token: "SELF", concept: "QUIET_HOME", source: "PROFILE_INTRO", start: 0, end: 3 },
        { token: "C0", concept: "QUIET_HOME", source: "PROFILE_INTRO", start: 0, end: 3 },
        { token: "C1", concept: "QUIET_HOME", source: "PROFILE_INTRO", start: 0, end: 3 }
      ]
    }
  });
  const service = new RoommateAiRecommendationService(
    config,
    provider,
    roommateService([request(7, "2026-08-01T00:00:00.000Z"), request(8, "2026-08-02T00:00:00.000Z")]),
    () => new Date("2026-08-28T12:00:00.000Z")
  );
  const result = await service.recommend(
    { userId: 1, role: "TENANT" },
    validateRoommateAiRecommendationBody({ filters: {}, locale: "vi" })
  );
  assert.deepEqual(
    result.items.map((item) => item.request.id),
    [8, 7]
  );
  assert.equal(result.items[0]?.recommendation.semanticRulesVersion, "ROOMMATE_AI_SEMANTIC_V3_1");
  assert.equal(provider.requests.length, 1);
  const serialized = JSON.stringify(provider.requests[0]?.input);
  assert.equal(serialized.includes("a@example.com"), false);
  assert.equal(serialized.includes("https://invalid.example"), false);
  assert.equal(serialized.includes("Never sent"), false);
  assert.equal(serialized.includes('"id"'), false);
});

test("recommendation returns a neutral insufficient-evidence result and ignores protected-text differences", async () => {
  const provider = new FakeAiProvider({ output: { assertions: [] } });
  const service = new RoommateAiRecommendationService(
    config,
    provider,
    roommateService([request(9, "2026-08-03T00:00:00.000Z", "Nhà yên tĩnh; thông tin nhạy cảm không được dùng")])
  );
  const result = await service.recommend(
    { userId: 1, role: "TENANT" },
    validateRoommateAiRecommendationBody({ filters: {}, locale: "vi" })
  );
  assert.deepEqual(result.items, []);
  assert.equal(result.reason, "INSUFFICIENT_SEMANTIC_EVIDENCE");
});
