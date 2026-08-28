import {
  normalizeAreaKeys,
  roommateProfileEnumValues,
  validateRoommateCalendarDate
} from "../../roommate/validations/roommate-validation.js";
import { validateMonthlyRent } from "../../../../../shared/src/runtime/shared/validation/primitives.js";
import { AiProviderError } from "../providers/ai-provider-error.js";
import { roommateAiParserSchemaVersion } from "../prompts/versions.js";

export const roommateAiPreferenceTargets = ["PROFILE", "REQUEST"] as const;
export const roommateAiLocales = ["vi", "en"] as const;
export const roommateAiConfidenceValues = ["HIGH", "MEDIUM", "LOW"] as const;
export const roommateAiUnresolvedReasons = [
  "AMBIGUOUS",
  "UNSUPPORTED_PREFERENCE",
  "SENSITIVE_OR_PROTECTED_ATTRIBUTE",
  "NO_CANONICAL_VALUE",
  "CONFLICTING_STATEMENTS"
] as const;

export type RoommateAiPreferenceTarget = (typeof roommateAiPreferenceTargets)[number];
export type RoommateAiLocale = (typeof roommateAiLocales)[number];
export type RoommateAiConfidence = (typeof roommateAiConfidenceValues)[number];
export type RoommateAiUnresolvedReason = (typeof roommateAiUnresolvedReasons)[number];
type ProfileField = keyof typeof roommateProfileEnumValues;
type RequestField = "preferredAreaKeys" | "budgetMinPerPerson" | "budgetMaxPerPerson" | "moveInFrom" | "moveInUntil";

export interface RoommateAiEvidenceRange {
  readonly start: number;
  readonly end: number;
}

export interface RoommateAiProposal<T> {
  readonly value: T;
  readonly confidence: RoommateAiConfidence;
  readonly evidenceRanges: readonly RoommateAiEvidenceRange[];
}

export interface RoommateAiUnresolved {
  readonly reason: RoommateAiUnresolvedReason;
  readonly evidenceRanges: readonly RoommateAiEvidenceRange[];
}

export type RoommateAiPreferenceProposal = Readonly<Record<string, RoommateAiProposal<unknown>>>;

export interface RoommateAiPreferenceProviderOutput {
  readonly proposal: RoommateAiPreferenceProposal;
  readonly unresolved: readonly RoommateAiUnresolved[];
}

const profileFields = Object.freeze(Object.keys(roommateProfileEnumValues) as ProfileField[]);
const requestFields = Object.freeze([
  "preferredAreaKeys",
  "budgetMinPerPerson",
  "budgetMaxPerPerson",
  "moveInFrom",
  "moveInUntil"
] as const);

const rangeSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["start", "end"],
  properties: { start: { type: "integer", minimum: 0 }, end: { type: "integer", minimum: 1 } }
});

const proposalSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["value", "confidence", "evidenceRanges"],
  properties: {
    value: {},
    confidence: { type: "string", enum: [...roommateAiConfidenceValues] },
    evidenceRanges: { type: "array", minItems: 1, maxItems: 8, items: rangeSchema }
  }
});

function proposalJsonSchema(fields: readonly string[]): Readonly<Record<string, unknown>> {
  return Object.freeze({
    type: "object",
    additionalProperties: false,
    properties: Object.freeze(Object.fromEntries(fields.map((field) => [field, proposalSchema])))
  });
}

function outputJsonSchema(fields: readonly string[]): Readonly<Record<string, unknown>> {
  return Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["proposal", "unresolved"],
    properties: {
      proposal: proposalJsonSchema(fields),
      unresolved: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["reason", "evidenceRanges"],
          properties: {
            reason: { type: "string", enum: [...roommateAiUnresolvedReasons] },
            evidenceRanges: { type: "array", minItems: 1, maxItems: 8, items: rangeSchema }
          }
        }
      }
    }
  });
}

export function roommateAiPreferencePreviewJsonSchema(
  target: RoommateAiPreferenceTarget
): Readonly<Record<string, unknown>> {
  return target === "PROFILE" ? outputJsonSchema(profileFields) : outputJsonSchema(requestFields);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object.");
  return value as Readonly<Record<string, unknown>>;
}

