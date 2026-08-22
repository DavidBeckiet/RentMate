import { ApplicationError } from "../../../../shared/src/runtime/shared/errors/application-error.js";
import { ValidationIssueCollector } from "../../../../shared/src/runtime/shared/validation/issues.js";
import {
  normalizeEmail,
  normalizePhone,
  validatePasswordRepresentation
} from "../../../../shared/src/runtime/shared/validation/normalization.js";
import {
  requirePlainJsonObject,
  validateBodyFields,
  type PlainJsonObject
} from "../../../../shared/src/runtime/shared/validation/request.js";

const registrationFields = ["email", "password", "phone"] as const;

export type RegistrationRole = "TENANT" | "LANDLORD";

export interface RegistrationInput {
  readonly email: string;
  readonly password: string;
  readonly phone: string | null;
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

function requireRegistrationBody(value: unknown, collector: ValidationIssueCollector): PlainJsonObject | undefined {
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

export function validateRegistrationInput(value: unknown, role: RegistrationRole): RegistrationInput {
  const collector = new ValidationIssueCollector();
  const body = requireRegistrationBody(value, collector);

  if (!body) {
    collector.throwIfAny();
    throw new Error("Registration body validation did not produce an issue.");
  }

  appendValidationIssues(collector, () => validateBodyFields(body, registrationFields));

  let email: string | undefined;
  let password: string | undefined;
  let phone: string | null | undefined;

  appendValidationIssues(collector, () => {
    email = normalizeEmail(body.email);
  });
  appendValidationIssues(collector, () => {
    password = validatePasswordRepresentation(body.password);
  });
  appendValidationIssues(collector, () => {
    phone =
      role === "LANDLORD"
        ? normalizePhone(body.phone, "phone", "required")
        : normalizePhone(body.phone, "phone", "nullable");
  });

  collector.throwIfAny();

  if (email === undefined || password === undefined || (role === "LANDLORD" && typeof phone !== "string")) {
    throw new Error("Registration validation did not produce a complete input.");
  }

  return Object.freeze({
    email,
    password,
    phone: phone ?? null
  });
}
