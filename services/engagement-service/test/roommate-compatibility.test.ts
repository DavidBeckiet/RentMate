import assert from "node:assert/strict";
import test from "node:test";
import {
  compareRoommateCompatibilityAreas,
  compareRoommateCompatibilityBudget,
  compareRoommateCompatibilityMoveIn,
  createRoommateCompatibilityAreaSet,
  createRoommateCompatibilityBudgetInterval,
  createRoommateCompatibilityMoveInWindow,
  evaluateRoommateCompatibility,
  reduceRoommateCompatibilityCategory,
  roommateCompatibilityDimensions,
  roommateCompatibilityExplanationCodes,
  roommateCompatibilityRulesVersion,
  type RoommateCompatibilityDimension,
  type RoommateCompatibilityDimensionResult,
  type RoommateCompatibilityInput,
  type RoommateCompatibilityOutcome,
  type RoommateCompatibilityProfile
} from "../src/modules/roommate/roommate-compatibility.js";
import { roommateProfileEnumValues } from "../src/modules/roommate/validations/roommate-validation.js";

const noIntent = Object.freeze({ budget: null, areas: null, moveIn: null });

function compatibility(
  callerProfile: RoommateCompatibilityProfile = {},
  candidateProfile: RoommateCompatibilityProfile = {},
  callerIntent = noIntent,
  candidateIntent = noIntent
) {
  const input: RoommateCompatibilityInput = { callerProfile, candidateProfile, callerIntent, candidateIntent };
  return evaluateRoommateCompatibility(input);
}

function dimension(
  value: ReturnType<typeof evaluateRoommateCompatibility>,
  target: RoommateCompatibilityDimension
): RoommateCompatibilityDimensionResult {
  const found = value.dimensions.find((item) => item.dimension === target);
  assert.ok(found, `missing ${target} result`);
  return found;
}

function assertDimension(
  value: RoommateCompatibilityDimensionResult,
  outcome: RoommateCompatibilityOutcome,
  explanationCode: string
): void {
  assert.equal(value.outcome, outcome);
  assert.equal(value.explanationCode, explanationCode);
}

interface LifestyleMatrixCase {
  readonly dimension: RoommateCompatibilityDimension;
  readonly profileKey: keyof RoommateCompatibilityProfile;
  readonly values: readonly string[];
  readonly neutral: string;
  readonly important?: readonly [string, string];
  readonly codes: {
    readonly missing: string;
    readonly same: string;
    readonly neutral: string;
    readonly different: string;
  };
  readonly differentOutcome: Extract<RoommateCompatibilityOutcome, "DISCUSS" | "IMPORTANT_DIFFERENCE">;
}

const lifestyleMatrices: readonly LifestyleMatrixCase[] = [
  {
    dimension: "SLEEP",
    profileKey: "sleepSchedule",
    values: roommateProfileEnumValues.sleepSchedule,
    neutral: "FLEXIBLE",
    codes: {
      missing: "SLEEP_NOT_EVALUATED",
      same: "SLEEP_ALIGNED_SAME",
      neutral: "SLEEP_NEUTRAL_FLEXIBLE",
      different: "SLEEP_DISCUSS_DIFFERENT"
    },
    differentOutcome: "DISCUSS"
  },
  {
    dimension: "CLEANLINESS",
    profileKey: "cleanlinessLevel",
    values: roommateProfileEnumValues.cleanlinessLevel,
    neutral: "BALANCED",
    codes: {
      missing: "CLEANLINESS_NOT_EVALUATED",
      same: "CLEANLINESS_ALIGNED_SAME",
      neutral: "CLEANLINESS_NEUTRAL_BALANCED",
      different: "CLEANLINESS_DISCUSS_DIFFERENT"
    },
    differentOutcome: "DISCUSS"
  },
  {
    dimension: "NOISE",
    profileKey: "noisePreference",
    values: roommateProfileEnumValues.noisePreference,
    neutral: "BALANCED",
    codes: {
      missing: "NOISE_NOT_EVALUATED",
      same: "NOISE_ALIGNED_SAME",
      neutral: "NOISE_NEUTRAL_BALANCED",
      different: "NOISE_DISCUSS_DIFFERENT"
    },
    differentOutcome: "DISCUSS"
  },
  {
    dimension: "SMOKING",
    profileKey: "smokingEnvironment",
    values: roommateProfileEnumValues.smokingEnvironment,
    neutral: "NO_PREFERENCE",
    important: ["SMOKE_FREE", "OUTDOOR_ONLY"],
    codes: {
      missing: "SMOKING_NOT_EVALUATED",
      same: "SMOKING_ALIGNED_SAME",
      neutral: "SMOKING_NEUTRAL_NO_PREFERENCE",
      different: "SMOKING_IMPORTANT_DIFFERENCE_SMOKE_FREE_OUTDOOR"
    },
    differentOutcome: "IMPORTANT_DIFFERENCE"
  },
  {
    dimension: "PETS",
    profileKey: "petEnvironment",
    values: roommateProfileEnumValues.petEnvironment,
    neutral: "OK_WITH_PETS",
    important: ["NO_PETS", "HAS_PET"],
    codes: {
      missing: "PETS_NOT_EVALUATED",
      same: "PETS_ALIGNED_SAME",
      neutral: "PETS_NEUTRAL_OK_WITH_PETS",
      different: "PETS_IMPORTANT_DIFFERENCE_NO_PETS_HAS_PET"
    },
    differentOutcome: "IMPORTANT_DIFFERENCE"
  }
];