function invalidOutput(): never {
  throw new AiProviderError("SCHEMA_INVALID", "AI_OUTPUT_INVALID");
}

function exactKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalidOutput();
}

function validateRanges(value: unknown, textLength: number): readonly RoommateAiEvidenceRange[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) invalidOutput();
  let previousEnd = -1;
  const ranges = value.map((item) => {
    const range = record(item);
    exactKeys(range, ["start", "end"]);
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)) invalidOutput();
    const start = range.start as number;
    const end = range.end as number;
    if (start < 0 || end <= start || end > textLength || start < previousEnd) invalidOutput();
    previousEnd = end;
    return Object.freeze({ start, end });
  });
  return Object.freeze(ranges);
}

function validateProfileValue(field: ProfileField, value: unknown): unknown {
  if (typeof value !== "string") invalidOutput();
  const canonical = value.normalize("NFC").trim().toUpperCase();
  if (!roommateProfileEnumValues[field].includes(canonical as never)) invalidOutput();
  return canonical;
}

function validateRequestValue(field: RequestField, value: unknown): unknown {
  try {
    if (field === "preferredAreaKeys") return normalizeAreaKeys(value, field);
    if (field === "budgetMinPerPerson" || field === "budgetMaxPerPerson") return validateMonthlyRent(value, field);
    return validateRoommateCalendarDate(value, field);
  } catch {
    invalidOutput();
  }
}

function validateProposal(
  value: unknown,
  target: RoommateAiPreferenceTarget,
  textLength: number
): RoommateAiPreferenceProposal {
  const proposal = record(value);
  const allowedFields = target === "PROFILE" ? profileFields : requestFields;
  exactKeys(proposal, allowedFields);
  const result: Record<string, RoommateAiProposal<unknown>> = {};
  for (const [field, item] of Object.entries(proposal)) {
    const candidate = record(item);
    exactKeys(candidate, ["value", "confidence", "evidenceRanges"]);
    if (!roommateAiConfidenceValues.includes(candidate.confidence as RoommateAiConfidence)) invalidOutput();
    const candidateValue =
      target === "PROFILE"
        ? validateProfileValue(field as ProfileField, candidate.value)
        : validateRequestValue(field as RequestField, candidate.value);
    result[field] = Object.freeze({
      value: candidateValue,
      confidence: candidate.confidence as RoommateAiConfidence,
      evidenceRanges: validateRanges(candidate.evidenceRanges, textLength)
    });
  }
  if (target === "REQUEST") {
    const min = result.budgetMinPerPerson?.value;
    const max = result.budgetMaxPerPerson?.value;
    const from = result.moveInFrom?.value;
    const until = result.moveInUntil?.value;
    if (
      (typeof min === "number" && typeof max === "number" && max < min) ||
      (typeof from === "string" && typeof until === "string" && until < from)
    )
      invalidOutput();
  }
  return Object.freeze(result);
}

function validateUnresolved(value: unknown, textLength: number): readonly RoommateAiUnresolved[] {
  if (!Array.isArray(value) || value.length > 10) invalidOutput();
  return Object.freeze(
    value.map((item) => {
      const unresolved = record(item);
      exactKeys(unresolved, ["reason", "evidenceRanges"]);
      if (!roommateAiUnresolvedReasons.includes(unresolved.reason as RoommateAiUnresolvedReason)) invalidOutput();
      return Object.freeze({
        reason: unresolved.reason as RoommateAiUnresolvedReason,
        evidenceRanges: validateRanges(unresolved.evidenceRanges, textLength)
      });
    })
  );
}

export function validateRoommateAiPreferencePreviewOutput(
  value: unknown,
  target: RoommateAiPreferenceTarget,
  normalizedText: string
): RoommateAiPreferenceProviderOutput {
  try {
    const output = record(value);
    exactKeys(output, ["proposal", "unresolved"]);
    const textLength = Array.from(normalizedText).length;
    return Object.freeze({
      proposal: validateProposal(output.proposal, target, textLength),
      unresolved: validateUnresolved(output.unresolved, textLength)
    });
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    return invalidOutput();
  }
}

export const roommateAiPreferencePreviewSchemaVersion = roommateAiParserSchemaVersion;
