import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { ValidationIssueCollector, validationDetail } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { normalizePhone } from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import {
  requirePlainJsonObject,
  validateBodyFields,
  type PlainJsonObject
} from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { UserRole } from "../../../../../shared/src/runtime/shared/types/authentication.js";

const updateCurrentUserFields = ["phone"] as const;

export interface UpdateCurrentUserInput {
  readonly phoneProvided: boolean;
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

function requireBody(value: unknown, collector: ValidationIssueCollector): PlainJsonObject | undefined {
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

function invalidLandlordPhone(): never {
  throw new ApplicationError("VALIDATION_FAILED", "The request contains invalid data.", {
    details: [validationDetail("phone", "INVALID_VALUE", "phone is required for landlords.")]
  });
}

export function validateUpdateCurrentUserInput(value: unknown, role: UserRole): UpdateCurrentUserInput {
  const collector = new ValidationIssueCollector();
  const body = requireBody(value, collector);

  if (!body) {
    collector.throwIfAny();
    throw new Error("Current-user validation did not produce an issue.");
  }

  appendValidationIssues(collector, () => validateBodyFields(body, updateCurrentUserFields));

  const phoneProvided = Object.prototype.hasOwnProperty.call(body, "phone");
  let phone: string | null = null;

  if (phoneProvided) {
    if (role === "LANDLORD") {
      appendValidationIssues(collector, () => {
        const normalized = normalizePhone(body.phone, "phone", "nullable");
        if (normalized === null || normalized === undefined) {
          invalidLandlordPhone();
        }
        phone = normalized;
      });
    } else {
      appendValidationIssues(collector, () => {
        phone = normalizePhone(body.phone, "phone", "nullable") ?? null;
      });
    }
  }

  collector.throwIfAny();

  return Object.freeze({
    phoneProvided,
    phone
  });
}
