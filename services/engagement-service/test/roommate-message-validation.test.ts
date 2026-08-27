import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCreateRoommateMessageBody,
  validateRoommateMessagePageQuery
} from "../src/modules/roommate/validations/roommate-message-validation.js";
import {
  validateRoommateInterestReportBody,
  validateRoommateMessageReportBody,
  validateRoommateModerationBody,
  validateRoommateReportCollectionQuery,
  validateRoommateRequestReportBody,
  validateUpdateRoommateReportStatusBody
} from "../src/modules/roommate/validations/roommate-safety-validation.js";

test("normalizes roommate messages and applies stable pagination defaults", () => {
  assert.deepEqual(validateCreateRoommateMessageBody({ body: "  Xin chào\r\nBạn nhé.  " }), {
    body: "Xin chào\nBạn nhé."
  });
  assert.deepEqual(validateRoommateMessagePageQuery({}), {
    page: 1,
    pageSize: 50,
    offset: 0
  });
  assert.deepEqual(validateRoommateMessagePageQuery({ page: "2", pageSize: "100" }), {
    page: 2,
    pageSize: 100,
    offset: 100
  });
});

test("rejects unsafe, oversized, and unknown message fields", () => {
  assert.throws(() => validateCreateRoommateMessageBody({ body: "message\twith tab" }), /invalid data/i);
  assert.throws(() => validateCreateRoommateMessageBody({ body: "x".repeat(2_001) }), /invalid data/i);
  assert.throws(() => validateCreateRoommateMessageBody({ body: "ok", extra: true }), /invalid data/i);
  assert.throws(() => validateRoommateMessagePageQuery({ pageSize: "101" }), /invalid data/i);
  assert.throws(() => validateRoommateMessagePageQuery({ page: "0" }), /invalid data/i);
});

test("validates roommate report targets, categories, details, and admin filters", () => {
  assert.deepEqual(
    validateRoommateRequestReportBody({
      targetType: "roommate_request",
      category: "payment_scam",
      details: "  Yêu cầu chuyển khoản trước.  "
    }),
    {
      targetType: "ROOMMATE_REQUEST",
      category: "PAYMENT_SCAM",
      details: "Yêu cầu chuyển khoản trước."
    }
  );
  assert.deepEqual(validateRoommateInterestReportBody({ category: "fraud" }), {
    category: "FRAUD",
    details: null
  });
  assert.deepEqual(validateRoommateMessageReportBody({ category: "spam", details: "Có dấu hiệu spam." }), {
    category: "SPAM",
    details: "Có dấu hiệu spam."
  });
  assert.deepEqual(validateRoommateReportCollectionQuery({ source: "ROOMMATE", status: "investigating", page: "2" }), {
    source: "ROOMMATE",
    status: "INVESTIGATING",
    category: null,
    page: 2,
    pageSize: 20,
    offset: 20
  });
  assert.deepEqual(validateRoommateModerationBody({ state: "hidden", note: "  Review evidence.  ", reportId: 9 }), {
    state: "HIDDEN",
    note: "Review evidence.",
    reportId: 9
  });
  assert.deepEqual(validateRoommateModerationBody({ state: "visible", reportId: 9 }), {
    state: "VISIBLE",
    note: null,
    reportId: 9
  });
  assert.deepEqual(validateUpdateRoommateReportStatusBody({ status: "investigating", note: null }), {
    status: "INVESTIGATING",
    note: null
  });
});

test("rejects target fields on interest/message reports and unsafe report data", () => {
  assert.throws(
    () => validateRoommateInterestReportBody({ category: "SPAM", targetType: "ROOMMATE_PROFILE" }),
    /invalid data/i
  );
  assert.throws(
    () => validateRoommateMessageReportBody({ category: "SPAM", targetType: "ROOMMATE_MESSAGE" }),
    /invalid data/i
  );
  assert.throws(() => validateRoommateRequestReportBody({ category: "SPAM" }), /invalid data/i);
  assert.throws(
    () => validateRoommateMessageReportBody({ category: "SPAM", details: "bad\u0000text" }),
    /invalid data/i
  );
  assert.throws(
    () => validateRoommateRequestReportBody({ targetType: "ROOMMATE_PROFILE", category: "SPAM", extra: 1 }),
    /invalid data/i
  );
  assert.throws(
    () => validateRoommateModerationBody({ state: "VISIBLE", note: "ok", reportId: 1, extra: true }),
    /invalid data/i
  );
  assert.throws(() => validateUpdateRoommateReportStatusBody({ status: "RESOLVED" }), /invalid data/i);
});
