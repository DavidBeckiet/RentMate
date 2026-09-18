import type { QueryResultRow } from "pg";
import {
  queryExactlyOne,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";

export interface ListingOverview {
  readonly listings: {
    readonly total: number;
    readonly byStatus: {
      readonly DRAFT: number;
      readonly PENDING: number;
      readonly APPROVED: number;
      readonly REJECTED: number;
      readonly HIDDEN: number;
      readonly INACTIVE: number;
    };
  };
  readonly listingReports: { readonly open: number; readonly investigating: number };
  readonly capturedAt: string;
}

interface OverviewRow extends QueryResultRow {
  readonly listing_total: unknown;
  readonly draft_count: unknown;
  readonly pending_count: unknown;
  readonly approved_count: unknown;
  readonly rejected_count: unknown;
  readonly hidden_count: unknown;
  readonly inactive_count: unknown;
  readonly open_report_count: unknown;
  readonly investigating_report_count: unknown;
  readonly captured_at: unknown;
}

function count(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new RepositoryInvariantError(`${field} is invalid.`);
  return value as number;
}

function timestamp(value: unknown): string {
  try {
    return formatApiTimestamp(value instanceof Date ? value : new Date(String(value)));
  } catch {
    throw new RepositoryInvariantError("overview.capturedAt is invalid.");
  }
}

function mapOverview(row: Readonly<OverviewRow>): ListingOverview {
  const total = count(row.listing_total, "overview.listings.total");
  const byStatus = Object.freeze({
    DRAFT: count(row.draft_count, "overview.listings.byStatus.DRAFT"),
    PENDING: count(row.pending_count, "overview.listings.byStatus.PENDING"),
    APPROVED: count(row.approved_count, "overview.listings.byStatus.APPROVED"),
    REJECTED: count(row.rejected_count, "overview.listings.byStatus.REJECTED"),
    HIDDEN: count(row.hidden_count, "overview.listings.byStatus.HIDDEN"),
    INACTIVE: count(row.inactive_count, "overview.listings.byStatus.INACTIVE")
  });
  if (total !== Object.values(byStatus).reduce((sum, value) => sum + value, 0)) {
    throw new RepositoryInvariantError("Listing overview count invariants are invalid.");
  }
  return Object.freeze({
    listings: Object.freeze({ total, byStatus }),
    listingReports: Object.freeze({
      open: count(row.open_report_count, "overview.listingReports.open"),
      investigating: count(row.investigating_report_count, "overview.listingReports.investigating")
    }),
    capturedAt: timestamp(row.captured_at)
  });
}

export interface ListingOverviewRepository {
  readonly read: () => Promise<ListingOverview>;
}

export function createListingOverviewRepository(executor: SqlExecutor): ListingOverviewRepository {
  return Object.freeze({
    read: () =>
      queryExactlyOne<OverviewRow, ListingOverview>(
        executor,
        {
          text: `
          SELECT
            (SELECT COUNT(*)::integer FROM listings) AS listing_total,
            (SELECT COUNT(*) FILTER (WHERE status = 'DRAFT')::integer FROM listings) AS draft_count,
            (SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::integer FROM listings) AS pending_count,
            (SELECT COUNT(*) FILTER (WHERE status = 'APPROVED')::integer FROM listings) AS approved_count,
            (SELECT COUNT(*) FILTER (WHERE status = 'REJECTED')::integer FROM listings) AS rejected_count,
            (SELECT COUNT(*) FILTER (WHERE status = 'HIDDEN')::integer FROM listings) AS hidden_count,
            (SELECT COUNT(*) FILTER (WHERE status = 'INACTIVE')::integer FROM listings) AS inactive_count,
            (SELECT COUNT(*) FILTER (WHERE status = 'OPEN')::integer FROM listing_reports) AS open_report_count,
            (SELECT COUNT(*) FILTER (WHERE status = 'INVESTIGATING')::integer FROM listing_reports) AS investigating_report_count,
            CURRENT_TIMESTAMP AS captured_at
        `,
          values: []
        },
        mapOverview
      )
  });
}
