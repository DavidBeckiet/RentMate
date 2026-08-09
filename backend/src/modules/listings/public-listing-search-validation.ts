import { throwValidationIssue } from "../../shared/validation/issues.js";
import {
  parseFiniteQueryDecimal,
  parsePagination,
  parsePositiveQueryInteger
} from "../../shared/validation/parsing.js";
import { readScalarQueryValue, validateQueryKeys } from "../../shared/validation/request.js";

const queryKeys = [
  "q",
  "areaName",
  "minMonthlyRent",
  "maxMonthlyRent",
  "minRoomAreaSqm",
  "maxRoomAreaSqm",
  "propertyType",
  "amenities",
  "north",
  "south",
  "east",
  "west",
  "centerLat",
  "centerLng",
  "radiusKm",
  "page",
  "pageSize",
  "sort"
] as const;

const boundsKeys = ["north", "south", "east", "west"] as const;
const radiusKeys = ["centerLat", "centerLng", "radiusKm"] as const;
const roomAreaPattern = /^[0-9]+(?:\.[0-9]{1,2})?$/;
const ordinarySorts = ["newest", "rent_asc", "rent_desc"] as const;

export type OrdinaryPublicSearchSort = (typeof ordinarySorts)[number];

export interface PublicSearchCommonFilters {
  readonly q: string | null;
  readonly areaName: string | null;
  readonly minMonthlyRent: number | null;
  readonly maxMonthlyRent: number | null;
  readonly minRoomAreaSqm: number | null;
  readonly maxRoomAreaSqm: number | null;
  readonly propertyType: string | null;
  readonly amenities: readonly string[];
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

export interface OrdinaryPublicListingSearch extends PublicSearchCommonFilters {
  readonly mode: "ordinary";
  readonly sort: OrdinaryPublicSearchSort;
}

export interface BoundsPublicListingSearch extends PublicSearchCommonFilters {
  readonly mode: "bounds";
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
  readonly sort: OrdinaryPublicSearchSort;
}

export interface RadiusPublicListingSearch extends PublicSearchCommonFilters {
  readonly mode: "radius";
  readonly centerLat: number;
  readonly centerLng: number;
  readonly radiusKm: number;
  readonly sort: "distance_asc";
}

export type PublicListingSearch = OrdinaryPublicListingSearch | BoundsPublicListingSearch | RadiusPublicListingSearch;

function parseBlankableText(value: unknown, field: string): string | null {
  const scalar = readScalarQueryValue(value, field);
  if (scalar === undefined) return null;
  const normalized = scalar.trim();
  return normalized.length === 0 ? null : normalized;
}

function parseRoomArea(value: unknown, field: string): number | null {
  const scalar = readScalarQueryValue(value, field);
  if (scalar === undefined) return null;
  if (!roomAreaPattern.test(scalar)) {
    throwValidationIssue(
      field,
      "INVALID_VALUE",
      `${field} must be a positive decimal with at most two decimal places.`
    );
  }
  const parsed = Number(scalar);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999_999.99) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} is outside the allowed range.`);
  }
  return parsed;
}

function parseCode(value: unknown, field: string): string | null {
  const scalar = readScalarQueryValue(value, field);
  if (scalar === undefined) return null;
  const normalized = scalar.trim().toUpperCase();
  if (normalized.length === 0) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must be a nonblank code.`);
  }
  return normalized;
}

function parseAmenities(value: unknown): readonly string[] {
  const scalar = readScalarQueryValue(value, "amenities");
  if (scalar === undefined) return Object.freeze([]);
  const tokens = scalar.split(",").map((token) => token.trim().toUpperCase());
  if (tokens.some((token) => token.length === 0)) {
    throwValidationIssue("amenities", "INVALID_VALUE", "amenities must contain only nonblank comma-separated codes.");
  }
  return Object.freeze([...new Set(tokens)].sort());
}

function ensureRange(minimum: number | null, maximum: number | null, field: string): void {
  if (minimum !== null && maximum !== null && maximum < minimum) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must be greater than or equal to its minimum.`);
  }
}

function parseCoordinate(value: unknown, field: string, minimum: number, maximum: number): number {
  const parsed = parseFiniteQueryDecimal(value, field);
  if (parsed === undefined) {
    throwValidationIssue(field, "REQUIRED", `${field} is required for this geographic search mode.`);
  }
  if (parsed < minimum || parsed > maximum) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} is outside the allowed coordinate range.`);
  }
  return parsed;
}

function hasAny(query: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return keys.some((key) => query[key] !== undefined);
}

