import { validateMonthlyRent } from "../../../../shared/src/runtime/shared/validation/primitives.js";
import { throwValidationIssue } from "../../../../shared/src/runtime/shared/validation/issues.js";
import {
  normalizeAreaKeys,
  roommateProfileEnumValues,
  validateRoommateCalendarDate,
  type CleanlinessLevel,
  type NoisePreference,
  type PetEnvironment,
  type SleepSchedule,
  type SmokingEnvironment
} from "./validations/roommate-validation.js";

export const roommateCompatibilityRulesVersion = "ROOMMATE_COMPAT_V2_1" as const;

export const roommateCompatibilityDimensions = Object.freeze([
  "SLEEP",
  "CLEANLINESS",
  "NOISE",
  "SMOKING",
  "PETS",
  "BUDGET",
  "AREA",
  "MOVE_IN"
] as const);

export const roommateCompatibilityOutcomes = Object.freeze([
  "ALIGNED",
  "NEUTRAL",
  "DISCUSS",
  "IMPORTANT_DIFFERENCE",
  "NOT_EVALUATED"
] as const);

export const roommateCompatibilityCategories = Object.freeze([
  "HIGH_ALIGNMENT",
  "MIXED",
  "IMPORTANT_DIFFERENCE"
] as const);

export const roommateCompatibilityExplanationCodes = Object.freeze([
  "SLEEP_NOT_EVALUATED",
  "SLEEP_ALIGNED_SAME",
  "SLEEP_NEUTRAL_FLEXIBLE",
  "SLEEP_DISCUSS_DIFFERENT",
  "CLEANLINESS_NOT_EVALUATED",
  "CLEANLINESS_ALIGNED_SAME",
  "CLEANLINESS_NEUTRAL_BALANCED",
  "CLEANLINESS_DISCUSS_DIFFERENT",
  "NOISE_NOT_EVALUATED",
  "NOISE_ALIGNED_SAME",
  "NOISE_NEUTRAL_BALANCED",
  "NOISE_DISCUSS_DIFFERENT",
  "SMOKING_NOT_EVALUATED",
  "SMOKING_ALIGNED_SAME",
  "SMOKING_NEUTRAL_NO_PREFERENCE",
  "SMOKING_IMPORTANT_DIFFERENCE_SMOKE_FREE_OUTDOOR",
  "PETS_NOT_EVALUATED",
  "PETS_ALIGNED_SAME",
  "PETS_NEUTRAL_OK_WITH_PETS",
  "PETS_IMPORTANT_DIFFERENCE_NO_PETS_HAS_PET",
  "BUDGET_NOT_EVALUATED",
  "BUDGET_ALIGNED_OVERLAP",
  "BUDGET_IMPORTANT_DIFFERENCE_NO_OVERLAP",
  "AREA_NOT_EVALUATED",
  "AREA_ALIGNED_OVERLAP",
  "AREA_IMPORTANT_DIFFERENCE_NO_OVERLAP",
  "MOVE_IN_NOT_EVALUATED",
  "MOVE_IN_ALIGNED_OVERLAP",
  "MOVE_IN_IMPORTANT_DIFFERENCE_NO_OVERLAP"
] as const);

export type RoommateCompatibilityDimension = (typeof roommateCompatibilityDimensions)[number];
export type RoommateCompatibilityOutcome = (typeof roommateCompatibilityOutcomes)[number];
export type RoommateCompatibilityCategory = (typeof roommateCompatibilityCategories)[number];
export type RoommateCompatibilityExplanationCode = (typeof roommateCompatibilityExplanationCodes)[number];

export interface RoommateCompatibilityProfile {
  readonly sleepSchedule?: SleepSchedule | null;
  readonly cleanlinessLevel?: CleanlinessLevel | null;
  readonly noisePreference?: NoisePreference | null;
  readonly smokingEnvironment?: SmokingEnvironment | null;
  readonly petEnvironment?: PetEnvironment | null;
}

export interface RoommateCompatibilityBudgetInterval {
  readonly budgetMinPerPerson: number | null;
  readonly budgetMaxPerPerson: number | null;
}

export interface RoommateCompatibilityAreaSet {
  readonly comparisonKeys: readonly string[];
}

export interface RoommateCompatibilityMoveInWindow {
  readonly moveInFrom: string | null;
  readonly moveInUntil: string | null;
}

export interface RoommateCompatibilityIntent {
  readonly budget: RoommateCompatibilityBudgetInterval | null;
  readonly areas: RoommateCompatibilityAreaSet | null;
  readonly moveIn: RoommateCompatibilityMoveInWindow | null;
}

