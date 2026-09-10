import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import {
  validatePasswordResetConfirmationBody,
  validatePasswordResetRequestBody
} from "../src/modules/auth/validations/password-reset-validation.js";

test("normalizes reset request emails and validates confirmation fields", () => {
  assert.deepEqual(validatePasswordResetRequestBody({ email: "  TENANT@EXAMPLE.TEST " }), {
    email: "tenant@example.test"
  });
  assert.deepEqual(
    validatePasswordResetConfirmationBody({
      email: "  TENANT@EXAMPLE.TEST ",
      code: "012345",
      password: "new-password"
    }),
    { email: "tenant@example.test", code: "012345", password: "new-password" }
  );
});

test("rejects unknown fields and malformed reset codes", () => {
  assert.throws(
    () => validatePasswordResetRequestBody({ email: "tenant@example.test", extra: true }),
    (error: unknown) =>
      error instanceof ApplicationError && error.details.some((detail) => detail.code === "UNKNOWN_FIELD")
  );
  assert.throws(
    () =>
      validatePasswordResetConfirmationBody({
        email: "tenant@example.test",
        code: "12345",
        password: "new-password"
      }),
    (error: unknown) => error instanceof ApplicationError && error.details.some((detail) => detail.field === "code")
  );
});
