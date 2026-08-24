import type { UpdateCurrentUserBody, UserProfile } from "../../types/api";
import { normalizeDisplayName } from "./validation";

export interface ProfileFieldErrors {
  readonly displayName?: string;
  readonly phone?: string;
}

export type ProfileValidationResult =
  | { readonly valid: true; readonly body: UpdateCurrentUserBody }
  | { readonly valid: false; readonly errors: ProfileFieldErrors };

const phonePattern = /^\+[1-9][0-9]{7,14}$/;
const controlCharacterPattern = /\p{Cc}/u;

export function validateProfileInput(
  values: Readonly<{ displayName: string; phone: string }>,
  user: Pick<UserProfile, "displayName" | "role">
): ProfileValidationResult {
  const errors: { displayName?: string; phone?: string } = {};
  const displayName = normalizeDisplayName(values.displayName);
  const phone = values.phone.trim();

  if (!displayName && user.displayName !== null) {
    errors.displayName = "Vui lòng nhập họ và tên.";
  } else if (displayName && controlCharacterPattern.test(displayName)) {
    errors.displayName = "Họ và tên chứa ký tự không hợp lệ.";
  } else if ([...displayName].length > 120) {
    errors.displayName = "Họ và tên không được dài quá 120 ký tự.";
  }

  if (user.role === "LANDLORD" && !phone) {
    errors.phone = "Vui lòng nhập số điện thoại.";
  } else if (phone && !phonePattern.test(phone)) {
    errors.phone = "Số điện thoại chưa đúng. Vui lòng nhập theo ví dụ +84901234567.";
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    body: {
      ...(displayName ? { displayName } : {}),
      phone: phone || null
    }
  };
}
