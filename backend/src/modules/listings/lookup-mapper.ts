import type { QueryResultRow } from "pg";

const lookupCodePattern = /^[A-Z][A-Z0-9_]*$/;

export interface LookupValueRow extends QueryResultRow {
  readonly code: unknown;
  readonly label: unknown;
}

export interface LookupValue {
  readonly code: string;
  readonly label: string;
}

export interface PropertyTypeDto {
  readonly code: string;
  readonly label: string;
}

export interface AmenityDto {
  readonly code: string;
  readonly label: string;
}

export class LookupValueMappingError extends Error {
  constructor() {
    super("Lookup value representation is invalid.");
    this.name = "LookupValueMappingError";
  }
}

function assertLookupValue(value: Readonly<LookupValue>): void {
  if (
    typeof value.code !== "string" ||
    !lookupCodePattern.test(value.code) ||
    typeof value.label !== "string" ||
    value.label.trim().length === 0 ||
    value.label !== value.label.trim()
  ) {
    throw new LookupValueMappingError();
  }
}

export function mapLookupValueRow(row: Readonly<LookupValueRow>): LookupValue {
  const value: LookupValue = {
    code: row.code as string,
    label: row.label as string
  };
  assertLookupValue(value);
  return Object.freeze(value);
}

export function mapPropertyTypeToDto(value: Readonly<LookupValue>): PropertyTypeDto {
  assertLookupValue(value);
  return Object.freeze({ code: value.code, label: value.label });
}

export function mapAmenityToDto(value: Readonly<LookupValue>): AmenityDto {
  assertLookupValue(value);
  return Object.freeze({ code: value.code, label: value.label });
}
