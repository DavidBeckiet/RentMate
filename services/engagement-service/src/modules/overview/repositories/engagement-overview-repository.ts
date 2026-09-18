import type { QueryResultRow } from "pg";
import {
  queryExactlyOne,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";

export interface EngagementOverview {
  readonly support: { readonly open: number; readonly inProgress: number };
  readonly reviews: { readonly pending: number };
  readonly contactReports: { readonly open: number; readonly investigating: number };
  readonly roommateReports: { readonly open: number; readonly investigating: number };
  readonly reviewReports: { readonly open: number; readonly investigating: number };
  readonly capturedAt: string;
}

interface OverviewRow extends QueryResultRow {
  readonly support_open_count: unknown;
  readonly support_in_progress_count: unknown;
  readonly pending_review_count: unknown;
  readonly contact_open_count: unknown;
  readonly contact_investigating_count: unknown;
  readonly roommate_open_count: unknown;
  readonly roommate_investigating_count: unknown;
  readonly review_report_open_count: unknown;
  readonly review_report_investigating_count: unknown;
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

function mapOverview(row: Readonly<OverviewRow>): EngagementOverview {
  return Object.freeze({
    support: Object.freeze({
      open: count(row.support_open_count, "overview.support.open"),
      inProgress: count(row.support_in_progress_count, "overview.support.inProgress")
    }),
    reviews: Object.freeze({ pending: count(row.pending_review_count, "overview.reviews.pending") }),
    contactReports: Object.freeze({
      open: count(row.contact_open_count, "overview.contactReports.open"),
      investigating: count(row.contact_investigating_count, "overview.contactReports.investigating")
    }),
    roommateReports: Object.freeze({
      open: count(row.roommate_open_count, "overview.roommateReports.open"),
      investigating: count(row.roommate_investigating_count, "overview.roommateReports.investigating")
    }),
    reviewReports: Object.freeze({
      open: count(row.review_report_open_count, "overview.reviewReports.open"),
      investigating: count(row.review_report_investigating_count, "overview.reviewReports.investigating")
    }),
    capturedAt: timestamp(row.captured_at)
  });
}

export interface EngagementOverviewRepository {
  readonly read: () => Promise<EngagementOverview>;
}

export function createEngagementOverviewRepository(executor: SqlExecutor): EngagementOverviewRepository {
  return Object.freeze({
    read: () =>
      queryExactlyOne<OverviewRow, EngagementOverview>(
        executor,
        {
          text: `
          SELECT
            (SELECT COUNT(*) FILTER (WHERE status = 'OPEN')::integer FROM support_requests) AS support_open_count,
            (SELECT COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::integer FROM support_requests) AS support_in_progress_count,
            (SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::integer FROM listing_reviews) AS pending_review_count,
            (SELECT COUNT(*) FILTER (WHERE source = 'CONTACT_INQUIRY' AND status = 'OPEN')::integer FROM contact_reports) AS contact_open_count,
            (SELECT COUNT(*) FILTER (WHERE source = 'CONTACT_INQUIRY' AND status = 'INVESTIGATING')::integer FROM contact_reports) AS contact_investigating_count,
            (SELECT COUNT(*) FILTER (WHERE source = 'ROOMMATE' AND status = 'OPEN')::integer FROM contact_reports) AS roommate_open_count,
            (SELECT COUNT(*) FILTER (WHERE source = 'ROOMMATE' AND status = 'INVESTIGATING')::integer FROM contact_reports) AS roommate_investigating_count,
            (SELECT COUNT(*) FILTER (WHERE status = 'OPEN')::integer FROM review_reports) AS review_report_open_count,
            (SELECT COUNT(*) FILTER (WHERE status = 'INVESTIGATING')::integer FROM review_reports) AS review_report_investigating_count,
            CURRENT_TIMESTAMP AS captured_at
        `,
          values: []
        },
        mapOverview
      )
  });
}
