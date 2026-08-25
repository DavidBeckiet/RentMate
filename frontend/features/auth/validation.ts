import type { LandlordRegistrationBody, LoginBody, TenantRegistrationBody } from "../../types/api";

export type AuthField = "displayName" | "email" | "password" | "confirmPassword" | "phone";
export type AuthFieldErrors = Partial<Record<AuthField, string>>;
export type RegistrationMode = "tenant" | "landlord";

export interface AuthFormValues {
  readonly displayName?: string;
  readonly email: string;
  readonly password: string;
  readonly confirmPassword?: string;
  readonly phone?: string;
}

export type ValidationResult<Value> =
  | { readonly valid: true; readonly value: Value; readonly errors: AuthFieldErrors }
  | { readonly valid: false; readonly errors: AuthFieldErrors };

export type RegistrationSubmission =
  | { readonly mode: "tenant"; readonly body: TenantRegistrationBody }
  | { readonly mode: "landlord"; readonly body: LandlordRegistrationBody };

export interface PasswordResetRequestValues {
  readonly email: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9][0-9]{7,14}$/;
const vietnameseMobilePattern = /^0(?:3|5|7|8|9)[0-9]{8}$/;
const controlCharacterPattern = /\p{Cc}/u;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeVietnamesePhone(phone: string): string {
  const normalized = phone.trim();
  return vietnameseMobilePattern.test(normalized) ? `+84${normalized.slice(1)}` : normalized;
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
    errors.password = "Mật khẩu quá dài. Vui lòng chọn mật khẩu ngắn hơn.";
  }
}

export function normalizeDisplayName(displayName: string): string {
  return displayName.normalize("NFC").trim();
}

function validateDisplayName(displayName: string, errors: AuthFieldErrors): string {
  const normalized = normalizeDisplayName(displayName);
  if (!normalized) {
    errors.displayName = "Vui lòng nhập họ và tên.";
  } else if (controlCharacterPattern.test(normalized)) {
    errors.displayName = "Họ và tên chứa ký tự không hợp lệ.";
  } else if ([...normalized].length > 120) {
    errors.displayName = "Họ và tên không được dài quá 120 ký tự.";
  }
  return normalized;
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

export function validatePasswordResetRequestInput(emailValue: string): ValidationResult<PasswordResetRequestValues> {
  const errors: AuthFieldErrors = {};
  const email = validateEmail(emailValue, errors);
  return hasErrors(errors) ? { valid: false, errors } : { valid: true, value: { email }, errors };
}

export function validateRegistrationInput(
  values: AuthFormValues,
  mode: RegistrationMode
): ValidationResult<RegistrationSubmission> {
  const errors: AuthFieldErrors = {};
  const displayName = validateDisplayName(values.displayName ?? "", errors);
  const email = validateEmail(values.email, errors);
  validatePassword(values.password, errors);
  if (!(values.confirmPassword ?? "")) {
    errors.confirmPassword = "Vui lòng nhập lại mật khẩu.";
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Mật khẩu nhập lại chưa khớp.";
  }

  const phone = normalizeVietnamesePhone(values.phone ?? "");
  if (mode === "landlord" && !phone) {
    errors.phone = "Vui lòng nhập số điện thoại.";
  } else if (phone && !phonePattern.test(phone)) {
    errors.phone = "Số điện thoại chưa đúng. Vui lòng kiểm tra lại.";
  }

  if (hasErrors(errors)) return { valid: false, errors };

  if (mode === "landlord") {
    return {
      valid: true,
      value: { mode, body: { displayName, email, password: values.password, phone } },
      errors
    };
  }

  return {
    valid: true,
    value: {
      mode,
      body: { displayName, email, password: values.password, ...(phone ? { phone } : {}) }
    },
    errors
  };
}
