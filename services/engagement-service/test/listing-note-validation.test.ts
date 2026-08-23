import assert from "node:assert/strict";
import test from "node:test";
import {
  parseListingNoteId,
  validateListingNoteBody,
  validateListingNoteQuery
} from "../src/modules/listing-notes/validations/listing-note-validation.js";

test("normalizes a private listing note and parses up to four unique IDs", () => {
  assert.deepEqual(validateListingNoteBody({ note: "  Gần trường, phòng sáng.  " }), {
    note: "Gần trường, phòng sáng."
  });
  assert.deepEqual(validateListingNoteQuery({ listingIds: "7,9,12,20" }), [7, 9, 12, 20]);
  assert.equal(parseListingNoteId("42"), 42);
});

test("rejects unsafe notes, unknown fields and invalid comparison IDs", () => {
  assert.throws(() => validateListingNoteBody({ note: "" }), /invalid data/i);
  assert.throws(() => validateListingNoteBody({ note: "abc\u0000def" }), /invalid data/i);
  assert.throws(() => validateListingNoteBody({ note: "Hợp lý", public: true }), /invalid data/i);
  assert.throws(() => validateListingNoteQuery({}), /invalid data/i);
  assert.throws(() => validateListingNoteQuery({ listingIds: "1,1" }), /invalid data/i);
  assert.throws(() => validateListingNoteQuery({ listingIds: "1,2,3,4,5" }), /invalid data/i);
});
