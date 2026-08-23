import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePagination, parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import {
  validateJsonText,
  validateLatitude,
  validateLongitude,
  validateMonthlyRent,
  validateRoomArea
} from "../../../../../shared/src/runtime/shared/validation/primitives.js";
import { validateBodyFields, validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";

const queryFields = [
  "q",
  "areaName",
  "minMonthlyRent",
  "maxMonthlyRent",
  "minRoomAreaSqm",
  "maxRoomAreaSqm",
  "propertyType",
  "amenities",
  "mode",
  "north",
  "south",
  "east",
  "west",
  "centerLat",
  "centerLng",
  "radiusKm",
  "sort"
] as const;
const codePattern = /^[A-Z][A-Z0-9_]*$/;
const ordinarySorts = ["newest", "rent_asc", "rent_desc"] as const;

export interface SavedSearchQuery {
  readonly q: string | null;
  readonly areaName: string | null;
  readonly minMonthlyRent: number | null;
  readonly maxMonthlyRent: number | null;
  readonly minRoomAreaSqm: number | null;
  readonly maxRoomAreaSqm: number | null;
  readonly propertyType: string | null;
  readonly amenities: readonly string[];
  readonly mode: "ordinary" | "bounds" | "radius";
  readonly north: number | null;
  readonly south: number | null;
  readonly east: number | null;
  readonly west: number | null;
  readonly centerLat: number | null;
  readonly centerLng: number | null;
  readonly radiusKm: number | null;
  readonly sort: "newest" | "rent_asc" | "rent_desc" | "distance_asc";
}

export interface CreateSavedSearchInput {
  readonly name: string | null;
  readonly isActive: boolean;
  readonly query: SavedSearchQuery;
}

export interface UpdateSavedSearchInput {
  readonly name?: string | null;
  readonly isActive?: boolean;
  readonly query?: SavedSearchQuery;
}

export interface SavedSearchCollectionQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

function optionalText(value: unknown, field: string, maximumLength: number): string | null {
  if (value === undefined || value === null) return null;
  return validateJsonText(value, field, {
    maximumLength,
    nullable: false,
    nonblank: true,
    blankAsNull: false
  }) as string;
}

function optionalNumber(
  value: unknown,
  field: string,
  validator: (input: unknown, name: string) => number
): number | null {
  return value === undefined || value === null ? null : validator(value, field);
}

function optionalFiniteNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be a finite JSON number.`);
  }
  return value;
}

function booleanValue(value: unknown, field: string, fallback?: boolean): boolean {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "boolean") throwValidationIssue(field, "INVALID_TYPE", `${field} must be a boolean.`);
  return value;
}

function code(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throwValidationIssue(field, "INVALID_TYPE", `${field} must be a string.`);
  const normalized = value.trim().toUpperCase();
  if (!codePattern.test(normalized)) throwValidationIssue(field, "INVALID_VALUE", `${field} is not a valid code.`);
  return normalized;
}

function amenities(value: unknown): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throwValidationIssue("amenities", "INVALID_TYPE", "amenities must be an array.");
  const normalized = value.map((item) => code(item, "amenities"));
  if (normalized.some((item) => item === null)) {
    throwValidationIssue("amenities", "INVALID_VALUE", "amenities must contain only valid codes.");
  }
  return Object.freeze([...new Set(normalized as string[])].sort());
}

function validateQuery(value: unknown): SavedSearchQuery {
  const input = validateBodyFields(value, queryFields);
  if (input.mode !== "ordinary" && input.mode !== "bounds" && input.mode !== "radius") {
    throwValidationIssue("mode", "INVALID_VALUE", "mode must be ordinary, bounds, or radius.");
  }
  const minMonthlyRent = optionalNumber(input.minMonthlyRent, "minMonthlyRent", validateMonthlyRent);
  const maxMonthlyRent = optionalNumber(input.maxMonthlyRent, "maxMonthlyRent", validateMonthlyRent);
  const minRoomAreaSqm = optionalNumber(input.minRoomAreaSqm, "minRoomAreaSqm", validateRoomArea);
  const maxRoomAreaSqm = optionalNumber(input.maxRoomAreaSqm, "maxRoomAreaSqm", validateRoomArea);
  if (minMonthlyRent !== null && maxMonthlyRent !== null && minMonthlyRent > maxMonthlyRent) {
    throwValidationIssue("maxMonthlyRent", "INVALID_VALUE", "maxMonthlyRent must be at least minMonthlyRent.");
  }
  if (minRoomAreaSqm !== null && maxRoomAreaSqm !== null && minRoomAreaSqm > maxRoomAreaSqm) {
    throwValidationIssue("maxRoomAreaSqm", "INVALID_VALUE", "maxRoomAreaSqm must be at least minRoomAreaSqm.");
  }

  const common = {
    q: optionalText(input.q, "q", 160),
    areaName: optionalText(input.areaName, "areaName", 120),
    minMonthlyRent,
    maxMonthlyRent,
    minRoomAreaSqm,
    maxRoomAreaSqm,
    propertyType: code(input.propertyType, "propertyType"),
    amenities: amenities(input.amenities)
  } as const;
  const nullBounds = { north: null, south: null, east: null, west: null } as const;
  const nullRadius = { centerLat: null, centerLng: null, radiusKm: null } as const;

  if (input.mode === "ordinary") {
    if (["north", "south", "east", "west", "centerLat", "centerLng", "radiusKm"].some((key) => input[key] != null)) {
      throwValidationIssue("mode", "INVALID_VALUE", "ordinary mode cannot contain geographic fields.");
    }
    const sort = input.sort ?? "newest";
    if (!ordinarySorts.includes(sort as (typeof ordinarySorts)[number])) {
      throwValidationIssue("sort", "INVALID_VALUE", "sort is not valid for ordinary mode.");
    }
    return Object.freeze({
      ...common,
      mode: "ordinary",
      ...nullBounds,
      ...nullRadius,
      sort: sort as "newest" | "rent_asc" | "rent_desc"
    });
  }

  if (input.mode === "bounds") {
    if (["centerLat", "centerLng", "radiusKm"].some((key) => input[key] != null)) {
      throwValidationIssue("mode", "INVALID_VALUE", "bounds mode cannot contain radius fields.");
    }
    const north = optionalNumber(input.north, "north", validateLatitude);
    const south = optionalNumber(input.south, "south", validateLatitude);
    const east = optionalNumber(input.east, "east", validateLongitude);
    const west = optionalNumber(input.west, "west", validateLongitude);
    if (north === null || south === null || east === null || west === null) {
      throwValidationIssue("bounds", "REQUIRED", "bounds mode requires north, south, east, and west.");
    }
    if (south >= north || west >= east) throwValidationIssue("bounds", "INVALID_VALUE", "bounds are invalid.");
    const sort = input.sort ?? "newest";
    if (!ordinarySorts.includes(sort as (typeof ordinarySorts)[number])) {
      throwValidationIssue("sort", "INVALID_VALUE", "sort is not valid for bounds mode.");
    }
    return Object.freeze({
      ...common,
      mode: "bounds",
      north,
      south,
      east,
      west,
      ...nullRadius,
      sort: sort as "newest" | "rent_asc" | "rent_desc"
    });
  }

  if (["north", "south", "east", "west"].some((key) => input[key] != null)) {
    throwValidationIssue("mode", "INVALID_VALUE", "radius mode cannot contain bounds fields.");
  }
  const centerLat = optionalNumber(input.centerLat, "centerLat", validateLatitude);
  const centerLng = optionalNumber(input.centerLng, "centerLng", validateLongitude);
  const radiusKm = optionalFiniteNumber(input.radiusKm, "radiusKm");
  if (centerLat === null || centerLng === null || radiusKm === null) {
    throwValidationIssue("radius", "REQUIRED", "radius mode requires centerLat, centerLng, and radiusKm.");
  }
  if (radiusKm <= 0 || radiusKm > 50) {
    throwValidationIssue("radiusKm", "OUT_OF_RANGE", "radiusKm must be greater than zero and at most 50.");
  }
  if (input.sort !== undefined && input.sort !== "distance_asc") {
    throwValidationIssue("sort", "INVALID_VALUE", "radius mode only supports distance_asc.");
  }
  return Object.freeze({
    ...common,
    mode: "radius",
    ...nullBounds,
    centerLat,
    centerLng,
    radiusKm,
    sort: "distance_asc"
  });
}

export function validateCreateSavedSearchBody(value: unknown): CreateSavedSearchInput {
  const body = validateBodyFields(value, ["name", "isActive", "query"]);
  if (!("query" in body)) throwValidationIssue("query", "REQUIRED", "query is required.");
  return Object.freeze({
    name: optionalText(body.name, "name", 120),
    isActive: booleanValue(body.isActive, "isActive", true),
    query: validateQuery(body.query)
  });
}

export function validateUpdateSavedSearchBody(value: unknown): UpdateSavedSearchInput {
  const body = validateBodyFields(value, ["name", "isActive", "query"]);
  if (Object.keys(body).length === 0) throwValidationIssue("body", "REQUIRED", "body must contain a field to update.");
  return Object.freeze({
    ...("name" in body ? { name: optionalText(body.name, "name", 120) } : {}),
    ...("isActive" in body ? { isActive: booleanValue(body.isActive, "isActive") } : {}),
    ...("query" in body ? { query: validateQuery(body.query) } : {})
  });
}

export function validateSavedSearchCollectionQuery(value: unknown): SavedSearchCollectionQuery {
  const query = validateQueryKeys(value, ["page", "pageSize"]);
  const { page, pageSize } = parsePagination(query);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset < 0) throwValidationIssue("page", "OUT_OF_RANGE", "page is too large.");
  return Object.freeze({ page, pageSize, offset });
}

export function parseSavedSearchId(value: string | string[]): number {
  if (typeof value !== "string")
    throwValidationIssue("savedSearchId", "INVALID_TYPE", "savedSearchId must be provided once.");
  return parsePathId(value, "savedSearchId");
}
