import assert from "node:assert/strict";
import test from "node:test";
import {
  validateAdminReviewQuery,
  validateCreateReviewBody,
  validateModerateReviewBody
} from "../src/modules/reviews/validations/review-validation.js";

test("normalizes valid review and moderation inputs", () => {
  assert.deepEqual(
    validateCreateReviewBody({
      overallRating: 5,
      accuracyRating: 4,
      responsivenessRating: 5,
      comment: "  Chủ trọ phản hồi nhanh và thông tin đúng thực tế.  "
    }),
    {
      overallRating: 5,
      accuracyRating: 4,
      responsivenessRating: 5,
      comment: "Chủ trọ phản hồi nhanh và thông tin đúng thực tế."
    }
  );
  assert.deepEqual(validateModerateReviewBody({ status: "approved", note: "Nội dung hợp lệ." }), {
    status: "APPROVED",
    note: "Nội dung hợp lệ."
  });
  assert.deepEqual(validateAdminReviewQuery({}), { status: "PENDING", page: 1, pageSize: 20, offset: 0 });
});

test("rejects invalid ratings, short comments, pending moderation and unknown fields", () => {
  assert.throws(
    () =>
      validateCreateReviewBody({
        overallRating: 0,
        accuracyRating: 4,
        responsivenessRating: 5,
        comment: "Nội dung đánh giá đủ dài để gửi."
      }),
    /invalid data/i
  );
  assert.throws(
    () =>
      validateCreateReviewBody({
        overallRating: 5,
        accuracyRating: 4,
        responsivenessRating: 5,
        comment: "Quá ngắn"
      }),
    /invalid data/i
  );
  assert.throws(() => validateModerateReviewBody({ status: "PENDING", note: "Chưa quyết định." }), /invalid data/i);
  assert.throws(() => validateAdminReviewQuery({ tenantId: "1" }), /invalid data/i);
});
