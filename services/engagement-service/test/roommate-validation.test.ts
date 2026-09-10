import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCreateRoommateRequestBody,
  validatePatchRoommateRequestBody,
  validateRoommateDiscoveryQuery,
  validateRoommateProfileBody
} from "../src/modules/roommate/validations/roommate-validation.js";

test("normalizes complete roommate profile text, enums, and line endings", () => {
  assert.deepEqual(
    validateRoommateProfileBody({
      intro: "  A roommate intro with enough length\r\nfor the profile.  ",
      sleepSchedule: " early ",
      cleanlinessLevel: " tidy ",
      noisePreference: " quiet ",
      smokingEnvironment: " smoke_free ",
      petEnvironment: " no_pets "
    }),
    {
      intro: "A roommate intro with enough length\nfor the profile.",
      sleepSchedule: "EARLY",
      cleanlinessLevel: "TIDY",
      noisePreference: "QUIET",
      smokingEnvironment: "SMOKE_FREE",
      petEnvironment: "NO_PETS"
    }
  );
});

test("normalizes and deduplicates unlinked request areas and validates business dates", () => {
  assert.deepEqual(
    validateCreateRoommateRequestBody(
      {
        listingId: null,
        preferredAreaKeys: ["  Quan 1 ", "quan 1", "Binh Thanh"],
        budgetMinPerPerson: 1_000_000,
        budgetMaxPerPerson: 3_000_000,
        moveInFrom: "2026-09-01",
        moveInUntil: "2026-09-30",
        note: "  Need a calm place.  "
      },
      "2026-08-27"
    ),
    {
      listingId: null,
      preferredAreaKeys: ["Binh Thanh", "Quan 1"],
      budgetMinPerPerson: 1_000_000,
      budgetMaxPerPerson: 3_000_000,
      moveInFrom: "2026-09-01",
      moveInUntil: "2026-09-30",
      note: "Need a calm place."
    }
  );
});

test("allows duplicate area entries when the normalized distinct set stays within the cap", () => {
  const request = validateCreateRoommateRequestBody(
    {
      listingId: null,
      preferredAreaKeys: ["Quan 1", "quan 1", "QUAN 1", "Quan 1", "quan 1", "QUAN 1"],
      budgetMinPerPerson: 1_000_000,
      budgetMaxPerPerson: 3_000_000,
      moveInFrom: "2026-09-01",
      moveInUntil: "2026-09-30"
    },
    "2026-08-27"
  );
  assert.deepEqual(request.preferredAreaKeys, ["Quan 1"]);
  assert.equal(request.note, null);
});

test("rejects unsafe content, invalid windows, unknown fields, and empty patches", () => {
  assert.throws(
    () =>
      validateRoommateProfileBody({
        intro: "This intro contains\ta tab and is otherwise long enough.",
        sleepSchedule: "EARLY",
        cleanlinessLevel: "TIDY",
        noisePreference: "QUIET",
        smokingEnvironment: "SMOKE_FREE",
        petEnvironment: "NO_PETS"
      }),
    /invalid data/i
  );
  assert.throws(
    () =>
      validateRoommateProfileBody({
        intro: "\tThis intro is long enough but starts with a tab.",
        sleepSchedule: "EARLY",
        cleanlinessLevel: "TIDY",
        noisePreference: "QUIET",
        smokingEnvironment: "SMOKE_FREE",
        petEnvironment: "NO_PETS"
      }),
    /invalid data/i
  );
  assert.throws(
    () =>
      validateCreateRoommateRequestBody(
        {
          listingId: null,
          preferredAreaKeys: [],
          budgetMinPerPerson: 2,
          budgetMaxPerPerson: 1,
          moveInFrom: "2026-08-26",
          moveInUntil: "2026-08-27",
          extra: true
        },
        "2026-08-27"
      ),
    /invalid data/i
  );
  assert.throws(() => validatePatchRoommateRequestBody({}), /invalid data/i);
});

test("parses discovery filters with stable pagination defaults", () => {
  assert.deepEqual(validateRoommateDiscoveryQuery({ area: " Quan 1 ", listingMode: "unlinked" }), {
    area: "quan-1",
    budgetMinPerPerson: null,
    budgetMaxPerPerson: null,
    moveInFrom: null,
    moveInUntil: null,
    listingMode: "UNLINKED",
    page: 1,
    pageSize: 20,
    offset: 0
  });
});