test("V1 lifestyle enum surfaces remain the explicitly mapped compatibility contract", () => {
  assert.deepEqual(roommateProfileEnumValues.sleepSchedule, ["EARLY", "STANDARD", "LATE", "FLEXIBLE"]);
  assert.deepEqual(roommateProfileEnumValues.cleanlinessLevel, ["RELAXED", "BALANCED", "TIDY"]);
  assert.deepEqual(roommateProfileEnumValues.noisePreference, ["QUIET", "BALANCED", "SOCIAL"]);
  assert.deepEqual(roommateProfileEnumValues.smokingEnvironment, ["SMOKE_FREE", "OUTDOOR_ONLY", "NO_PREFERENCE"]);
  assert.deepEqual(roommateProfileEnumValues.petEnvironment, ["NO_PETS", "OK_WITH_PETS", "HAS_PET"]);
});

function expectedLifestyle(caseDefinition: LifestyleMatrixCase, left: string | null, right: string | null) {
  if (left === null || right === null) return { outcome: "NOT_EVALUATED" as const, code: caseDefinition.codes.missing };
  if (left === right) return { outcome: "ALIGNED" as const, code: caseDefinition.codes.same };
  if (left === caseDefinition.neutral || right === caseDefinition.neutral) {
    return { outcome: "NEUTRAL" as const, code: caseDefinition.codes.neutral };
  }
  return { outcome: caseDefinition.differentOutcome, code: caseDefinition.codes.different };
}

for (const caseDefinition of lifestyleMatrices) {
  test(`${caseDefinition.dimension} exhaustively implements the frozen symmetric lifestyle matrix`, () => {
    for (const left of caseDefinition.values) {
      for (const right of caseDefinition.values) {
        const caller = { [caseDefinition.profileKey]: left } as RoommateCompatibilityProfile;
        const candidate = { [caseDefinition.profileKey]: right } as RoommateCompatibilityProfile;
        const expected = expectedLifestyle(caseDefinition, left, right);
        const forward = dimension(compatibility(caller, candidate), caseDefinition.dimension);
        const reverse = dimension(compatibility(candidate, caller), caseDefinition.dimension);
        assertDimension(forward, expected.outcome, expected.code);
        assert.deepEqual(reverse, forward);
      }
    }
    for (const [left, right] of [
      [null, caseDefinition.values[0]!],
      [caseDefinition.values[0]!, null],
      [null, null]
    ] as const) {
      const caller = left === null ? {} : ({ [caseDefinition.profileKey]: left } as RoommateCompatibilityProfile);
      const candidate = right === null ? {} : ({ [caseDefinition.profileKey]: right } as RoommateCompatibilityProfile);
      const expected = expectedLifestyle(caseDefinition, left, right);
      const forward = dimension(compatibility(caller, candidate), caseDefinition.dimension);
      const reverse = dimension(compatibility(candidate, caller), caseDefinition.dimension);
      assertDimension(forward, expected.outcome, expected.code);
      assert.deepEqual(reverse, forward);
    }
  });
}

test("rejects unexpected non-canonical lifestyle values instead of assigning a fallback result", () => {
  assert.throws(
    () => compatibility({ sleepSchedule: "EARLY" }, { sleepSchedule: "UNEXPECTED" as never }),
    /invalid data/i
  );
});

