import type { MapBounds, MapPoint } from "../../components/map/map-base";
import type { PublicListingSearchQuery, PublicListingSort } from "../../types/api";
import { formatAreaLabel } from "../../lib/area";

const ordinarySorts = ["newest", "rent_asc", "rent_desc"] as const;
const wholeNumberPattern = /^[0-9]+$/;
const areaPattern = /^[0-9]+(?:\.[0-9]{1,2})?$/;
const decimalPattern = /^-?[0-9]+(?:\.[0-9]+)?$/;
const codePattern = /^[A-Z][A-Z0-9_]*$/;
const maximumMonthlyRent = 999_999_999_999;

export type OrdinarySearchSort = (typeof ordinarySorts)[number];

export interface SearchFilterValues {
  readonly q?: string;
  readonly areaName?: string;
  readonly minMonthlyRent?: number;
  readonly maxMonthlyRent?: number;
  readonly minRoomAreaSqm?: number;
  readonly maxRoomAreaSqm?: number;
  readonly minOccupants?: number;
  readonly propertyType?: string;
  readonly amenities: readonly string[];
}

interface SearchStateBase extends SearchFilterValues {
  readonly page: number;
  readonly pageSize: number;
}

export interface OrdinarySearchState extends SearchStateBase {
  readonly mode: "ordinary";
  readonly sort: OrdinarySearchSort;
}

export interface BoundsSearchState extends SearchStateBase, MapBounds {
  readonly mode: "bounds";
  readonly sort: OrdinarySearchSort;
}

export interface RadiusSearchState extends SearchStateBase {
  readonly mode: "radius";
  readonly centerLat: number;
  readonly centerLng: number;
  readonly radiusKm: number;
  readonly sort: "distance_asc";
}

export type SearchQueryState = OrdinarySearchState | BoundsSearchState | RadiusSearchState;

export type SearchQueryParseResult =
  | { readonly ok: true; readonly state: SearchQueryState }
  | { readonly ok: false; readonly message: string };

interface SearchParamsReader {
  readonly getAll: (key: string) => string[];
}

class SearchQueryError extends Error {}

function fail(message: string): never {
  throw new SearchQueryError(message);
}

function scalar(params: SearchParamsReader, key: string): string | undefined {
  const values = params.getAll(key);
  if (values.length > 1) fail(`Tham số “${key}” chỉ được xuất hiện một lần.`);
  return values[0];
}

function text(params: SearchParamsReader, key: string): string | undefined {
  const value = scalar(params, key)?.trim();
  return value ? value : undefined;
}

function positiveInteger(params: SearchParamsReader, key: string, maximum?: number): number | undefined {
  const value = scalar(params, key);
  if (value === undefined) return undefined;
  if (!wholeNumberPattern.test(value)) fail(`Tham số “${key}” phải là số nguyên dương.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum !== undefined && parsed > maximum)) {
    fail(`Tham số “${key}” nằm ngoài phạm vi được hỗ trợ.`);
  }
  return parsed;
}

function positiveArea(params: SearchParamsReader, key: string): number | undefined {
  const value = scalar(params, key);
  if (value === undefined) return undefined;
  if (!areaPattern.test(value)) fail(`Tham số “${key}” phải là số dương với tối đa hai chữ số thập phân.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) fail(`Tham số “${key}” phải lớn hơn 0.`);
  return parsed;
}

