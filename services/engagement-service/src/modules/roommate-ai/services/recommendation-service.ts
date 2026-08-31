import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type {
  RoommateCompatibilityDimension,
  RoommateCompatibilityResult
} from "../../roommate/roommate-compatibility.js";
import type {
  RoommateProfileView,
  RoommateRequestView,
  RoommateService
} from "../../roommate/services/roommate-service.js";
import { isRoommateAiFeatureEnabled, type RoommateAiConfiguration } from "../config/roommate-ai-config.js";
import { roommateAiRecommendationPrompt } from "../prompts/recommendation-prompt.js";
import { roommateAiApplicationVersions } from "../prompts/versions.js";
import type { AiProvider } from "../providers/ai-provider.js";
import {
  roommateAiRecommendationJsonSchema,
  validateRoommateAiRecommendationOutput,
  type RoommateAiSemanticAssertion,
  type RoommateAiSemanticConcept,
  type RoommateAiSemanticSource
} from "../schemas/recommendation-schema.js";
import type { RoommateAiRecommendationInput } from "../validations/recommendation-validation.js";

export type RoommateAiRecommendationReasonCode =
  | "SEMANTIC_SLEEP_ALIGNED"
  | "SEMANTIC_CLEANLINESS_ALIGNED"
  | "SEMANTIC_NOISE_ALIGNED"
  | "SEMANTIC_SMOKING_ALIGNED"
  | "SEMANTIC_PETS_ALIGNED"
  | "V2_BUDGET_ALIGNED"
  | "V2_AREA_ALIGNED"
  | "V2_MOVE_IN_ALIGNED";
export interface RoommateAiRecommendationItem {
  readonly request: RoommateRequestView;
  readonly recommendation: {
    readonly reasonCodes: readonly RoommateAiRecommendationReasonCode[];
    readonly semanticRulesVersion: typeof roommateAiApplicationVersions.semanticRulesVersion;
  };
}
export interface RoommateAiRecommendations {
  readonly items: readonly RoommateAiRecommendationItem[];
  readonly candidateWindowSize: number;
  readonly reason: "INSUFFICIENT_SEMANTIC_EVIDENCE" | null;
  readonly generatedAt: string;
}

type SemanticDimension = "SLEEP" | "CLEANLINESS" | "NOISE" | "SMOKING" | "PETS";
interface SemanticParticipant {
  readonly token: string;
  readonly profile: RoommateProfileView;
  readonly request: RoommateRequestView | null;
}

const conceptDimension: Readonly<Record<RoommateAiSemanticConcept, SemanticDimension>> = Object.freeze({
  EARLY_ROUTINE: "SLEEP",
  STANDARD_ROUTINE: "SLEEP",
  LATE_ROUTINE: "SLEEP",
  FLEXIBLE_ROUTINE: "SLEEP",
  TIDY_ROUTINE: "CLEANLINESS",
  BALANCED_CLEANING: "CLEANLINESS",
  RELAXED_CLEANING: "CLEANLINESS",
  SHARED_CLEANING_ROUTINE: "CLEANLINESS",
  QUIET_HOME: "NOISE",
  BALANCED_NOISE: "NOISE",
  SOCIAL_HOME: "NOISE",
  LOW_GATHERING: "NOISE",
  EVENING_STUDY: "NOISE",
  SMOKE_FREE_HOME: "SMOKING",
  OUTDOOR_SMOKING_ONLY: "SMOKING",
  PET_FREE_HOME: "PETS",
  PET_FRIENDLY_HOME: "PETS",
  PET_IN_HOME: "PETS"
});
const reasonForDimension: Readonly<Record<SemanticDimension, RoommateAiRecommendationReasonCode>> = Object.freeze({
  SLEEP: "SEMANTIC_SLEEP_ALIGNED",
  CLEANLINESS: "SEMANTIC_CLEANLINESS_ALIGNED",
  NOISE: "SEMANTIC_NOISE_ALIGNED",
  SMOKING: "SEMANTIC_SMOKING_ALIGNED",
  PETS: "SEMANTIC_PETS_ALIGNED"
});

