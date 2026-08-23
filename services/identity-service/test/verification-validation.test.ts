import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCreateVerificationBody,
  validateReviewVerificationBody,
  validateVerificationCollectionQuery
} from "../src/modules/verifications/validations/verification-validation.js";

test("normalizes landlord submissions and the default admin queue", () => {
  assert.deepEqual(
    validateCreateVerificationBody({ displayName: "  Nguyễn Văn An  ", note: "  Có thể đối chiếu hồ sơ.  " }),
    {
      displayName: "Nguyễn Văn An",
      note: "Có thể đối chiếu hồ sơ."
    }
  );
  assert.deepEqual(validateVerificationCollectionQuery({}), {
    status: "PENDING",
    page: 1,
    pageSize: 20,
    offset: 0
  });
});

test("requires a decision note and rejects unknown fields", () => {
  assert.throws(() => validateReviewVerificationBody({ status: "APPROVED" }), /invalid data/i);
  assert.throws(() => validateCreateVerificationBody({ displayName: "An", document: "secret" }), /invalid data/i);
});

test("accepts only terminal admin decisions", () => {
  assert.deepEqual(validateReviewVerificationBody({ status: "REJECTED", note: "Thiếu thông tin đối chiếu." }), {
    status: "REJECTED",
    note: "Thiếu thông tin đối chiếu."
  });
  assert.throws(() => validateReviewVerificationBody({ status: "PENDING", note: "wait" }), /invalid data/i);
});
