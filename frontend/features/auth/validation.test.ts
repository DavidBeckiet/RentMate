import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizeVietnamesePhone, validateLoginInput, validateRegistrationInput } from "./validation";

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
      errors: { password: "Mật khẩu quá dài. Vui lòng chọn mật khẩu ngắn hơn." }
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
      {
        displayName: " Nguyễn Văn An ",
        email: "tenant@example.com",
        password: "password",
        confirmPassword: "password",
        phone: "   "
      },
      "tenant"
    );
    expect(blank.valid).toBe(true);
    if (blank.valid)
      expect(blank.value.body).toEqual({
        displayName: "Nguyễn Văn An",
        email: "tenant@example.com",
        password: "password"
      });

    const valid = validateRegistrationInput(
      {
        displayName: "Nguyễn Văn An",
        email: "tenant@example.com",
        password: "password",
        confirmPassword: "password",
        phone: " +84901234567 "
      },
      "tenant"
    );
    expect(valid.valid).toBe(true);
    if (valid.valid) expect(valid.value.body).toMatchObject({ phone: "+84901234567" });
  });

  it("rejects invalid optional tenant phones", () => {
    expect(
      validateRegistrationInput(
        {
          displayName: "Nguyễn Văn An",
          email: "tenant@example.com",
          password: "password",
          confirmPassword: "password",
          phone: "0123456789"
        },
        "tenant"
      )
    ).toMatchObject({
      valid: false,
      errors: { phone: "Số điện thoại chưa đúng. Vui lòng kiểm tra lại." }
    });
  });

  it("requires a landlord phone and accepts only valid E.164 input", () => {
    expect(
      validateRegistrationInput(
        {
          displayName: "Nguyễn Văn An",
          email: "owner@example.com",
          password: "password",
          confirmPassword: "password",
          phone: ""
        },
        "landlord"
      )
    ).toMatchObject({ valid: false, errors: { phone: "Vui lòng nhập số điện thoại." } });
    expect(
      validateRegistrationInput(
        {
          displayName: "Nguyễn Văn An",
          email: "owner@example.com",
          password: "password",
          confirmPassword: "password",
          phone: "+012345678"
        },
        "landlord"
      )
    ).toMatchObject({ valid: false, errors: { phone: "Số điện thoại chưa đúng. Vui lòng kiểm tra lại." } });

    const valid = validateRegistrationInput(
      {
        displayName: "Nguyễn Văn An",
        email: "owner@example.com",
        password: "password",
        confirmPassword: "password",
        phone: "+84901234567"
      },
      "landlord"
    );
    expect(valid.valid).toBe(true);
    if (valid.valid) {
      expect(valid.value).toEqual({
        mode: "landlord",
        body: { displayName: "Nguyễn Văn An", email: "owner@example.com", password: "password", phone: "+84901234567" }
      });
    }
  });

  it("requires, normalizes, and bounds the registration name by Unicode code point", () => {
    const base = { email: "tenant@example.com", password: "password", confirmPassword: "password", phone: "" };
    expect(validateRegistrationInput({ ...base, displayName: "   " }, "tenant")).toMatchObject({
      valid: false,
      errors: { displayName: "Vui lòng nhập họ và tên." }
    });
    const composed = validateRegistrationInput({ ...base, displayName: "  Nguye\u0302\u0303n Văn An  " }, "tenant");
    expect(composed.valid).toBe(true);
    if (composed.valid) expect(composed.value.body.displayName).toBe("Nguyễn Văn An");
    expect(validateRegistrationInput({ ...base, displayName: "A\nB" }, "tenant")).toMatchObject({
      valid: false,
      errors: { displayName: expect.stringContaining("không hợp lệ") }
    });
    expect(validateRegistrationInput({ ...base, displayName: "🙂".repeat(120) }, "tenant").valid).toBe(true);
    expect(validateRegistrationInput({ ...base, displayName: "🙂".repeat(121) }, "tenant")).toMatchObject({
      valid: false,
      errors: { displayName: expect.stringContaining("120") }
    });
  });

  it("requires an exact confirmation without including it in the API body", () => {
    const base = { displayName: "Nguyễn Văn A", email: "tenant@example.com", password: "password", phone: "" };
    expect(validateRegistrationInput({ ...base, confirmPassword: "" }, "tenant")).toMatchObject({
      valid: false,
      errors: { confirmPassword: "Vui lòng nhập lại mật khẩu." }
    });
    expect(validateRegistrationInput({ ...base, confirmPassword: "different" }, "tenant")).toMatchObject({
      valid: false,
      errors: { confirmPassword: "Mật khẩu nhập lại chưa khớp." }
    });

    const valid = validateRegistrationInput({ ...base, confirmPassword: "password" }, "tenant");
    expect(valid.valid).toBe(true);
    if (valid.valid) expect(valid.value.body).not.toHaveProperty("confirmPassword");
  });

  it("normalizes only unambiguous Vietnamese mobile numbers and preserves canonical input", () => {
    expect(normalizeVietnamesePhone(" 0912345678 ")).toBe("+84912345678");
    expect(normalizeVietnamesePhone(" +84912345678 ")).toBe("+84912345678");
    expect(normalizeVietnamesePhone("0212345678")).toBe("0212345678");
  });
});