export interface RoommateCompatibilityInput {
  readonly callerProfile: RoommateCompatibilityProfile;
  readonly candidateProfile: RoommateCompatibilityProfile;
  readonly callerIntent: RoommateCompatibilityIntent;
  readonly candidateIntent: RoommateCompatibilityIntent;
}

export interface RoommateCompatibilityDimensionResult {
  readonly dimension: RoommateCompatibilityDimension;
  readonly outcome: RoommateCompatibilityOutcome;
  readonly explanationCode: RoommateCompatibilityExplanationCode;
}

export interface RoommateCompatibilityResult {
  readonly rulesVersion: typeof roommateCompatibilityRulesVersion;
  readonly category: RoommateCompatibilityCategory | null;
  readonly evaluatedCount: number;
  readonly dimensions: readonly RoommateCompatibilityDimensionResult[];
}

interface LifestyleRule<T extends string> {
  readonly dimension: RoommateCompatibilityDimension;
  readonly allowedValues: readonly T[];
  readonly neutralValue: T;
  readonly importantDifference?: readonly [T, T];
  readonly notEvaluatedCode: RoommateCompatibilityExplanationCode;
  readonly alignedCode: RoommateCompatibilityExplanationCode;
  readonly neutralCode: RoommateCompatibilityExplanationCode;
  readonly differentCode: RoommateCompatibilityExplanationCode;
  readonly differentOutcome: Extract<RoommateCompatibilityOutcome, "DISCUSS" | "IMPORTANT_DIFFERENCE">;
}

