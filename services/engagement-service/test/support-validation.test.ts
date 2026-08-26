import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCreateSupportRequestBody,
  validateSupportRequestCollectionQuery,
  validateUpdateSupportRequestStatusBody
} from "../src/modules/support/validations/support-validation.js";

test("normalizes a valid support request and defaults the admin queue to open", () => {
  assert.deepEqual(
    validateCreateSupportRequestBody({
      category: " safety ",
      subject: "  Tôi cần hỗ trợ  ",
      message: "  Tôi không thể gửi tin nhắn cho chủ trọ.  "
    }),
    {
      category: "SAFETY",
      subject: "Tôi cần hỗ trợ",
      message: "Tôi không thể gửi tin nhắn cho chủ trọ."
    }
  );
  assert.deepEqual(validateSupportRequestCollectionQuery({}), { status: "OPEN", page: 1, pageSize: 20, offset: 0 });
});

test("validates status updates and rejects unsafe or unknown request fields", () => {
  assert.deepEqual(validateUpdateSupportRequestStatusBody({ status: "RESOLVED", note: "  Đã hướng dẫn xong. " }), {
    status: "RESOLVED",
    note: "Đã hướng dẫn xong."
  });
  assert.throws(() => validateCreateSupportRequestBody({ category: "ACCOUNT", subject: "a", message: "b", extra: true }));
  assert.throws(() => validateCreateSupportRequestBody({ category: "ACCOUNT", subject: "a" }));
  assert.throws(() => validateUpdateSupportRequestStatusBody({ status: "RESOLVED" }));
  assert.throws(() => validateCreateSupportRequestBody({ category: "ACCOUNT", subject: "a", message: "\u0000" }));
});
