import type { LandlordRegistrationBody, LoginBody, TenantRegistrationBody } from "../../types/api";

export type AuthField = "email" | "password" | "phone";
export type AuthFieldErrors = Partial<Record<AuthField, string>>;
export type RegistrationMode = "tenant" | "landlord";

export interface AuthFormValues {
  readonly email: string;
  readonly password: string;
  readonly phone?: string;
}

export type ValidationResult<Value> =
  | { readonly valid: true; readonly value: Value; readonly errors: AuthFieldErrors }
  | { readonly valid: false; readonly errors: AuthFieldErrors };

export type RegistrationSubmission =
  | { readonly mode: "tenant"; readonly body: TenantRegistrationBody }
  | { readonly mode: "landlord"; readonly body: LandlordRegistrationBody };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9][0-9]{7,14}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string, errors: AuthFieldErrors): string {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    errors.email = "Vui lòng nhập email.";
  } else if (normalized.length > 320) {
    errors.email = "Email không được dài quá 320 ký tự.";
  } else if (!emailPattern.test(normalized)) {
    errors.email = "Email không đúng định dạng.";
  }
  return normalized;
}

function validatePassword(password: string, errors: AuthFieldErrors): void {
  if (!password) {
    errors.password = "Vui lòng nhập mật khẩu.";
  } else if ([...password].length < 8) {
    errors.password = "Mật khẩu phải có ít nhất 8 ký tự.";
  } else if (new TextEncoder().encode(password).length > 72) {
    errors.password = "Mật khẩu không được vượt quá 72 byte UTF-8.";
  }
}

function hasErrors(errors: AuthFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function validateLoginInput(values: Pick<AuthFormValues, "email" | "password">): ValidationResult<LoginBody> {
  const errors: AuthFieldErrors = {};
  const email = validateEmail(values.email, errors);
  validatePassword(values.password, errors);

  return hasErrors(errors)
    ? { valid: false, errors }
    : { valid: true, value: { email, password: values.password }, errors };
}

export function validateRegistrationInput(
  values: AuthFormValues,
  mode: RegistrationMode
): ValidationResult<RegistrationSubmission> {
  const errors: AuthFieldErrors = {};
  const email = validateEmail(values.email, errors);
  validatePassword(values.password, errors);

  const phone = (values.phone ?? "").trim();
  if (mode === "landlord" && !phone) {
    errors.phone = "Vui lòng nhập số điện thoại.";
  } else if (phone && !phonePattern.test(phone)) {
    errors.phone = "Số điện thoại phải theo định dạng E.164, ví dụ +84901234567.";
  }

  if (hasErrors(errors)) return { valid: false, errors };

  if (mode === "landlord") {
    return {
      valid: true,
      value: { mode, body: { email, password: values.password, phone } },
      errors
    };
  }

  return {
    valid: true,
    value: {
      mode,
      body: { email, password: values.password, ...(phone ? { phone } : {}) }
    },
    errors
  };
}
