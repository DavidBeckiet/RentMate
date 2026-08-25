import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryExactlyOne,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";
import type { CreateSavedSearchInput, SavedSearchQuery } from "../validations/saved-search-validation.js";

export interface SavedSearch {
  readonly id: number;
  readonly tenantId: number;
  readonly name: string | null;
  readonly isActive: boolean;
  readonly query: SavedSearchQuery;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface SavedSearchRow extends QueryResultRow {
  id: unknown;
  tenant_id: unknown;
  name: unknown;
  is_active: unknown;
  q: unknown;
  area_name: unknown;
  min_monthly_rent: unknown;
  max_monthly_rent: unknown;
  min_room_area_sqm: unknown;
  max_room_area_sqm: unknown;
  min_occupants: unknown;
  property_type_code: unknown;
  amenity_codes: unknown;
  mode: unknown;
  north: unknown;
  south: unknown;
  east: unknown;
  west: unknown;
  center_lat: unknown;
  center_lng: unknown;
  radius_km: unknown;
  sort: unknown;
  created_at: unknown;
  updated_at: unknown;
}

const selectColumns = `
  id, tenant_id, name, is_active, q, area_name, min_monthly_rent, max_monthly_rent,
  min_room_area_sqm, max_room_area_sqm, property_type_code, amenity_codes, mode,
  min_occupants,
  north, south, east, west, center_lat, center_lng, radius_km, sort, created_at, updated_at
`;

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new RepositoryInvariantError(`${field} is invalid.`);
  return value as number;
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new RepositoryInvariantError(`${field} is invalid.`);
  return parsed;
}