function cpSlice(value: string, maximum: number): string {
  return Array.from(value.normalize("NFC")).slice(0, maximum).join("");
}
function sanitizeFreeText(value: string | null): string | null {
  if (!value) return null;
  const sanitized = value
    .normalize("NFC")
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/giu, "[SECRET]")
    .replace(/\bhttps?:\/\/[^\s]+/giu, "[URL]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu, "[EMAIL]")
    .replace(/(?<!\w)(?:\+?\d[\d\s().-]{6,}\d)(?!\w)/gu, "[PHONE]")
    .replace(/(?<!\w)\d{8,}(?!\w)/gu, "[ACCOUNT_NUMBER]");
  const limited = cpSlice(sanitized, 300).trim();
  return limited || null;
}
function assertionConflicts(profile: RoommateProfileView, concept: RoommateAiSemanticConcept): boolean {
  switch (conceptDimension[concept]) {
    case "SLEEP":
      return profile.sleepSchedule !== "FLEXIBLE" && concept !== `${profile.sleepSchedule}_ROUTINE`;
    case "CLEANLINESS":
      return (
        profile.cleanlinessLevel !== "BALANCED" &&
        concept !== (profile.cleanlinessLevel === "TIDY" ? "TIDY_ROUTINE" : "RELAXED_CLEANING")
      );
    case "NOISE":
      return (
        profile.noisePreference !== "BALANCED" &&
        concept !== (profile.noisePreference === "QUIET" ? "QUIET_HOME" : "SOCIAL_HOME")
      );
    case "SMOKING":
      return (
        profile.smokingEnvironment !== "NO_PREFERENCE" &&
        concept !== (profile.smokingEnvironment === "SMOKE_FREE" ? "SMOKE_FREE_HOME" : "OUTDOOR_SMOKING_ONLY")
      );
    case "PETS":
      return (
        profile.petEnvironment !== "OK_WITH_PETS" &&
        concept !== (profile.petEnvironment === "NO_PETS" ? "PET_FREE_HOME" : "PET_IN_HOME")
      );
  }
}
function semanticByDimension(
  assertions: readonly RoommateAiSemanticAssertion[],
  participant: SemanticParticipant
): ReadonlyMap<SemanticDimension, RoommateAiSemanticConcept> {
  const values = new Map<SemanticDimension, RoommateAiSemanticConcept>();
  for (const assertion of assertions) {
    if (assertion.token !== participant.token || assertionConflicts(participant.profile, assertion.concept)) continue;
    const dimension = conceptDimension[assertion.concept];
    if (!values.has(dimension)) values.set(dimension, assertion.concept);
  }
  return values;
}
function compatibilityCounts(
  value: RoommateCompatibilityResult | null | undefined
): Readonly<{ important: number; aligned: number; reasons: readonly RoommateAiRecommendationReasonCode[] }> {
  const dimensions = value?.dimensions ?? [];
  const important = dimensions.filter((item) => item.outcome === "IMPORTANT_DIFFERENCE").length;
  const aligned = dimensions.filter((item) => item.outcome === "ALIGNED").length;
  const reasons = dimensions.flatMap((item) =>
    item.outcome !== "ALIGNED"
      ? []
      : item.dimension === "BUDGET"
        ? ["V2_BUDGET_ALIGNED" as const]
        : item.dimension === "AREA"
          ? ["V2_AREA_ALIGNED" as const]
          : item.dimension === "MOVE_IN"
            ? ["V2_MOVE_IN_ALIGNED" as const]
            : []
  );
  return Object.freeze({ important, aligned, reasons: Object.freeze(reasons) });
}
function providerParticipant(
  participant: SemanticParticipant,
  locale: string,
  compatibility?: RoommateCompatibilityResult | null
) {
  return Object.freeze({
    token: participant.token,
    locale,
    lifestyle: Object.freeze({
      sleepSchedule: participant.profile.sleepSchedule,
      cleanlinessLevel: participant.profile.cleanlinessLevel,
      noisePreference: participant.profile.noisePreference,
      smokingEnvironment: participant.profile.smokingEnvironment,
      petEnvironment: participant.profile.petEnvironment
    }),
    intro: sanitizeFreeText(participant.profile.intro),
    note: sanitizeFreeText(participant.request?.note ?? null),
    intent: participant.request
      ? Object.freeze({
          budgetMinPerPerson: participant.request.budgetMinPerPerson,
          budgetMaxPerPerson: participant.request.budgetMaxPerPerson,
          preferredAreaKeys: participant.request.preferredAreaKeys,
          moveInFrom: participant.request.moveInFrom,
          moveInUntil: participant.request.moveInUntil
        })
      : null,
    compatibility: compatibility
      ? Object.freeze({
          dimensions: compatibility.dimensions.map((item) =>
            Object.freeze({ dimension: item.dimension, outcome: item.outcome, explanationCode: item.explanationCode })
          )
        })
      : null
  });
}