function decimal(params: SearchParamsReader, key: string): number | undefined {
  const value = scalar(params, key);
  if (value === undefined) return undefined;
  if (!decimalPattern.test(value)) fail(`Tham số “${key}” phải là một số hữu hạn.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(`Tham số “${key}” phải là một số hữu hạn.`);
  return parsed;
}

function code(params: SearchParamsReader, key: string): string | undefined {
  const value = scalar(params, key);
  if (value === undefined) return undefined;
  const normalized = value.trim().toUpperCase();
  if (!codePattern.test(normalized)) fail(`Tham số “${key}” không có định dạng mã hợp lệ.`);
  return normalized;
}

export function normalizeAmenityCodes(values: readonly string[]): readonly string[] {
  const normalized = values.map((value) => value.trim().toUpperCase());
  if (normalized.some((value) => !codePattern.test(value))) {
    fail("Danh sách tiện ích chứa mã không hợp lệ.");
  }
  return Object.freeze([...new Set(normalized)].sort());
}

function amenityCodes(params: SearchParamsReader): readonly string[] {
  const value = scalar(params, "amenities");
  if (value === undefined) return Object.freeze([]);
  return normalizeAmenityCodes(value.split(","));
}

function coordinate(params: SearchParamsReader, key: string, minimum: number, maximum: number): number | undefined {
  const value = decimal(params, key);
  if (value !== undefined && (value < minimum || value > maximum)) {
    fail(`Tham số “${key}” nằm ngoài phạm vi tọa độ hợp lệ.`);
  }
  return value;
}

function ordinarySort(params: SearchParamsReader): OrdinarySearchSort {
  const value = scalar(params, "sort") ?? "newest";
  if (!ordinarySorts.includes(value as OrdinarySearchSort)) {
    fail("Kiểu sắp xếp không hợp lệ cho tìm kiếm hiện tại.");
  }
  return value as OrdinarySearchSort;
}

function commonState(params: SearchParamsReader): SearchStateBase {
  const minMonthlyRent = positiveInteger(params, "minMonthlyRent", maximumMonthlyRent);
  const maxMonthlyRent = positiveInteger(params, "maxMonthlyRent", maximumMonthlyRent);
  const minRoomAreaSqm = positiveArea(params, "minRoomAreaSqm");
  const maxRoomAreaSqm = positiveArea(params, "maxRoomAreaSqm");
  const minOccupants = positiveInteger(params, "minOccupants", 20);
  if (minMonthlyRent !== undefined && maxMonthlyRent !== undefined && maxMonthlyRent < minMonthlyRent) {
    fail("Giá thuê tối đa phải lớn hơn hoặc bằng giá thuê tối thiểu.");
  }
  if (minRoomAreaSqm !== undefined && maxRoomAreaSqm !== undefined && maxRoomAreaSqm < minRoomAreaSqm) {
    fail("Diện tích tối đa phải lớn hơn hoặc bằng diện tích tối thiểu.");
  }

  return {
    ...(text(params, "q") ? { q: text(params, "q") } : {}),
    ...(text(params, "areaName") ? { areaName: formatAreaLabel(text(params, "areaName")!) } : {}),
    ...(minMonthlyRent === undefined ? {} : { minMonthlyRent }),
    ...(maxMonthlyRent === undefined ? {} : { maxMonthlyRent }),
    ...(minRoomAreaSqm === undefined ? {} : { minRoomAreaSqm }),
    ...(maxRoomAreaSqm === undefined ? {} : { maxRoomAreaSqm }),
    ...(minOccupants === undefined ? {} : { minOccupants }),
    ...(code(params, "propertyType") ? { propertyType: code(params, "propertyType") } : {}),
    amenities: amenityCodes(params),
    page: positiveInteger(params, "page") ?? 1,
    pageSize: positiveInteger(params, "pageSize", 100) ?? 20
  };
}

export function parseSearchQuery(params: SearchParamsReader): SearchQueryParseResult {
  try {
    const boundsValues = ["north", "south", "east", "west"].map((key) => scalar(params, key));
    const radiusValues = ["centerLat", "centerLng", "radiusKm"].map((key) => scalar(params, key));
    const hasBounds = boundsValues.some((value) => value !== undefined);
    const hasRadius = radiusValues.some((value) => value !== undefined);
    if (hasBounds && hasRadius) fail("Không thể tìm theo vùng bản đồ và bán kính cùng lúc.");
    if (hasBounds && boundsValues.some((value) => value === undefined)) fail("Vùng bản đồ chưa có đủ bốn cạnh.");
    if (hasRadius && radiusValues.some((value) => value === undefined))
      fail("Tìm theo bán kính chưa có đủ tâm và bán kính.");

    const common = commonState(params);
    if (hasBounds) {
      const north = coordinate(params, "north", -90, 90)!;
      const south = coordinate(params, "south", -90, 90)!;
      const east = coordinate(params, "east", -180, 180)!;
      const west = coordinate(params, "west", -180, 180)!;
      if (south >= north || west >= east) fail("Các cạnh của vùng bản đồ không tạo thành một vùng hợp lệ.");
      return { ok: true, state: { ...common, mode: "bounds", north, south, east, west, sort: ordinarySort(params) } };
    }

    if (hasRadius) {
      const centerLat = coordinate(params, "centerLat", -90, 90)!;
      const centerLng = coordinate(params, "centerLng", -180, 180)!;
      const radiusKm = decimal(params, "radiusKm")!;
      if (radiusKm <= 0) fail("Bán kính phải lớn hơn 0.");
      const sort = scalar(params, "sort") ?? "distance_asc";
      if (sort !== "distance_asc") fail("Tìm theo bán kính chỉ hỗ trợ sắp xếp theo khoảng cách.");
      return { ok: true, state: { ...common, mode: "radius", centerLat, centerLng, radiusKm, sort } };
    }

    return { ok: true, state: { ...common, mode: "ordinary", sort: ordinarySort(params) } };
  } catch (error) {
    if (error instanceof SearchQueryError) return { ok: false, message: error.message };
    throw error;
  }
}

function appendNumber(params: URLSearchParams, key: string, value: number | undefined): void {
  if (value !== undefined) params.set(key, String(value));
}

export function serializeSearchState(state: SearchQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.areaName) params.set("areaName", formatAreaLabel(state.areaName));
  appendNumber(params, "minMonthlyRent", state.minMonthlyRent);
  appendNumber(params, "maxMonthlyRent", state.maxMonthlyRent);
  appendNumber(params, "minRoomAreaSqm", state.minRoomAreaSqm);
  appendNumber(params, "maxRoomAreaSqm", state.maxRoomAreaSqm);
  appendNumber(params, "minOccupants", state.minOccupants);
  if (state.propertyType) params.set("propertyType", state.propertyType);
  if (state.amenities.length > 0) params.set("amenities", normalizeAmenityCodes(state.amenities).join(","));

  if (state.mode === "bounds") {
    appendNumber(params, "north", state.north);
    appendNumber(params, "south", state.south);
    appendNumber(params, "east", state.east);
    appendNumber(params, "west", state.west);
  } else if (state.mode === "radius") {
    appendNumber(params, "centerLat", state.centerLat);
    appendNumber(params, "centerLng", state.centerLng);
    appendNumber(params, "radiusKm", state.radiusKm);
  }

  if (state.page !== 1) appendNumber(params, "page", state.page);
  if (state.pageSize !== 20) appendNumber(params, "pageSize", state.pageSize);
  if (state.mode === "radius" || state.sort !== "newest") params.set("sort", state.sort);
  return params;
}

export function toPublicListingSearchQuery(state: SearchQueryState): PublicListingSearchQuery {
  const common: PublicListingSearchQuery = {
    ...(state.q ? { q: state.q } : {}),
    ...(state.areaName ? { areaName: state.areaName } : {}),
    ...(state.minMonthlyRent === undefined ? {} : { minMonthlyRent: state.minMonthlyRent }),
    ...(state.maxMonthlyRent === undefined ? {} : { maxMonthlyRent: state.maxMonthlyRent }),
    ...(state.minRoomAreaSqm === undefined ? {} : { minRoomAreaSqm: state.minRoomAreaSqm }),
    ...(state.maxRoomAreaSqm === undefined ? {} : { maxRoomAreaSqm: state.maxRoomAreaSqm }),
    ...(state.minOccupants === undefined ? {} : { minOccupants: state.minOccupants }),
    ...(state.propertyType ? { propertyType: state.propertyType } : {}),
    ...(state.amenities.length > 0 ? { amenities: normalizeAmenityCodes(state.amenities) } : {}),
    page: state.page,
    pageSize: state.pageSize,
    sort: state.sort
  };
  if (state.mode === "bounds") {
    return { ...common, north: state.north, south: state.south, east: state.east, west: state.west };
  }
  if (state.mode === "radius") {
    return { ...common, centerLat: state.centerLat, centerLng: state.centerLng, radiusKm: state.radiusKm };
  }
  return common;
}

export function applySearchFilters(
  state: SearchQueryState,
  filters: SearchFilterValues,
  requestedSort: PublicListingSort
): SearchQueryState {
  const common = {
    ...filters,
    q: filters.q?.trim() || undefined,
    areaName: filters.areaName?.trim() || undefined,
    propertyType: filters.propertyType?.trim().toUpperCase() || undefined,
    amenities: normalizeAmenityCodes(filters.amenities),
    page: 1,
    pageSize: state.pageSize
  };
  if (state.mode === "radius") {
    return {
      ...common,
      mode: "radius",
      centerLat: state.centerLat,
      centerLng: state.centerLng,
      radiusKm: state.radiusKm,
      sort: "distance_asc"
    };
  }
  const sort = ordinarySorts.includes(requestedSort as OrdinarySearchSort)
    ? (requestedSort as OrdinarySearchSort)
    : "newest";
  if (state.mode === "bounds") {
    return {
      ...common,
      mode: "bounds",
      north: state.north,
      south: state.south,
      east: state.east,
      west: state.west,
      sort
    };
  }
  return { ...common, mode: "ordinary", sort };
}

export function withBounds(state: SearchQueryState, bounds: MapBounds): BoundsSearchState {
  return {
    ...searchFilterValues(state),
    mode: "bounds",
    ...bounds,
    page: 1,
    pageSize: state.pageSize,
    sort: state.sort === "distance_asc" ? "newest" : state.sort
  };
}

export function withRadius(state: SearchQueryState, center: MapPoint, radiusKm: number): RadiusSearchState {
  return {
    ...searchFilterValues(state),
    mode: "radius",
    centerLat: center.latitude,
    centerLng: center.longitude,
    radiusKm,
    page: 1,
    pageSize: state.pageSize,
    sort: "distance_asc"
  };
}

export function withPage(state: SearchQueryState, page: number): SearchQueryState {
  return { ...state, page };
}

export function searchFilterValues(state: SearchQueryState): SearchFilterValues {
  return {
    ...(state.q ? { q: state.q } : {}),
    ...(state.areaName ? { areaName: state.areaName } : {}),
    ...(state.minMonthlyRent === undefined ? {} : { minMonthlyRent: state.minMonthlyRent }),
    ...(state.maxMonthlyRent === undefined ? {} : { maxMonthlyRent: state.maxMonthlyRent }),
    ...(state.minRoomAreaSqm === undefined ? {} : { minRoomAreaSqm: state.minRoomAreaSqm }),
    ...(state.maxRoomAreaSqm === undefined ? {} : { maxRoomAreaSqm: state.maxRoomAreaSqm }),
    ...(state.minOccupants === undefined ? {} : { minOccupants: state.minOccupants }),
    ...(state.propertyType ? { propertyType: state.propertyType } : {}),
    amenities: state.amenities
  };
}

export function activeFilterCount(state: SearchQueryState): number {
  return [
    state.q,
    state.areaName,
    state.minMonthlyRent,
    state.maxMonthlyRent,
    state.minRoomAreaSqm,
    state.maxRoomAreaSqm,
    state.minOccupants,
    state.propertyType,
    state.amenities.length > 0 ? state.amenities : undefined,
    state.mode === "ordinary" ? undefined : state.mode
  ].filter((value) => value !== undefined).length;
}
