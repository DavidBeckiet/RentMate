import { queryMany } from "../../db/repository-primitives.js";
import type { SqlExecutor } from "../../db/sql-executor.js";
import { mapLookupValueRow, type LookupValue, type LookupValueRow } from "./lookup-mapper.js";

export interface LookupRepository {
  readonly findActivePropertyTypes: () => Promise<readonly LookupValue[]>;
  readonly findActiveAmenities: () => Promise<readonly LookupValue[]>;
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
    }
  });
}