export class RoommateAiRecommendationService {
  constructor(
    private readonly configuration: RoommateAiConfiguration,
    private readonly provider: AiProvider | null,
    private readonly roommateService: RoommateService,
    private readonly now: () => Date = () => new Date()
  ) {}

  async recommend(
    principal: AuthenticatedPrincipal,
    input: RoommateAiRecommendationInput,
    signal?: AbortSignal
  ): Promise<RoommateAiRecommendations> {
    if (!isRoommateAiFeatureEnabled(this.configuration, "RECOMMENDATION") || !this.provider)
      throw new ApplicationError("AI_FEATURE_UNAVAILABLE", "Roommate AI recommendations are currently unavailable.");
    const discovery = await this.roommateService.listDiscovery(
      principal,
      Object.freeze({ ...input.filters, page: 1, pageSize: 30, offset: 0 })
    );
    const candidates = discovery.data.slice(0, 30).filter((request) => request.profile !== null);
    const callerProfile = await this.roommateService.getProfile(principal);
    const self: SemanticParticipant = Object.freeze({ token: "SELF", profile: callerProfile, request: null });
    const participants = candidates.map(
      (request, index) =>
        Object.freeze({ token: `C${index}`, profile: request.profile!, request }) as SemanticParticipant
    );
    const inputParticipants = [
      providerParticipant(self, input.locale),
      ...participants.map((candidate) => providerParticipant(candidate, input.locale, candidate.request!.compatibility))
    ];
    let providerInput: unknown = Object.freeze({
      locale: input.locale,
      participants: Object.freeze(inputParticipants)
    });
    while (Array.from(JSON.stringify(providerInput)).length > 24_000 && inputParticipants.length > 1) {
      inputParticipants.pop();
      providerInput = Object.freeze({ locale: input.locale, participants: Object.freeze(inputParticipants) });
    }
    const included = participants.slice(0, inputParticipants.length - 1);
    const sources = new Map<string, Readonly<Record<RoommateAiSemanticSource, string | null>>>();
    for (const participant of [self, ...included])
      sources.set(
        participant.token,
        Object.freeze({
          PROFILE_INTRO: sanitizeFreeText(participant.profile.intro),
          REQUEST_NOTE: sanitizeFreeText(participant.request?.note ?? null)
        })
      );
    const output = await this.provider.generate({
      task: "ROOMMATE_AI_SEMANTIC_RECOMMENDATION",
      instructions: roommateAiRecommendationPrompt.instructions,
      input: providerInput,
      responseJsonSchema: roommateAiRecommendationJsonSchema,
      model: this.configuration.models.recommendation,
      maxOutputTokens: 1200,
      timeoutMs: 8_000,
      signal,
      versions: Object.freeze({
        promptVersion: roommateAiRecommendationPrompt.version,
        schemaVersion: "ROOMMATE_AI_RECOMMENDATION_SCHEMA_V1"
      }),
      validateOutput: (value) => validateRoommateAiRecommendationOutput(value, sources)
    });
    const selfConcepts = semanticByDimension(output.output.assertions, self);
    const ranked = included
      .map((candidate) => {
        const candidateConcepts = semanticByDimension(output.output.assertions, candidate);
        const overlaps = [...candidateConcepts]
          .filter(([dimension, concept]) => selfConcepts.get(dimension) === concept)
          .map(([dimension]) => dimension);
        const compatibility = compatibilityCounts(candidate.request!.compatibility);
        const semanticReasons = overlaps.map((dimension) => reasonForDimension[dimension]);
        return {
          candidate,
          overlaps,
          compatibility,
          reasons: Object.freeze([...semanticReasons, ...compatibility.reasons])
        };
      })
      .filter((value) => value.overlaps.length > 0)
      .sort(
        (left, right) =>
          right.overlaps.length - left.overlaps.length ||
          left.compatibility.important - right.compatibility.important ||
          right.compatibility.aligned - left.compatibility.aligned ||
          right.candidate.request!.createdAt.localeCompare(left.candidate.request!.createdAt) ||
          right.candidate.request!.id - left.candidate.request!.id
      );
    const items = ranked
      .slice(0, input.limit)
      .map((value) =>
        Object.freeze({
          request: value.candidate.request!,
          recommendation: Object.freeze({
            reasonCodes: value.reasons,
            semanticRulesVersion: roommateAiApplicationVersions.semanticRulesVersion
          })
        })
      );
    return Object.freeze({
      items: Object.freeze(items),
      candidateWindowSize: included.length,
      reason: items.length === 0 ? "INSUFFICIENT_SEMANTIC_EVIDENCE" : null,
      generatedAt: this.now().toISOString()
    });
  }
}
