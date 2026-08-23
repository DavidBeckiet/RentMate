import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCreateInquiryBody,
  validateNotificationReadBody,
  validateStatusBody
} from "../src/modules/contact/validations/contact-validation.js";

test("normalizes a valid inquiry body and accepts an omitted contact phone", () => {
  assert.deepEqual(
    validateCreateInquiryBody({
      listingId: 42,
      message: "  Tôi muốn hỏi phòng còn trống không? ",
      preferredContactAt: "2026-08-23T10:00:00+07:00"
    }),
    {
      listingId: 42,
      message: "Tôi muốn hỏi phòng còn trống không?",
      contactPhone: null,
      preferredContactAt: "2026-08-23T03:00:00.000Z"
    }
  );
});

test("rejects unknown inquiry fields and invalid status transitions", () => {
  assert.throws(() => validateCreateInquiryBody({ listingId: 42, message: "Hello", extra: true }), /invalid data/i);
  assert.throws(() => validateStatusBody({ status: "NEW" }), /invalid data/i);
});

test("read notification mutations can omit an empty JSON body", () => {
  assert.doesNotThrow(() => validateNotificationReadBody(undefined));
  assert.doesNotThrow(() => validateNotificationReadBody({}));
});
