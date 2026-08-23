import type { SavedSearchQuery } from "../../types/api";
import { serializeSearchState, type SearchQueryState } from "../listings/search-query";

export function toSavedSearchQuery(state: SearchQueryState): SavedSearchQuery {
  const common = {
    q: state.q ?? null,
    areaName: state.areaName ?? null,
    minMonthlyRent: state.minMonthlyRent ?? null,
    maxMonthlyRent: state.maxMonthlyRent ?? null,
    minRoomAreaSqm: state.minRoomAreaSqm ?? null,
    maxRoomAreaSqm: state.maxRoomAreaSqm ?? null,
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
  const common = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.areaName ? { areaName: query.areaName } : {}),
    ...(query.minMonthlyRent === null ? {} : { minMonthlyRent: query.minMonthlyRent }),
    ...(query.maxMonthlyRent === null ? {} : { maxMonthlyRent: query.maxMonthlyRent }),
    ...(query.minRoomAreaSqm === null ? {} : { minRoomAreaSqm: query.minRoomAreaSqm }),
    ...(query.maxRoomAreaSqm === null ? {} : { maxRoomAreaSqm: query.maxRoomAreaSqm }),
    ...(query.propertyType ? { propertyType: query.propertyType } : {}),
    amenities: query.amenities,
    page: 1,
    pageSize: 15
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
          sort: query.sort === "distance_asc" ? "newest" : query.sort
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
        : { ...common, mode: "ordinary", sort: query.sort === "distance_asc" ? "newest" : query.sort };
  const serialized = serializeSearchState(state).toString();
  return serialized ? `/search?${serialized}` : "/search";
}
