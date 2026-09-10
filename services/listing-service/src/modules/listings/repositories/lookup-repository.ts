import { queryMany, RepositoryInvariantError } from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { QueryResultRow } from "pg";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { mapLookupValueRow, type LookupValue, type LookupValueRow } from "../mappers/lookup-mapper.js";

const PUBLIC_AREA_SUGGESTION_LIMIT = 100;

interface PublicAreaNameRow extends QueryResultRow {
  readonly area_name: unknown;
}

function mapPublicAreaNameRow(row: PublicAreaNameRow): string {
  if (typeof row.area_name !== "string" || row.area_name.trim().length === 0) {
    throw new RepositoryInvariantError("Public area suggestion row contains an invalid area name.");
  }
  return row.area_name;
}

export interface LookupRepository {
  readonly findActivePropertyTypes: () => Promise<readonly LookupValue[]>;
  readonly findActiveAmenities: () => Promise<readonly LookupValue[]>;
  readonly findPublicAreaNames: (activeLandlordIds: readonly number[]) => Promise<readonly string[]>;
}

export function createLookupRepository(executor: SqlExecutor): LookupRepository {
  return Object.freeze({
    async findActivePropertyTypes(): Promise<readonly LookupValue[]> {
      return queryMany<LookupValueRow, LookupValue>(
        executor,
        {
          text: `
            SELECT
              code,
              label
            FROM property_types
            WHERE is_active = true
            ORDER BY
              label ASC,
              code ASC
          `,
          values: []
        },
        mapLookupValueRow
      );
    },

    async findActiveAmenities(): Promise<readonly LookupValue[]> {
      return queryMany<LookupValueRow, LookupValue>(
        executor,
        {
          text: `
            SELECT
              code,
              label
            FROM amenities
            WHERE is_active = true
            ORDER BY
              label ASC,
              code ASC
          `,
          values: []
        },
        mapLookupValueRow
      );
    },

    async findPublicAreaNames(activeLandlordIds: readonly number[]): Promise<readonly string[]> {
      return queryMany<PublicAreaNameRow, string>(
        executor,
        {
          text: `
            SELECT public_areas.area_name
            FROM (
              SELECT DISTINCT btrim(l.area_name) AS area_name
              FROM listings AS l
              WHERE l.status = 'APPROVED'
                AND l.business_status IN ('AVAILABLE', 'UNKNOWN')
                AND l.landlord_id = ANY($1::integer[])
                AND l.area_name IS NOT NULL
                AND btrim(l.area_name) <> ''
            ) AS public_areas
            ORDER BY lower(public_areas.area_name), public_areas.area_name
            LIMIT $2
          `,
          values: [[...activeLandlordIds], PUBLIC_AREA_SUGGESTION_LIMIT]
        },
        mapPublicAreaNameRow
      );
    }
  });
}
