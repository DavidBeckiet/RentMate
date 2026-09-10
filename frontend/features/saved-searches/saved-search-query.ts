import type { SavedSearchQuery } from "../../types/api";
import { amenityLabelForCode, propertyTypeLabelForCode } from "../listings/room-type-label";
import { serializeSearchState, type SearchQueryState } from "../listings/search-query";
import { formatAreaLabel } from "../../lib/area";

export const SAVED_SEARCH_PAGE_SIZE = 20;

export type SavedSearchPageQuery =
  | { readonly ok: true; readonly page: number }
  | { readonly ok: false; readonly message: string };

function scalar(params: URLSearchParams, key: string): string | undefined {
  const values = params.getAll(key);
  if (values.length > 1) throw new Error("duplicate");
  return values[0];
}

function positivePage(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("invalid");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("invalid");
  return parsed;
}

export function parseSavedSearchPageQuery(params: URLSearchParams): SavedSearchPageQuery {
  try {
    return { ok: true, page: positivePage(scalar(params, "page")) ?? 1 };
  } catch {
    return { ok: false, message: "Liên kết phân trang tìm kiếm đã lưu không hợp lệ." };
  }
}

export function savedSearchPageUrl(page: number): string {
  if (page <= 1) return "/saved-searches";
  return `/saved-searches?page=${page}`;
}

export function toSavedSearchQuery(state: SearchQueryState): SavedSearchQuery {
  const common = {
    q: state.q ?? null,
    areaName: state.areaName ? formatAreaLabel(state.areaName) : null,
    minMonthlyRent: state.minMonthlyRent ?? null,
    maxMonthlyRent: state.maxMonthlyRent ?? null,
    minRoomAreaSqm: state.minRoomAreaSqm ?? null,
    maxRoomAreaSqm: state.maxRoomAreaSqm ?? null,
    minOccupants: state.minOccupants ?? null,
    propertyType: state.propertyType ?? null,
    amenities: state.amenities,
    north: null,
    south: null,
    east: null,
    west: null,
    centerLat: null,
    centerLng: null,
    radiusKm: null
  } as const;
  if (state.mode === "bounds") {
    return {
      ...common,
      mode: "bounds",
      north: state.north,
      south: state.south,
      east: state.east,
      west: state.west,
      sort: state.sort
    };
  }
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
  return { ...common, mode: "ordinary", sort: state.sort };
}

export function savedSearchUrl(query: SavedSearchQuery): string {
  const propertyType =
    query.propertyType && propertyTypeLabelForCode(query.propertyType) ? query.propertyType.trim().toUpperCase() : null;
  const amenities = query.amenities
    .filter((code) => amenityLabelForCode(code) !== null)
    .map((code) => code.trim().toUpperCase());
  const common = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.areaName ? { areaName: formatAreaLabel(query.areaName) } : {}),
    ...(query.minMonthlyRent === null ? {} : { minMonthlyRent: query.minMonthlyRent }),
    ...(query.maxMonthlyRent === null ? {} : { maxMonthlyRent: query.maxMonthlyRent }),
    ...(query.minRoomAreaSqm === null ? {} : { minRoomAreaSqm: query.minRoomAreaSqm }),
    ...(query.maxRoomAreaSqm === null ? {} : { maxRoomAreaSqm: query.maxRoomAreaSqm }),
    ...(query.minOccupants === null ? {} : { minOccupants: query.minOccupants }),
    ...(propertyType ? { propertyType } : {}),
    amenities,
    page: 1,
    pageSize: SAVED_SEARCH_PAGE_SIZE
  } as const;
  const state: SearchQueryState =
    query.mode === "bounds"
      ? {
          ...common,
          mode: "bounds",
          north: query.north!,
          south: query.south!,
          east: query.east!,
          west: query.west!,
          sort: query.sort === "rent_asc" || query.sort === "rent_desc" ? query.sort : "newest"
        }
      : query.mode === "radius"
        ? {
            ...common,
            mode: "radius",
            centerLat: query.centerLat!,
            centerLng: query.centerLng!,
            radiusKm: query.radiusKm!,
            sort: "distance_asc"
          }
        : {
            ...common,
            mode: "ordinary",
            sort: query.sort === "rent_asc" || query.sort === "rent_desc" ? query.sort : "newest"
          };
  const serialized = serializeSearchState(state).toString();
  return serialized ? `/search?${serialized}` : "/search";
}