test("budget intervals use V1 VND validation, open bounds, inclusive overlap, and symmetry", () => {
  const interval = createRoommateCompatibilityBudgetInterval;
  const cases = [
    [
      interval({ budgetMinPerPerson: 1_000_000, budgetMaxPerPerson: 3_000_000 }),
      interval({ budgetMinPerPerson: 2_000_000, budgetMaxPerPerson: 4_000_000 }),
      "ALIGNED",
      "BUDGET_ALIGNED_OVERLAP"
    ],
    [
      interval({ budgetMinPerPerson: 1_000_000, budgetMaxPerPerson: 2_000_000 }),
      interval({ budgetMinPerPerson: 2_000_000, budgetMaxPerPerson: 3_000_000 }),
      "ALIGNED",
      "BUDGET_ALIGNED_OVERLAP"
    ],
    [
      interval({ budgetMinPerPerson: 1_000_000, budgetMaxPerPerson: 2_000_000 }),
      interval({ budgetMinPerPerson: 2_000_001, budgetMaxPerPerson: 3_000_000 }),
      "IMPORTANT_DIFFERENCE",
      "BUDGET_IMPORTANT_DIFFERENCE_NO_OVERLAP"
    ],
    [
      interval({ budgetMinPerPerson: 3_000_000 }),
      interval({ budgetMaxPerPerson: 3_000_000 }),
      "ALIGNED",
      "BUDGET_ALIGNED_OVERLAP"
    ],
    [
      interval({ budgetMaxPerPerson: 2_000_000 }),
      interval({ budgetMinPerPerson: 2_000_001 }),
      "IMPORTANT_DIFFERENCE",
      "BUDGET_IMPORTANT_DIFFERENCE_NO_OVERLAP"
    ],
    [
      interval({ budgetMinPerPerson: 999_999_999_999 }),
      interval({ budgetMinPerPerson: 999_999_999_999, budgetMaxPerPerson: 999_999_999_999 }),
      "ALIGNED",
      "BUDGET_ALIGNED_OVERLAP"
    ],
    [null, interval({ budgetMinPerPerson: 1_000_000 }), "NOT_EVALUATED", "BUDGET_NOT_EVALUATED"],
    [interval({ budgetMaxPerPerson: 3_000_000 }), null, "NOT_EVALUATED", "BUDGET_NOT_EVALUATED"]
  ] as const;
  for (const [left, right, outcome, code] of cases) {
    const forward = compareRoommateCompatibilityBudget(left, right);
    const reverse = compareRoommateCompatibilityBudget(right, left);
    assertDimension(forward, outcome, code);
    assert.deepEqual(reverse, forward);
  }
  assert.equal(interval({}), null);
  assert.throws(() => interval({ budgetMinPerPerson: 0 }), /invalid data/i);
  assert.throws(() => interval({ budgetMinPerPerson: 3_000_000, budgetMaxPerPerson: 2_000_000 }), /invalid data/i);
});

test("area sets preserve V1 AreaKey normalization and exact set intersection", () => {
  const areaSet = createRoommateCompatibilityAreaSet;
  assert.deepEqual(areaSet(["  Quán   1 ", "quán 1", "Bình Thạnh"]), {
    comparisonKeys: ["bình thạnh", "quán 1"]
  });
  const cases = [
    [areaSet(["Quan 1"]), areaSet(["quan 1"]), "ALIGNED", "AREA_ALIGNED_OVERLAP"],
    [areaSet(["Qua\u0301n 1"]), areaSet(["Quán 1"]), "ALIGNED", "AREA_ALIGNED_OVERLAP"],
    [areaSet(["Quan 1", "Binh Thanh"]), areaSet(["Binh Thanh", "Thu Duc"]), "ALIGNED", "AREA_ALIGNED_OVERLAP"],
    [areaSet(["Quan 1"]), areaSet(["Thu Duc"]), "IMPORTANT_DIFFERENCE", "AREA_IMPORTANT_DIFFERENCE_NO_OVERLAP"],
    [areaSet([]), areaSet(["Quan 1"]), "NOT_EVALUATED", "AREA_NOT_EVALUATED"],
    [null, areaSet(["Quan 1"]), "NOT_EVALUATED", "AREA_NOT_EVALUATED"]
  ] as const;
  for (const [left, right, outcome, code] of cases) {
    const forward = compareRoommateCompatibilityAreas(left, right);
    const reverse = compareRoommateCompatibilityAreas(right, left);
    assertDimension(forward, outcome, code);
    assert.deepEqual(reverse, forward);
  }
  assert.throws(() => areaSet(["\tQuan 1"]), /invalid data/i);
});

