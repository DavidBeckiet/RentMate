import assert from "node:assert/strict";
import test from "node:test";
import { resolveListingUpdateState, type ListingContentState } from "../src/modules/listings/listing-update-state.js";
import {
  validateCreateListingDraftInput
} from "../src/modules/listings/validations/listing-create-validation.js";
import { validateListingUpdateInput } from "../src/modules/listings/validations/listing-update-validation.js";

const current: ListingContentState = {
  status: "APPROVED",
  title: "Studio trung tam",
  description: "Mo ta day du",
  monthlyRent: 7_500_000,
  roomAreaSqm: 28,
  maxOccupants: 2,
  addressText: "101 Nguyen Hue",
  areaName: "Quan 1",
  latitude: 10.77,
  longitude: 106.7,
  propertyTypeCode: "STUDIO",
  amenityCodes: ["WIFI"]
};

test("accepts nullable max occupants and normalizes a valid integer", () => {
  assert.equal(validateCreateListingDraftInput({ maxOccupants: 4 }).maxOccupants, 4);
  assert.equal(validateCreateListingDraftInput({ maxOccupants: null }).maxOccupants, null);
});

test("rejects invalid max occupants values and unknown fields", () => {
  for (const value of [0, -1, 1.5, 21, "4"]) {
    assert.throws(() => validateCreateListingDraftInput({ maxOccupants: value }), /invalid data/i);
  }
  assert.throws(() => validateCreateListingDraftInput({ maxOccupants: 4, occupants: 4 }), /invalid data/i);
});

test("treats a real max occupants edit as significant and an equal value as a no-op", () => {
  const changed = resolveListingUpdateState(current, validateListingUpdateInput({ maxOccupants: 4 }));
  assert.equal(changed.maxOccupants, 4);
  assert.equal(changed.changed, true);
  assert.equal(changed.status, "PENDING");

  const unchanged = resolveListingUpdateState(current, validateListingUpdateInput({ maxOccupants: 2 }));
  assert.equal(unchanged.maxOccupants, 2);
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.status, "APPROVED");
});
