import { AiProviderError } from "../providers/ai-provider-error.js";

export const roommateAiSemanticConcepts = [
  "EARLY_ROUTINE",
  "STANDARD_ROUTINE",
  "LATE_ROUTINE",
  "FLEXIBLE_ROUTINE",
  "TIDY_ROUTINE",
  "BALANCED_CLEANING",
  "RELAXED_CLEANING",
  "SHARED_CLEANING_ROUTINE",
  "QUIET_HOME",
  "BALANCED_NOISE",
  "SOCIAL_HOME",
  "LOW_GATHERING",
  "EVENING_STUDY",
  "SMOKE_FREE_HOME",
  "OUTDOOR_SMOKING_ONLY",
  "PET_FREE_HOME",
  "PET_FRIENDLY_HOME",
  "PET_IN_HOME"
] as const;
export const roommateAiSemanticSources = ["PROFILE_INTRO", "REQUEST_NOTE"] as const;
export type RoommateAiSemanticConcept = (typeof roommateAiSemanticConcepts)[number];
export type RoommateAiSemanticSource = (typeof roommateAiSemanticSources)[number];
export interface RoommateAiSemanticAssertion {
  readonly token: string;
  readonly concept: RoommateAiSemanticConcept;
  readonly source: RoommateAiSemanticSource;
  readonly start: number;
  readonly end: number;
}
export interface RoommateAiRecommendationProviderOutput {
  readonly assertions: readonly RoommateAiSemanticAssertion[];
}

export const roommateAiRecommendationJsonSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["assertions"],
  properties: {
    assertions: {
      type: "array",
      maxItems: 120,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["token", "concept", "source", "start", "end"],
        properties: {
          token: { type: "string", minLength: 1, maxLength: 8 },
          concept: { type: "string", enum: [...roommateAiSemanticConcepts] },
          source: { type: "string", enum: [...roommateAiSemanticSources] },
          start: { type: "integer", minimum: 0 },
          end: { type: "integer", minimum: 1 }
        }
      }
    }
  }
});

function invalid(): never {
  throw new AiProviderError("SCHEMA_INVALID", "AI_OUTPUT_INVALID");
}
export function validateRoommateAiRecommendationOutput(
  value: unknown,
  sources: ReadonlyMap<string, Readonly<Record<RoommateAiSemanticSource, string | null>>>
): RoommateAiRecommendationProviderOutput {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
    const root = value as Record<string, unknown>;
    if (Object.keys(root).length !== 1 || !Array.isArray(root.assertions) || root.assertions.length > 120) invalid();
    const seen = new Set<string>();
    const assertions = root.assertions.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) invalid();
      const item = entry as Record<string, unknown>;
      if (
        ["token", "concept", "source", "start", "end"].some((key) => !(key in item)) ||
        Object.keys(item).length !== 5
      )
        invalid();
      if (
        typeof item.token !== "string" ||
        Array.from(item.token).length < 1 ||
        Array.from(item.token).length > 8 ||
        !sources.has(item.token) ||
        !roommateAiSemanticConcepts.includes(item.concept as RoommateAiSemanticConcept) ||
        !roommateAiSemanticSources.includes(item.source as RoommateAiSemanticSource) ||
        !Number.isSafeInteger(item.start) ||
        !Number.isSafeInteger(item.end)
      )
        invalid();
      const source = sources.get(item.token)![item.source as RoommateAiSemanticSource];
      const length = source === null ? 0 : Array.from(source).length;
      if (
        !source ||
        (item.start as number) < 0 ||
        (item.end as number) <= (item.start as number) ||
        (item.end as number) > length
      )
        invalid();
      const key = `${item.token}:${item.concept}:${item.source}:${item.start}:${item.end}`;
      if (seen.has(key)) invalid();
      seen.add(key);
      return Object.freeze({
        token: item.token,
        concept: item.concept as RoommateAiSemanticConcept,
        source: item.source as RoommateAiSemanticSource,
        start: item.start as number,
        end: item.end as number
      });
    });
    return Object.freeze({ assertions: Object.freeze(assertions) });
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    return invalid();
  }
}
