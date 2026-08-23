import assert from "node:assert/strict";
import test from "node:test";
import { validateLeadCollectionQuery, validateLeadNoteBody } from "../src/modules/leads/validations/lead-validation.js";

test("defaults to the needs-reply queue and normalizes private notes", () => {
  assert.deepEqual(validateLeadCollectionQuery({}), {
    view: "NEEDS_REPLY",
    page: 1,
    pageSize: 20,
    offset: 0
  });
  assert.deepEqual(validateLeadCollectionQuery({ view: "closed", page: "2", pageSize: "10" }), {
    view: "CLOSED",
    page: 2,
    pageSize: 10,
    offset: 10
  });
  assert.deepEqual(validateLeadNoteBody({ note: "  Gọi lại sau 18 giờ.  " }), { note: "Gọi lại sau 18 giờ." });
  assert.deepEqual(validateLeadNoteBody({ note: null }), { note: null });
});

test("rejects unknown views, empty notes, control characters, and unknown fields", () => {
  assert.throws(() => validateLeadCollectionQuery({ view: "QUALIFIED" }), /invalid data/i);
  assert.throws(() => validateLeadNoteBody({ note: "   " }), /invalid data/i);
  assert.throws(() => validateLeadNoteBody({ note: "Ghi chú\u0000ẩn" }), /invalid data/i);
  assert.throws(() => validateLeadNoteBody({ note: "Hợp lệ", tenantId: 1 }), /invalid data/i);
});