function validateOptionalEnum<T extends string>(value: unknown, allowedValues: readonly T[], field: string): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !allowedValues.includes(value as T)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must be a canonical Roommate value.`);
  }
  return value as T;
}

function compareLifestyle<T extends string>(
  left: unknown,
  right: unknown,
  rule: LifestyleRule<T>
): RoommateCompatibilityDimensionResult {
  const leftValue = validateOptionalEnum(left, rule.allowedValues, `callerProfile.${rule.dimension}`);
  const rightValue = validateOptionalEnum(right, rule.allowedValues, `candidateProfile.${rule.dimension}`);
  if (leftValue === null || rightValue === null) {
    return result(rule.dimension, "NOT_EVALUATED", rule.notEvaluatedCode);
  }
  if (leftValue === rightValue) return result(rule.dimension, "ALIGNED", rule.alignedCode);
  if (leftValue === rule.neutralValue || rightValue === rule.neutralValue) {
    return result(rule.dimension, "NEUTRAL", rule.neutralCode);
  }
  if (rule.importantDifference) {
    const [first, second] = rule.importantDifference;
    if ((leftValue === first && rightValue === second) || (leftValue === second && rightValue === first)) {
      return result(rule.dimension, rule.differentOutcome, rule.differentCode);
    }
  }
  return result(rule.dimension, rule.differentOutcome, rule.differentCode);
}

function result(
  dimension: RoommateCompatibilityDimension,
  outcome: RoommateCompatibilityOutcome,
  explanationCode: RoommateCompatibilityExplanationCode
): RoommateCompatibilityDimensionResult {
  return Object.freeze({ dimension, outcome, explanationCode });
}

export function createRoommateCompatibilityBudgetInterval(
  value: Partial<RoommateCompatibilityBudgetInterval> | null | undefined
): RoommateCompatibilityBudgetInterval | null {
  if (value === null || value === undefined) return null;
  const budgetMinPerPerson =
    value.budgetMinPerPerson === null || value.budgetMinPerPerson === undefined
      ? null
      : validateMonthlyRent(value.budgetMinPerPerson, "budgetMinPerPerson");
  const budgetMaxPerPerson =
    value.budgetMaxPerPerson === null || value.budgetMaxPerPerson === undefined
      ? null
      : validateMonthlyRent(value.budgetMaxPerPerson, "budgetMaxPerPerson");
  if (budgetMinPerPerson === null && budgetMaxPerPerson === null) return null;
  if (budgetMinPerPerson !== null && budgetMaxPerPerson !== null && budgetMinPerPerson > budgetMaxPerPerson) {
    throwValidationIssue(
      "budgetMaxPerPerson",
      "INVALID_VALUE",
      "budgetMaxPerPerson must be at least budgetMinPerPerson."
    );
  }
  return Object.freeze({ budgetMinPerPerson, budgetMaxPerPerson });
}

export function createRoommateCompatibilityAreaSet(
  value: readonly string[] | null | undefined
): RoommateCompatibilityAreaSet | null {
  if (value === null || value === undefined) return null;
  const normalized = normalizeAreaKeys(value, "areas");
  if (normalized.length === 0) return null;
  return Object.freeze({
    comparisonKeys: Object.freeze(normalized.map((item) => item.toLocaleLowerCase("vi-VN")))
  });
}

export function createRoommateCompatibilityMoveInWindow(
  value: Partial<RoommateCompatibilityMoveInWindow> | null | undefined
): RoommateCompatibilityMoveInWindow | null {
  if (value === null || value === undefined) return null;
  const moveInFrom =
    value.moveInFrom === null || value.moveInFrom === undefined
      ? null
      : validateRoommateCalendarDate(value.moveInFrom, "moveInFrom");
  const moveInUntil =
    value.moveInUntil === null || value.moveInUntil === undefined
      ? null
      : validateRoommateCalendarDate(value.moveInUntil, "moveInUntil");
  if (moveInFrom === null && moveInUntil === null) return null;
  if (moveInFrom !== null && moveInUntil !== null && moveInFrom > moveInUntil) {
    throwValidationIssue("moveInUntil", "INVALID_VALUE", "moveInUntil must be on or after moveInFrom.");
  }
  return Object.freeze({ moveInFrom, moveInUntil });
}

export function compareRoommateCompatibilityBudget(
  left: RoommateCompatibilityBudgetInterval | null,
  right: RoommateCompatibilityBudgetInterval | null
): RoommateCompatibilityDimensionResult {
  if (left === null || right === null) return result("BUDGET", "NOT_EVALUATED", "BUDGET_NOT_EVALUATED");
  const overlaps =
    (left.budgetMaxPerPerson === null ||
      right.budgetMinPerPerson === null ||
      left.budgetMaxPerPerson >= right.budgetMinPerPerson) &&
    (right.budgetMaxPerPerson === null ||
      left.budgetMinPerPerson === null ||
      right.budgetMaxPerPerson >= left.budgetMinPerPerson);
  return overlaps
    ? result("BUDGET", "ALIGNED", "BUDGET_ALIGNED_OVERLAP")
    : result("BUDGET", "IMPORTANT_DIFFERENCE", "BUDGET_IMPORTANT_DIFFERENCE_NO_OVERLAP");
}

export function compareRoommateCompatibilityAreas(
  left: RoommateCompatibilityAreaSet | null,
  right: RoommateCompatibilityAreaSet | null
): RoommateCompatibilityDimensionResult {
  if (left === null || right === null || left.comparisonKeys.length === 0 || right.comparisonKeys.length === 0) {
    return result("AREA", "NOT_EVALUATED", "AREA_NOT_EVALUATED");
  }
  const rightKeys = new Set(right.comparisonKeys);
  const overlaps = left.comparisonKeys.some((key) => rightKeys.has(key));
  return overlaps
    ? result("AREA", "ALIGNED", "AREA_ALIGNED_OVERLAP")
    : result("AREA", "IMPORTANT_DIFFERENCE", "AREA_IMPORTANT_DIFFERENCE_NO_OVERLAP");
}

export function compareRoommateCompatibilityMoveIn(
  left: RoommateCompatibilityMoveInWindow | null,
  right: RoommateCompatibilityMoveInWindow | null
): RoommateCompatibilityDimensionResult {
  if (left === null || right === null) return result("MOVE_IN", "NOT_EVALUATED", "MOVE_IN_NOT_EVALUATED");
  const overlaps =
    (left.moveInUntil === null || right.moveInFrom === null || left.moveInUntil >= right.moveInFrom) &&
    (right.moveInUntil === null || left.moveInFrom === null || right.moveInUntil >= left.moveInFrom);
  return overlaps
    ? result("MOVE_IN", "ALIGNED", "MOVE_IN_ALIGNED_OVERLAP")
    : result("MOVE_IN", "IMPORTANT_DIFFERENCE", "MOVE_IN_IMPORTANT_DIFFERENCE_NO_OVERLAP");
}

export function reduceRoommateCompatibilityCategory(
  outcomes: readonly RoommateCompatibilityOutcome[]
): RoommateCompatibilityCategory | null {
  if (outcomes.includes("IMPORTANT_DIFFERENCE")) return "IMPORTANT_DIFFERENCE";
  const evaluated = outcomes.filter((outcome) => outcome !== "NOT_EVALUATED");
  if (evaluated.length <= 3) return null;
  const alignedCount = evaluated.filter((outcome) => outcome === "ALIGNED").length;
  const discussCount = evaluated.filter((outcome) => outcome === "DISCUSS").length;
  return alignedCount >= 3 && discussCount <= 1 ? "HIGH_ALIGNMENT" : "MIXED";
}

export function evaluateRoommateCompatibility(input: RoommateCompatibilityInput): RoommateCompatibilityResult {
  const dimensions = Object.freeze([
    compareLifestyle(input.callerProfile.sleepSchedule, input.candidateProfile.sleepSchedule, {
      dimension: "SLEEP",
      allowedValues: roommateProfileEnumValues.sleepSchedule,
      neutralValue: "FLEXIBLE",
      notEvaluatedCode: "SLEEP_NOT_EVALUATED",
      alignedCode: "SLEEP_ALIGNED_SAME",
      neutralCode: "SLEEP_NEUTRAL_FLEXIBLE",
      differentCode: "SLEEP_DISCUSS_DIFFERENT",
      differentOutcome: "DISCUSS"
    }),
    compareLifestyle(input.callerProfile.cleanlinessLevel, input.candidateProfile.cleanlinessLevel, {
      dimension: "CLEANLINESS",
      allowedValues: roommateProfileEnumValues.cleanlinessLevel,
      neutralValue: "BALANCED",
      notEvaluatedCode: "CLEANLINESS_NOT_EVALUATED",
      alignedCode: "CLEANLINESS_ALIGNED_SAME",
      neutralCode: "CLEANLINESS_NEUTRAL_BALANCED",
      differentCode: "CLEANLINESS_DISCUSS_DIFFERENT",
      differentOutcome: "DISCUSS"
    }),
    compareLifestyle(input.callerProfile.noisePreference, input.candidateProfile.noisePreference, {
      dimension: "NOISE",
      allowedValues: roommateProfileEnumValues.noisePreference,
      neutralValue: "BALANCED",
      notEvaluatedCode: "NOISE_NOT_EVALUATED",
      alignedCode: "NOISE_ALIGNED_SAME",
      neutralCode: "NOISE_NEUTRAL_BALANCED",
      differentCode: "NOISE_DISCUSS_DIFFERENT",
      differentOutcome: "DISCUSS"
    }),
    compareLifestyle(input.callerProfile.smokingEnvironment, input.candidateProfile.smokingEnvironment, {
      dimension: "SMOKING",
      allowedValues: roommateProfileEnumValues.smokingEnvironment,
      neutralValue: "NO_PREFERENCE",
      importantDifference: ["SMOKE_FREE", "OUTDOOR_ONLY"],
      notEvaluatedCode: "SMOKING_NOT_EVALUATED",
      alignedCode: "SMOKING_ALIGNED_SAME",
      neutralCode: "SMOKING_NEUTRAL_NO_PREFERENCE",
      differentCode: "SMOKING_IMPORTANT_DIFFERENCE_SMOKE_FREE_OUTDOOR",
      differentOutcome: "IMPORTANT_DIFFERENCE"
    }),
    compareLifestyle(input.callerProfile.petEnvironment, input.candidateProfile.petEnvironment, {
      dimension: "PETS",
      allowedValues: roommateProfileEnumValues.petEnvironment,
      neutralValue: "OK_WITH_PETS",
      importantDifference: ["NO_PETS", "HAS_PET"],
      notEvaluatedCode: "PETS_NOT_EVALUATED",
      alignedCode: "PETS_ALIGNED_SAME",
      neutralCode: "PETS_NEUTRAL_OK_WITH_PETS",
      differentCode: "PETS_IMPORTANT_DIFFERENCE_NO_PETS_HAS_PET",
      differentOutcome: "IMPORTANT_DIFFERENCE"
    }),
    compareRoommateCompatibilityBudget(input.callerIntent.budget, input.candidateIntent.budget),
    compareRoommateCompatibilityAreas(input.callerIntent.areas, input.candidateIntent.areas),
    compareRoommateCompatibilityMoveIn(input.callerIntent.moveIn, input.candidateIntent.moveIn)
  ]);
  const outcomes = dimensions.map((dimension) => dimension.outcome);
  return Object.freeze({
    rulesVersion: roommateCompatibilityRulesVersion,
    category: reduceRoommateCompatibilityCategory(outcomes),
    evaluatedCount: outcomes.filter((outcome) => outcome !== "NOT_EVALUATED").length,
    dimensions
  });
}
