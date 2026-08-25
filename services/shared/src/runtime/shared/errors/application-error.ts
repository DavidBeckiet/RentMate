export const applicationErrorStatus = {
  VALIDATION_FAILED: 422,
  AUTHENTICATION_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  RESOURCE_NOT_FOUND: 404,
  EMAIL_ALREADY_EXISTS: 409,
  INVALID_LISTING_TRANSITION: 409,
  CONCURRENT_MODIFICATION: 409,
  LISTING_DELETE_NOT_ALLOWED: 409,
  IMAGE_LIMIT_EXCEEDED: 422,
  LAST_IMAGE_REQUIRED: 422,
  UNSUPPORTED_IMAGE_TYPE: 415,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 502,
  GOOGLE_AUTH_FAILED: 502,
  GOOGLE_AUTH_NOT_CONFIGURED: 503,
  GOOGLE_ACCOUNT_NOT_REGISTERED: 401,
  GOOGLE_ACCOUNT_EXISTS: 409,
  MALFORMED_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL_SERVER_ERROR: 500
} as const;

export type ApplicationErrorCode = keyof typeof applicationErrorStatus;

export const validationDetailCodes = [
  "REQUIRED",
  "INVALID_TYPE",
  "INVALID_VALUE",
  "UNKNOWN_FIELD",
  "OUT_OF_RANGE",
  "TOO_LONG",
  "TOO_SHORT",
  "DUPLICATE_VALUE"
] as const;

export type ValidationDetailCode = (typeof validationDetailCodes)[number];

export interface ValidationDetail {
  readonly field: string;
  readonly code: ValidationDetailCode;
  readonly message: string;
}

interface ApplicationErrorOptions {
  readonly details?: readonly ValidationDetail[];
  readonly cause?: unknown;
}

export const validationErrorMessage = "The request contains invalid data.";

function freezeValidationDetails(details: readonly ValidationDetail[] | undefined): readonly ValidationDetail[] {
  return Object.freeze((details ?? []).map((detail) => Object.freeze({ ...detail })));
}

export class ApplicationError extends Error {
  readonly status: (typeof applicationErrorStatus)[ApplicationErrorCode];
  readonly details: readonly ValidationDetail[];
  override readonly cause: unknown;

  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
    options: ApplicationErrorOptions = {}
  ) {
    super(message);
    this.name = "ApplicationError";
    this.status = applicationErrorStatus[code];
    this.details = freezeValidationDetails(options.details);
    this.cause = options.cause;
  }
}

export function createValidationError(details: readonly ValidationDetail[]): ApplicationError {
  return new ApplicationError("VALIDATION_FAILED", validationErrorMessage, { details });
}
