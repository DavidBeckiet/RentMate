import type { ApiError } from "../api/transport";

export interface ApiFieldErrorResult<Field extends string> {
  readonly fieldErrors: Partial<Record<Field, string>>;
  readonly formMessage: string | null;
  readonly requestId: string | null;
}

export function mapApiErrorToFields<Field extends string>(
  error: ApiError,
  allowedFields: readonly Field[]
): ApiFieldErrorResult<Field> {
  const allowed = new Set<string>(allowedFields);
  const fieldErrors: Partial<Record<Field, string>> = {};
  let hasUnmappedDetail = false;

  for (const detail of error.details) {
    const message = detail.message?.trim();
    if (!allowed.has(detail.field) || !message) {
      hasUnmappedDetail = true;
      continue;
    }

    const field = detail.field as Field;
    if (fieldErrors[field] === undefined) fieldErrors[field] = message;
  }

  const hasFieldError = Object.keys(fieldErrors).length > 0;
  return {
    fieldErrors,
    formMessage: hasUnmappedDetail || !hasFieldError ? error.message : null,
    requestId: error.requestId
  };
}