test("move-in windows use V1 calendar-date validation, open bounds, inclusive overlap, and symmetry", () => {
  const window = createRoommateCompatibilityMoveInWindow;
  const cases = [
    [
      window({ moveInFrom: "2026-09-01", moveInUntil: "2026-09-01" }),
      window({ moveInFrom: "2026-09-01", moveInUntil: "2026-09-30" }),
      "ALIGNED",
      "MOVE_IN_ALIGNED_OVERLAP"
    ],
    [
      window({ moveInFrom: "2026-09-01", moveInUntil: "2026-09-15" }),
      window({ moveInFrom: "2026-09-15", moveInUntil: "2026-10-01" }),
      "ALIGNED",
      "MOVE_IN_ALIGNED_OVERLAP"
    ],
    [
      window({ moveInFrom: "2026-09-05", moveInUntil: "2026-09-10" }),
      window({ moveInFrom: "2026-09-01", moveInUntil: "2026-09-30" }),
      "ALIGNED",
      "MOVE_IN_ALIGNED_OVERLAP"
    ],
    [window({ moveInUntil: "2026-09-10" }), window({ moveInFrom: "2026-09-10" }), "ALIGNED", "MOVE_IN_ALIGNED_OVERLAP"],
    [
      window({ moveInUntil: "2026-09-10" }),
      window({ moveInFrom: "2026-09-11" }),
      "IMPORTANT_DIFFERENCE",
      "MOVE_IN_IMPORTANT_DIFFERENCE_NO_OVERLAP"
    ],
    [null, window({ moveInFrom: "2026-09-01" }), "NOT_EVALUATED", "MOVE_IN_NOT_EVALUATED"],
    [window({ moveInUntil: "2026-09-30" }), null, "NOT_EVALUATED", "MOVE_IN_NOT_EVALUATED"]
  ] as const;
  for (const [left, right, outcome, code] of cases) {
    const forward = compareRoommateCompatibilityMoveIn(left, right);
    const reverse = compareRoommateCompatibilityMoveIn(right, left);
    assertDimension(forward, outcome, code);
    assert.deepEqual(reverse, forward);
  }
  assert.equal(window({}), null);
  assert.throws(() => window({ moveInFrom: "2026-02-30" }), /invalid data/i);
  assert.throws(() => window({ moveInFrom: "2026-10-01", moveInUntil: "2026-09-01" }), /invalid data/i);
});

test("fixed output order, every frozen explanation code, and no score or gating fields are exposed", () => {
  const allCodes = new Set<string>();
  for (const caseDefinition of lifestyleMatrices) {
    const values = caseDefinition.values;
    const nonNeutralValues = values.filter((value) => value !== caseDefinition.neutral);
    const pairs: readonly (readonly [string | null, string | null])[] = [
      [null, values[0]!],
      [values[0]!, values[0]!],
      [caseDefinition.neutral, values.find((value) => value !== caseDefinition.neutral)!],
      caseDefinition.important ?? [nonNeutralValues[0]!, nonNeutralValues[1]!]
    ];
    for (const [left, right] of pairs) {
      const caller = left === null ? {} : ({ [caseDefinition.profileKey]: left } as RoommateCompatibilityProfile);
      const candidate = right === null ? {} : ({ [caseDefinition.profileKey]: right } as RoommateCompatibilityProfile);
      allCodes.add(dimension(compatibility(caller, candidate), caseDefinition.dimension).explanationCode);
    }
  }
  const budget = createRoommateCompatibilityBudgetInterval;
  const areas = createRoommateCompatibilityAreaSet;
  const moveIn = createRoommateCompatibilityMoveInWindow;
  for (const item of [
    compareRoommateCompatibilityBudget(null, budget({ budgetMinPerPerson: 1 })),
    compareRoommateCompatibilityBudget(budget({ budgetMinPerPerson: 1 }), budget({ budgetMaxPerPerson: 1 })),
    compareRoommateCompatibilityBudget(budget({ budgetMaxPerPerson: 1 }), budget({ budgetMinPerPerson: 2 })),
    compareRoommateCompatibilityAreas(null, areas(["Quan 1"])),
    compareRoommateCompatibilityAreas(areas(["Quan 1"]), areas(["quan 1"])),
    compareRoommateCompatibilityAreas(areas(["Quan 1"]), areas(["Thu Duc"])),
    compareRoommateCompatibilityMoveIn(null, moveIn({ moveInFrom: "2026-09-01" })),
    compareRoommateCompatibilityMoveIn(moveIn({ moveInFrom: "2026-09-01" }), moveIn({ moveInUntil: "2026-09-01" })),
    compareRoommateCompatibilityMoveIn(moveIn({ moveInUntil: "2026-09-01" }), moveIn({ moveInFrom: "2026-09-02" }))
  ]) {
    allCodes.add(item.explanationCode);
  }
  assert.deepEqual(new Set(roommateCompatibilityExplanationCodes), allCodes);

  const output = compatibility();
  assert.deepEqual(
    output.dimensions.map((item) => item.dimension),
    roommateCompatibilityDimensions
  );
  assert.deepEqual(Object.keys(output).sort(), ["category", "dimensions", "evaluatedCount", "rulesVersion"]);
  assert.deepEqual(Object.keys(output.dimensions[0]!).sort(), ["dimension", "explanationCode", "outcome"]);
  for (const forbiddenField of [
    "score",
    "percentage",
    "rank",
    "isCompatible",
    "hardMismatch",
    "shouldExclude",
    "trustScore",
    "riskScore"
  ]) {
    assert.equal(forbiddenField in output, false);
  }
});

