import { ApplicationError } from "../../../../shared/src/runtime/shared/errors/application-error.js";
import {
  ValidationIssueCollector,
  throwValidationIssue
} from "../../../../shared/src/runtime/shared/validation/issues.js";
import {
  normalizeEmail,
  validatePasswordRepresentation
} from "../../../../shared/src/runtime/shared/validation/normalization.js";
import {
  requirePlainJsonObject,
  validateBodyFields,
  type PlainJsonObject
} from "../../../../shared/src/runtime/shared/validation/request.js";

const loginFields = ["email", "password"] as const;

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

function appendValidationIssues(collector: ValidationIssueCollector, operation: () => unknown): void {
  try {
    operation();
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "VALIDATION_FAILED") {
      collector.addMany(error.details);
      return;
    }

    throw error;
  }
}

function requireLoginBody(value: unknown, collector: ValidationIssueCollector): PlainJsonObject | undefined {
  try {
    return requirePlainJsonObject(value);
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "VALIDATION_FAILED") {
      collector.addMany(error.details);
      return undefined;
    }

    throw error;
  }
}

export function validateLoginInput(value: unknown): LoginInput {
  const collector = new ValidationIssueCollector();
  const body = requireLoginBody(value, collector);

  if (!body) {
    collector.throwIfAny();
    throw new Error("Login body validation did not produce an issue.");
  }

  appendValidationIssues(collector, () => validateBodyFields(body, loginFields));

  let email: string | undefined;
  let password: string | undefined;

  appendValidationIssues(collector, () => {
    email = normalizeEmail(body.email);
  });
  appendValidationIssues(collector, () => {
    password = validatePasswordRepresentation(body.password);
  });

  collector.throwIfAny();

  if (email === undefined || password === undefined) {
    throw new Error("Login validation did not produce a complete input.");
  }

  return Object.freeze({ email, password });
}

export function validateLogoutBody(value: unknown): void {
  if (value !== undefined) {
    throwValidationIssue("body", "INVALID_VALUE", "body must be omitted.");
  }
}
