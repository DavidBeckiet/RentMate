import assert from "node:assert/strict";
import test from "node:test";
import {
  validateConfirmEmailVerificationBody,
  validateConfirmPhoneVerificationBody
} from "../src/modules/verifications/validations/verification-validation.js";

test("contact verification validators accept only the intended token and OTP shapes", () => {
  assert.deepEqual(validateConfirmEmailVerificationBody({ token: "a".repeat(32) }), { token: "a".repeat(32) });
  assert.deepEqual(validateConfirmPhoneVerificationBody({ code: "012345" }), { code: "012345" });
  assert.throws(() => validateConfirmEmailVerificationBody({ token: "too-short" }), /invalid/i);
  assert.throws(() => validateConfirmPhoneVerificationBody({ code: "12345" }), /invalid data/i);
  assert.throws(() => validateConfirmPhoneVerificationBody({ code: "123456", extra: true }), /invalid data/i);
});