test("overall category reducer follows evaluated-count, neutral, discuss, and important-difference rules", () => {
  const notEvaluated = "NOT_EVALUATED" as const;
  assert.equal(reduceRoommateCompatibilityCategory([]), null);
  assert.equal(reduceRoommateCompatibilityCategory(["ALIGNED"]), null);
  assert.equal(reduceRoommateCompatibilityCategory(["ALIGNED", "ALIGNED", "ALIGNED"]), null);
  assert.equal(reduceRoommateCompatibilityCategory(["ALIGNED", "ALIGNED", "ALIGNED", "DISCUSS"]), "HIGH_ALIGNMENT");
  assert.equal(reduceRoommateCompatibilityCategory(["ALIGNED", "ALIGNED", "ALIGNED", "NEUTRAL"]), "HIGH_ALIGNMENT");
  assert.equal(reduceRoommateCompatibilityCategory(["ALIGNED", "ALIGNED", "NEUTRAL", "NEUTRAL"]), "MIXED");
  assert.equal(
    reduceRoommateCompatibilityCategory([
      "ALIGNED",
      "ALIGNED",
      "ALIGNED",
      "ALIGNED",
      "ALIGNED",
      "ALIGNED",
      "ALIGNED",
      "DISCUSS"
    ]),
    "HIGH_ALIGNMENT"
  );
  assert.equal(
    reduceRoommateCompatibilityCategory([
      "ALIGNED",
      "ALIGNED",
      "ALIGNED",
      "ALIGNED",
      "ALIGNED",
      "ALIGNED",
      "ALIGNED",
      "IMPORTANT_DIFFERENCE"
    ]),
    "IMPORTANT_DIFFERENCE"
  );
  assert.equal(reduceRoommateCompatibilityCategory([notEvaluated, "IMPORTANT_DIFFERENCE"]), "IMPORTANT_DIFFERENCE");
});

test("the full engine is deterministic, counts evaluated dimensions, and only consumes allowlisted structured input", () => {
  const callerIntent = Object.freeze({
    budget: createRoommateCompatibilityBudgetInterval({ budgetMinPerPerson: 1_000_000 }),
    areas: createRoommateCompatibilityAreaSet(["  Qua\u0301n 1  "]),
    moveIn: createRoommateCompatibilityMoveInWindow({ moveInFrom: "2026-09-01" })
  });
  const candidateIntent = Object.freeze({
    budget: createRoommateCompatibilityBudgetInterval({ budgetMaxPerPerson: 2_000_000 }),
    areas: createRoommateCompatibilityAreaSet(["Quán 1"]),
    moveIn: createRoommateCompatibilityMoveInWindow({ moveInUntil: "2026-09-01" })
  });
  const input: RoommateCompatibilityInput = {
    callerProfile: {
      sleepSchedule: "EARLY",
      cleanlinessLevel: "TIDY",
      noisePreference: "QUIET",
      smokingEnvironment: "SMOKE_FREE",
      petEnvironment: "NO_PETS"
    },
    candidateProfile: {
      sleepSchedule: "EARLY",
      cleanlinessLevel: "BALANCED",
      noisePreference: "SOCIAL",
      smokingEnvironment: "OUTDOOR_ONLY",
      petEnvironment: "OK_WITH_PETS"
    },
    callerIntent,
    candidateIntent
  };
  const expected = evaluateRoommateCompatibility(input);
  for (let index = 0; index < 10; index += 1) assert.deepEqual(evaluateRoommateCompatibility(input), expected);
  assert.equal(expected.rulesVersion, roommateCompatibilityRulesVersion);
  assert.equal(expected.evaluatedCount, 8);
  assert.equal(expected.category, "IMPORTANT_DIFFERENCE");
  assert.equal(Object.keys(input.callerProfile).includes("intro"), false);
  assert.equal(Object.keys(input.candidateIntent).includes("note"), false);
});
