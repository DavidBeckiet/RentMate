import type {
  RoommateCompatibilityDimension,
  RoommateCompatibilityDimensionResult,
  RoommateCompatibilityExplanationCode
} from "../../roommate/roommate-compatibility.js";
import { AiProviderError } from "../providers/ai-provider-error.js";

export interface RoommateAiExplanationEvidenceRef {
  readonly dimension: RoommateCompatibilityDimension;
  readonly explanationCode: RoommateCompatibilityExplanationCode;
}
export interface RoommateAiExplanationCaution {
  readonly dimension: RoommateCompatibilityDimension;
  readonly text: string;
}
export interface RoommateAiExplanationProviderOutput {
  readonly summary: string;
  readonly evidenceRefs: readonly RoommateAiExplanationEvidenceRef[];
  readonly cautions: readonly RoommateAiExplanationCaution[];
}

export const roommateAiExplanationJsonSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["summary", "evidenceRefs", "cautions"],
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 600 },
    evidenceRefs: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimension", "explanationCode"],
        properties: { dimension: { type: "string" }, explanationCode: { type: "string" } }
      }
    },
    cautions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimension", "text"],
        properties: { dimension: { type: "string" }, text: { type: "string", minLength: 1, maxLength: 240 } }
      }
    }
  }
});

function invalid(): never {
  throw new AiProviderError("SCHEMA_INVALID", "AI_OUTPUT_INVALID");
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

export function validateRoommateAiExplanationOutput(
  value: unknown,
  evidence: readonly RoommateCompatibilityDimensionResult[]
): RoommateAiExplanationProviderOutput {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
    const root = value as Record<string, unknown>;
    if (!exactKeys(root, ["summary", "evidenceRefs", "cautions"])) invalid();
    if (typeof root.summary !== "string" || !root.summary.trim() || codePointLength(root.summary) > 600) invalid();
    if (!Array.isArray(root.evidenceRefs) || root.evidenceRefs.length < 1 || root.evidenceRefs.length > 8) invalid();
    if (!Array.isArray(root.cautions) || root.cautions.length > 3) invalid();
    const evidenceByPair = new Map<string, RoommateCompatibilityDimensionResult>(
      evidence.map((item) => [`${item.dimension}:${item.explanationCode}`, item])
    );
    const refs = root.evidenceRefs.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) invalid();
      const ref = entry as Record<string, unknown>;
      if (
        !exactKeys(ref, ["dimension", "explanationCode"]) ||
        typeof ref.dimension !== "string" ||
        typeof ref.explanationCode !== "string"
      )
        invalid();
      const source = evidenceByPair.get(`${ref.dimension}:${ref.explanationCode}`);
      if (!source) invalid();
      return Object.freeze({ dimension: source.dimension, explanationCode: source.explanationCode });
    });
    const uniqueRefs = new Set(refs.map((item) => `${item.dimension}:${item.explanationCode}`));
    if (uniqueRefs.size !== refs.length) invalid();
    for (const item of evidence) {
      if (item.outcome === "IMPORTANT_DIFFERENCE" && !uniqueRefs.has(`${item.dimension}:${item.explanationCode}`))
        invalid();
    }
    const cautions = root.cautions.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) invalid();
      const caution = entry as Record<string, unknown>;
      if (
        !exactKeys(caution, ["dimension", "text"]) ||
        typeof caution.dimension !== "string" ||
        typeof caution.text !== "string"
      )
        invalid();
      const source = evidence.find((item) => item.dimension === caution.dimension);
      if (!source || (source.outcome !== "DISCUSS" && source.outcome !== "IMPORTANT_DIFFERENCE")) invalid();
      if (!caution.text.trim() || codePointLength(caution.text) > 240) invalid();
      return Object.freeze({ dimension: source.dimension, text: caution.text.trim() });
    });
    if (new Set(cautions.map((item) => item.dimension)).size !== cautions.length) invalid();
    return Object.freeze({
      summary: root.summary.trim(),
      evidenceRefs: Object.freeze(refs),
      cautions: Object.freeze(cautions)
    });
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    return invalid();
  }
}
