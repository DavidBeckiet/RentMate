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

export interface ListingNote {
  readonly tenantId: number;
  readonly listingId: number;
  readonly note: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ListingNoteRow extends QueryResultRow {
  tenant_id: unknown;
  listing_id: unknown;
  note: unknown;
  created_at: unknown;
  updated_at: unknown;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new RepositoryInvariantError(`${field} is invalid.`);
  return value as number;
}

function timestamp(value: unknown, field: string): string {
  try {
    return formatApiTimestamp(value instanceof Date ? value : new Date(String(value)));
  } catch {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
}

function mapListingNote(row: Readonly<ListingNoteRow>): ListingNote {
  if (typeof row.note !== "string" || row.note.length === 0 || row.note !== row.note.trim()) {
    throw new RepositoryInvariantError("Listing note representation is invalid.");
  }
  return Object.freeze({
    tenantId: positiveInteger(row.tenant_id, "listingNote.tenantId"),
    listingId: positiveInteger(row.listing_id, "listingNote.listingId"),
    note: row.note,
    createdAt: timestamp(row.created_at, "listingNote.createdAt"),
    updatedAt: timestamp(row.updated_at, "listingNote.updatedAt")
  });
}

const columns = "tenant_id, listing_id, note, created_at, updated_at";

export interface ListingNoteRepository {
  readonly list: (
    executor: SqlExecutor,
    tenantId: number,
    listingIds: readonly number[]
  ) => Promise<readonly ListingNote[]>;
  readonly findForUpdate: (executor: SqlExecutor, tenantId: number, listingId: number) => Promise<ListingNote | null>;
  readonly upsert: (executor: SqlExecutor, tenantId: number, listingId: number, note: string) => Promise<ListingNote>;
  readonly remove: (executor: SqlExecutor, tenantId: number, listingId: number) => Promise<void>;
}

export function createListingNoteRepository(): ListingNoteRepository {
  return Object.freeze({
    list(executor, tenantId, listingIds) {
      return queryMany<ListingNoteRow, ListingNote>(
        executor,
        {
          text: `SELECT ${columns} FROM tenant_listing_notes
            WHERE tenant_id = $1 AND listing_id = ANY($2::integer[])
            ORDER BY array_position($2::integer[], listing_id)`,
          values: [tenantId, [...listingIds]]
        },
        mapListingNote
      );
    },

    findForUpdate(executor, tenantId, listingId) {
      return queryOptional<ListingNoteRow, ListingNote>(
        executor,
        {
          text: `SELECT ${columns} FROM tenant_listing_notes
            WHERE tenant_id = $1 AND listing_id = $2 FOR UPDATE`,
          values: [tenantId, listingId]
        },
        mapListingNote
      );
    },

    upsert(executor, tenantId, listingId, note) {
      return queryExactlyOne<ListingNoteRow, ListingNote>(
        executor,
        {
          text: `INSERT INTO tenant_listing_notes (tenant_id, listing_id, note)
            VALUES ($1, $2, $3)
            ON CONFLICT (tenant_id, listing_id) DO UPDATE
            SET note = EXCLUDED.note, updated_at = CURRENT_TIMESTAMP
            RETURNING ${columns}`,
          values: [tenantId, listingId, note]
        },
        mapListingNote
      );
    },

    async remove(executor, tenantId, listingId) {
      await executeCommand(executor, {
        text: "DELETE FROM tenant_listing_notes WHERE tenant_id = $1 AND listing_id = $2",
        values: [tenantId, listingId]
      });
    }
  });
}
