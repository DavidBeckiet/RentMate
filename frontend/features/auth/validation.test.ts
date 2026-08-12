import { describe, expect, it } from "vitest";
import { normalizeEmail, validateLoginInput, validateRegistrationInput } from "./validation";

describe("RM-047 auth validation", () => {
  it("normalizes valid email and rejects required, malformed, and overlong values", () => {
    expect(normalizeEmail("  USER@Example.COM ")).toBe("user@example.com");

    expect(validateLoginInput({ email: "", password: "password" })).toMatchObject({
      valid: false,
      errors: { email: "Vui lòng nhập email." }
    });
    expect(validateLoginInput({ email: "invalid", password: "password" })).toMatchObject({
      valid: false,
      errors: { email: "Email không đúng định dạng." }
    });
    expect(validateLoginInput({ email: `${"a".repeat(310)}@example.com`, password: "password" })).toMatchObject({
      valid: false,
      errors: { email: "Email không được dài quá 320 ký tự." }
    });
  });

  it("counts password code points separately from UTF-8 bytes", () => {
    expect(validateLoginInput({ email: "user@example.com", password: "1234567" })).toMatchObject({
      valid: false,
      errors: { password: "Mật khẩu phải có ít nhất 8 ký tự." }
    });
    expect(validateLoginInput({ email: "user@example.com", password: "🙂".repeat(8) }).valid).toBe(true);
    expect(new TextEncoder().encode("🙂".repeat(18))).toHaveLength(72);
    expect(validateLoginInput({ email: "user@example.com", password: "🙂".repeat(18) }).valid).toBe(true);
    expect(new TextEncoder().encode("🙂".repeat(19))).toHaveLength(76);
    expect(validateLoginInput({ email: "user@example.com", password: "🙂".repeat(19) })).toMatchObject({
      valid: false,
      errors: { password: "Mật khẩu không được vượt quá 72 byte UTF-8." }
    });
  });

  it("preserves the exact password rather than trimming or normalizing it", () => {
    const password = "  pass word  ";
    const result = validateLoginInput({ email: "USER@EXAMPLE.COM", password });

    expect(result.valid).toBe(true);
    if (result.valid) expect(result.value).toEqual({ email: "user@example.com", password });
  });

  it("omits a blank tenant phone and accepts trimmed E.164 input", () => {
    const blank = validateRegistrationInput(
      { email: "tenant@example.com", password: "password", phone: "   " },
      "tenant"
    );
    expect(blank.valid).toBe(true);
    if (blank.valid) expect(blank.value.body).toEqual({ email: "tenant@example.com", password: "password" });

    const valid = validateRegistrationInput(
      { email: "tenant@example.com", password: "password", phone: " +84901234567 " },
      "tenant"
    );
    expect(valid.valid).toBe(true);
    if (valid.valid) expect(valid.value.body).toMatchObject({ phone: "+84901234567" });
  });

  it("rejects invalid optional tenant phones", () => {
    expect(
      validateRegistrationInput({ email: "tenant@example.com", password: "password", phone: "0901234567" }, "tenant")
    ).toMatchObject({
      valid: false,
      errors: { phone: expect.stringContaining("E.164") }
    });
  });

  it("requires a landlord phone and accepts only valid E.164 input", () => {
    expect(
      validateRegistrationInput({ email: "owner@example.com", password: "password", phone: "" }, "landlord")
    ).toMatchObject({ valid: false, errors: { phone: "Vui lòng nhập số điện thoại." } });
    expect(
      validateRegistrationInput({ email: "owner@example.com", password: "password", phone: "+012345678" }, "landlord")
    ).toMatchObject({ valid: false, errors: { phone: expect.stringContaining("E.164") } });

    const valid = validateRegistrationInput(
      { email: "owner@example.com", password: "password", phone: "+84901234567" },
      "landlord"
    );
    expect(valid.valid).toBe(true);
    if (valid.valid) {
      expect(valid.value).toEqual({
        mode: "landlord",
        body: { email: "owner@example.com", password: "password", phone: "+84901234567" }
      });
    }
  });
});
