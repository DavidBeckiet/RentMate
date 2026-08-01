import { ValidationIssueCollector, throwValidationIssue, validationDetail } from "./issues.js";

export type PlainJsonObject = Readonly<Record<string, unknown>>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function requirePlainJsonObject(value: unknown, field = "body"): PlainJsonObject {
  if (!isPlainObject(value)) {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be a JSON object.`);
  }

  return value;
}

function unknownKeys(value: PlainJsonObject, allowedKeys: readonly string[]): string[] {
  const allowed = new Set(allowedKeys);
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .sort((left, right) => left.localeCompare(right));
}

export function validateBodyFields(value: unknown, allowedFields: readonly string[]): PlainJsonObject {
  const body = requirePlainJsonObject(value);
  const collector = new ValidationIssueCollector();

  for (const field of unknownKeys(body, allowedFields)) {
    collector.add(validationDetail(field, "UNKNOWN_FIELD", `${field} is not an allowed body field.`));
  }

  collector.throwIfAny();
  return body;
}

interface QueryKeyValidationOptions {
  readonly arrayParameters?: readonly string[];
}

export function validateQueryKeys(
  value: unknown,
  allowedParameters: readonly string[],
  options: QueryKeyValidationOptions = {}
): PlainJsonObject {
  const query = requirePlainJsonObject(value, "query");
  const collector = new ValidationIssueCollector();
  const allowed = new Set(allowedParameters);
  const arrayParameters = new Set(options.arrayParameters ?? []);

  for (const field of Object.keys(query).sort((left, right) => left.localeCompare(right))) {
    if (!allowed.has(field)) {
      collector.add(validationDetail(field, "UNKNOWN_FIELD", `${field} is not an allowed query parameter.`));
      continue;
    }

    const parameter = query[field];
    if (Array.isArray(parameter)) {
      if (!arrayParameters.has(field)) {
        collector.add(validationDetail(field, "INVALID_TYPE", `${field} must be provided exactly once.`));
      }
      continue;
    }

    if (parameter !== undefined && typeof parameter !== "string") {
      collector.add(validationDetail(field, "INVALID_TYPE", `${field} must be a scalar query parameter.`));
    }
  }

  collector.throwIfAny();
  return query;
}

export function readScalarQueryValue(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be provided exactly once.`);
  }

  if (value !== null && typeof value === "object") {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be a scalar query parameter.`);
  }

  throwValidationIssue(field, "INVALID_TYPE", `${field} must be a string query parameter.`);
}