function requireCompleteGroup(query: Readonly<Record<string, unknown>>, keys: readonly string[], field: string): void {
  if (!keys.every((key) => query[key] !== undefined)) {
    throwValidationIssue(field, "REQUIRED", `${field} requires every value in its query group.`);
  }
}

function parseOrdinarySort(value: unknown): OrdinaryPublicSearchSort {
  const scalar = readScalarQueryValue(value, "sort") ?? "newest";
  if (!ordinarySorts.includes(scalar as OrdinaryPublicSearchSort)) {
    throwValidationIssue("sort", "INVALID_VALUE", "sort is not valid for this search mode.");
  }
  return scalar as OrdinaryPublicSearchSort;
}

function parseRadiusSort(value: unknown): "distance_asc" {
  const scalar = readScalarQueryValue(value, "sort") ?? "distance_asc";
  if (scalar !== "distance_asc") {
    throwValidationIssue("sort", "INVALID_VALUE", "sort is not valid for this search mode.");
  }
  return "distance_asc";
}

export function validatePublicListingSearch(value: unknown): PublicListingSearch {
  const query = validateQueryKeys(value, queryKeys);
  const boundsPresent = hasAny(query, boundsKeys);
  const radiusPresent = hasAny(query, radiusKeys);
  if (boundsPresent && radiusPresent) {
    throwValidationIssue("query", "INVALID_VALUE", "Bounds and radius query groups are mutually exclusive.");
  }
  if (boundsPresent) requireCompleteGroup(query, boundsKeys, "bounds");
  if (radiusPresent) requireCompleteGroup(query, radiusKeys, "radius");

  const q = parseBlankableText(query.q, "q");
  const areaName = parseBlankableText(query.areaName, "areaName");
  const minMonthlyRent = parsePositiveQueryInteger(query.minMonthlyRent, "minMonthlyRent", 999_999_999_999) ?? null;
  const maxMonthlyRent = parsePositiveQueryInteger(query.maxMonthlyRent, "maxMonthlyRent", 999_999_999_999) ?? null;
  const minRoomAreaSqm = parseRoomArea(query.minRoomAreaSqm, "minRoomAreaSqm");
  const maxRoomAreaSqm = parseRoomArea(query.maxRoomAreaSqm, "maxRoomAreaSqm");
  ensureRange(minMonthlyRent, maxMonthlyRent, "maxMonthlyRent");
  ensureRange(minRoomAreaSqm, maxRoomAreaSqm, "maxRoomAreaSqm");
  const propertyType = parseCode(query.propertyType, "propertyType");
  const amenities = parseAmenities(query.amenities);
  const { page, pageSize } = parsePagination(query);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(pageSize + 1)) {
    throwValidationIssue("page", "OUT_OF_RANGE", "page produces an offset outside the allowed range.");
  }

  const common = {
    q,
    areaName,
    minMonthlyRent,
    maxMonthlyRent,
    minRoomAreaSqm,
    maxRoomAreaSqm,
    propertyType,
    amenities,
    page,
    pageSize,
    offset
  } as const;

  if (boundsPresent) {
    const north = parseCoordinate(query.north, "north", -90, 90);
    const south = parseCoordinate(query.south, "south", -90, 90);
    const east = parseCoordinate(query.east, "east", -180, 180);
    const west = parseCoordinate(query.west, "west", -180, 180);
    if (south >= north) throwValidationIssue("south", "INVALID_VALUE", "south must be less than north.");
    if (west >= east) throwValidationIssue("west", "INVALID_VALUE", "west must be less than east.");
    return Object.freeze({ ...common, mode: "bounds", north, south, east, west, sort: parseOrdinarySort(query.sort) });
  }

  if (radiusPresent) {
    const centerLat = parseCoordinate(query.centerLat, "centerLat", -90, 90);
    const centerLng = parseCoordinate(query.centerLng, "centerLng", -180, 180);
    const radiusKm = parseFiniteQueryDecimal(query.radiusKm, "radiusKm");
    if (radiusKm === undefined) throwValidationIssue("radiusKm", "REQUIRED", "radiusKm is required for radius search.");
    if (radiusKm <= 0) throwValidationIssue("radiusKm", "OUT_OF_RANGE", "radiusKm must be greater than zero.");
    return Object.freeze({
      ...common,
      mode: "radius",
      centerLat,
      centerLng,
      radiusKm,
      sort: parseRadiusSort(query.sort)
    });
  }

  return Object.freeze({ ...common, mode: "ordinary", sort: parseOrdinarySort(query.sort) });
}

export function validatePublicListingSearchBody(value: unknown): void {
  if (value !== undefined) {
    throwValidationIssue("body", "INVALID_VALUE", "body must be omitted.");
  }
}
