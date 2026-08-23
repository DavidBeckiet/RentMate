import assert from "node:assert/strict";
import test from "node:test";
import {
  validateLeadCollectionQuery,
  validateLeadNoteBody,
  validateLeadReminderBody
} from "../src/modules/leads/validations/lead-validation.js";

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
  assert.deepEqual(validateLeadCollectionQuery({ view: "reminders" }), {
    view: "REMINDERS",
    page: 1,
    pageSize: 20,
    offset: 0
  });
  assert.deepEqual(validateLeadReminderBody({ remindAt: "2026-08-25T09:30:00+07:00" }), {
    remindAt: "2026-08-25T02:30:00.000Z"
  });
  assert.deepEqual(validateLeadReminderBody({ remindAt: null }), { remindAt: null });
});

test("rejects unknown views, empty notes, control characters, and unknown fields", () => {
  assert.throws(() => validateLeadCollectionQuery({ view: "QUALIFIED" }), /invalid data/i);
  assert.throws(() => validateLeadNoteBody({ note: "   " }), /invalid data/i);
  assert.throws(() => validateLeadNoteBody({ note: "Ghi chú\u0000ẩn" }), /invalid data/i);
  assert.throws(() => validateLeadNoteBody({ note: "Hợp lệ", tenantId: 1 }), /invalid data/i);
  assert.throws(() => validateLeadReminderBody({}), /invalid data/i);
  assert.throws(() => validateLeadReminderBody({ remindAt: "ngày mai" }), /invalid data/i);
  assert.throws(() => validateLeadReminderBody({ remindAt: null, tenantId: 1 }), /invalid data/i);
});