function timestamp(value: unknown, field: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  try {
    return formatApiTimestamp(date);
  } catch {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
}

function mapSavedSearch(row: Readonly<SavedSearchRow>): SavedSearch {
  if (
    (row.name !== null && typeof row.name !== "string") ||
    typeof row.is_active !== "boolean" ||
    (row.q !== null && typeof row.q !== "string") ||
    (row.area_name !== null && typeof row.area_name !== "string") ||
    (row.property_type_code !== null && typeof row.property_type_code !== "string") ||
    !Array.isArray(row.amenity_codes) ||
    !row.amenity_codes.every((value) => typeof value === "string") ||
    !["ordinary", "bounds", "radius"].includes(String(row.mode)) ||
    !["newest", "rent_asc", "rent_desc", "distance_asc"].includes(String(row.sort))
  ) {
    throw new RepositoryInvariantError("Saved search representation is invalid.");
  }
  return Object.freeze({
    id: positiveInteger(row.id, "savedSearch.id"),
    tenantId: positiveInteger(row.tenant_id, "savedSearch.tenantId"),
    name: row.name as string | null,
    isActive: row.is_active,
    query: Object.freeze({
      q: row.q as string | null,
      areaName: row.area_name as string | null,
      minMonthlyRent: nullableNumber(row.min_monthly_rent, "minMonthlyRent"),
      maxMonthlyRent: nullableNumber(row.max_monthly_rent, "maxMonthlyRent"),
      minRoomAreaSqm: nullableNumber(row.min_room_area_sqm, "minRoomAreaSqm"),
      maxRoomAreaSqm: nullableNumber(row.max_room_area_sqm, "maxRoomAreaSqm"),
      minOccupants: nullableNumber(row.min_occupants, "minOccupants"),
      propertyType: row.property_type_code as string | null,
      amenities: Object.freeze([...(row.amenity_codes as string[])]),
      mode: row.mode as SavedSearchQuery["mode"],
      north: nullableNumber(row.north, "north"),
      south: nullableNumber(row.south, "south"),
      east: nullableNumber(row.east, "east"),
      west: nullableNumber(row.west, "west"),
      centerLat: nullableNumber(row.center_lat, "centerLat"),
      centerLng: nullableNumber(row.center_lng, "centerLng"),
      radiusKm: nullableNumber(row.radius_km, "radiusKm"),
      sort: row.sort as SavedSearchQuery["sort"]
    }),
    createdAt: timestamp(row.created_at, "savedSearch.createdAt"),
    updatedAt: timestamp(row.updated_at, "savedSearch.updatedAt")
  });
}

function values(tenantId: number, input: CreateSavedSearchInput): readonly unknown[] {
  const query = input.query;
  return [
    tenantId,
    input.name,
    input.isActive,
    query.q,
    query.areaName,
    query.minMonthlyRent,
    query.maxMonthlyRent,
    query.minRoomAreaSqm,
    query.maxRoomAreaSqm,
    query.minOccupants,
    query.propertyType,
    [...query.amenities],
    query.mode,
    query.north,
    query.south,
    query.east,
    query.west,
    query.centerLat,
    query.centerLng,
    query.radiusKm,
    query.sort
  ];
}

export interface SavedSearchRepository {
  readonly create: (executor: SqlExecutor, tenantId: number, input: CreateSavedSearchInput) => Promise<SavedSearch>;
  readonly list: (
    executor: SqlExecutor,
    tenantId: number,
    pageSize: number,
    offset: number
  ) => Promise<readonly SavedSearch[]>;
  readonly findForUpdate: (
    executor: SqlExecutor,
    tenantId: number,
    savedSearchId: number
  ) => Promise<SavedSearch | null>;
  readonly update: (
    executor: SqlExecutor,
    tenantId: number,
    savedSearchId: number,
    input: CreateSavedSearchInput
  ) => Promise<SavedSearch>;
  readonly remove: (executor: SqlExecutor, tenantId: number, savedSearchId: number) => Promise<boolean>;
}

export function createSavedSearchRepository(): SavedSearchRepository {
  const repository: SavedSearchRepository = {
    create(executor, tenantId, input) {
      return queryExactlyOne<SavedSearchRow, SavedSearch>(
        executor,
        {
          text: `
          INSERT INTO saved_searches (
            tenant_id, name, is_active, q, area_name, min_monthly_rent, max_monthly_rent,
            min_room_area_sqm, max_room_area_sqm, min_occupants, property_type_code, amenity_codes, mode,
            north, south, east, west, center_lat, center_lng, radius_km, sort
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
          )
          RETURNING ${selectColumns}
        `,
          values: values(tenantId, input)
        },
        mapSavedSearch
      );
    },

    list(executor, tenantId, pageSize, offset) {
      return queryMany<SavedSearchRow, SavedSearch>(
        executor,
        {
          text: `
          SELECT ${selectColumns}
          FROM saved_searches
          WHERE tenant_id = $1
          ORDER BY updated_at DESC, id DESC
          LIMIT $2 OFFSET $3
        `,
          values: [tenantId, pageSize + 1, offset]
        },
        mapSavedSearch
      );
    },

    findForUpdate(executor, tenantId, savedSearchId) {
      return queryOptional<SavedSearchRow, SavedSearch>(
        executor,
        {
          text: `SELECT ${selectColumns} FROM saved_searches WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          values: [savedSearchId, tenantId]
        },
        mapSavedSearch
      );
    },

    update(executor, tenantId, savedSearchId, input) {
      return queryExactlyOne<SavedSearchRow, SavedSearch>(
        executor,
        {
          text: `
          UPDATE saved_searches SET
            name = $3, is_active = $4, q = $5, area_name = $6, min_monthly_rent = $7,
            max_monthly_rent = $8, min_room_area_sqm = $9, max_room_area_sqm = $10,
            min_occupants = $11, property_type_code = $12, amenity_codes = $13, mode = $14, north = $15, south = $16,
            east = $17, west = $18, center_lat = $19, center_lng = $20, radius_km = $21,
            sort = $22, updated_at = now()
          WHERE id = $1 AND tenant_id = $2
          RETURNING ${selectColumns}
        `,
          values: [savedSearchId, ...values(tenantId, input)]
        },
        mapSavedSearch
      );
    },

    async remove(executor, tenantId, savedSearchId) {
      return (
        (await executeCommand(executor, {
          text: "DELETE FROM saved_searches WHERE id = $1 AND tenant_id = $2",
          values: [savedSearchId, tenantId]
        })) === 1
      );
    }
  };
  return Object.freeze(repository);
}
