const wholeNumericPattern = /^(?:0|-?[1-9][0-9]*)$/;
const scaleTwoNumericPattern = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/;
const timezoneAwareIsoPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.([0-9]{1,3}))?(?:Z|[+-]\d{2}:\d{2})$/;
const maximumScaleTwoMagnitude = 999_999.99;

export class DatabaseValueMappingError extends Error {
  constructor(fieldName: string, expectedType: string) {
    const safeFieldName = /^[A-Za-z][A-Za-z0-9_.]*$/.test(fieldName) ? fieldName : "database value";
    super(`${safeFieldName} must be a valid ${expectedType}.`);
    this.name = "DatabaseValueMappingError";
  }
}

export function mapPgWholeNumeric(value: unknown, fieldName: string): number {
  if (typeof value !== "string" || !wholeNumericPattern.test(value)) {
    throw new DatabaseValueMappingError(fieldName, "whole PostgreSQL numeric");
  }

  const mapped = Number(value);
  if (!Number.isSafeInteger(mapped)) {
    throw new DatabaseValueMappingError(fieldName, "safe whole PostgreSQL numeric");
  }

  return mapped;
}

export function mapNullablePgWholeNumeric(value: unknown, fieldName: string): number | null {
  return value === null ? null : mapPgWholeNumeric(value, fieldName);
}

export function mapPgScaleTwoNumeric(value: unknown, fieldName: string): number {
  if (typeof value !== "string" || !scaleTwoNumericPattern.test(value)) {
    throw new DatabaseValueMappingError(fieldName, "scale-two PostgreSQL numeric");
  }

  const mapped = Number(value);
  if (!Number.isFinite(mapped) || Math.abs(mapped) > maximumScaleTwoMagnitude) {
    throw new DatabaseValueMappingError(fieldName, "finite scale-two PostgreSQL numeric");
  }

  return mapped;
}

export function mapNullablePgScaleTwoNumeric(value: unknown, fieldName: string): number | null {
  return value === null ? null : mapPgScaleTwoNumeric(value, fieldName);
}

export function mapPgTimestamptz(value: unknown, fieldName: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new DatabaseValueMappingError(fieldName, "PostgreSQL timestamptz");
    }

    return new Date(value.getTime());
  }

  if (typeof value === "string") {
    const match = timezoneAwareIsoPattern.exec(value);
    const mapped = new Date(value);

    if (match && hasValidCalendarComponents(match) && !Number.isNaN(mapped.getTime())) {
      return mapped;
    }
  }

  throw new DatabaseValueMappingError(fieldName, "PostgreSQL timestamptz");
}

function hasValidCalendarComponents(match: RegExpExecArray): boolean {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const milliseconds = Number((match[7] ?? "").padEnd(3, "0"));
  const candidate = new Date(0);

  candidate.setUTCFullYear(year, month - 1, day);
  candidate.setUTCHours(hour, minute, second, milliseconds);

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day &&
    candidate.getUTCHours() === hour &&
    candidate.getUTCMinutes() === minute &&
    candidate.getUTCSeconds() === second &&
    candidate.getUTCMilliseconds() === milliseconds
  );
}

export function mapNullablePgTimestamptz(value: unknown, fieldName: string): Date | null {
  return value === null ? null : mapPgTimestamptz(value, fieldName);
}
