import assert from "node:assert/strict";
import test from "node:test";
import { validateGoogleAuthStartInput } from "../src/modules/auth/validations/google-auth-validation.js";

test("validates Google login and registration intents", () => {
  assert.deepEqual(validateGoogleAuthStartInput({ intent: "LOGIN" }), {
    intent: "LOGIN",
    role: null,
    phone: null
  });
  assert.deepEqual(validateGoogleAuthStartInput({ intent: "REGISTER", role: "TENANT" }), {
    intent: "REGISTER",
    role: "TENANT",
    phone: null
  });
  assert.deepEqual(validateGoogleAuthStartInput({ intent: "REGISTER", role: "LANDLORD", phone: "+84901234567" }), {
    intent: "REGISTER",
    role: "LANDLORD",
    phone: "+84901234567"
  });
});

test("requires exact role/phone combinations for Google start", () => {
  assert.throws(() => validateGoogleAuthStartInput({ intent: "LOGIN", role: "TENANT" }));
  assert.deepEqual(validateGoogleAuthStartInput({ intent: "REGISTER", role: "LANDLORD" }), {
    intent: "REGISTER",
    role: "LANDLORD",
    phone: null
  });
  assert.throws(() => validateGoogleAuthStartInput({ intent: "REGISTER", role: "TENANT", phone: "+84901234567" }));
  assert.throws(() => validateGoogleAuthStartInput({ intent: "REGISTER", role: "LANDLORD", phone: "0901234567" }));
});
