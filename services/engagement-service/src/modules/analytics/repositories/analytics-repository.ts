import type { QueryResultRow } from "pg";
import {
  queryExactlyOne,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";

export interface AnalyticsDailyPoint {
  readonly date: string;
  readonly inquiries: number;
  readonly firstResponses: number;
}

export interface AnalyticsListingRank {
  readonly listingId: number;
  readonly inquiries: number;
}

export interface LandlordAnalyticsSnapshot {
  readonly sinceAt: string;
  readonly measuredAt: string;
  readonly inquiries: number;
  readonly uniqueTenants: number;
  readonly respondedInquiries: number;
  readonly respondedWithin24Hours: number;
  readonly averageFirstResponseMinutes: number | null;
  readonly closedInquiries: number;
  readonly needsReplyNow: number;
  readonly daily: readonly AnalyticsDailyPoint[];
  readonly topListings: readonly AnalyticsListingRank[];
}

interface AnalyticsRow extends QueryResultRow {
  since_at: unknown;
  measured_at: unknown;
  inquiries: unknown;
  unique_tenants: unknown;
  responded_inquiries: unknown;
  responded_within_24_hours: unknown;
  average_first_response_minutes: unknown;
  closed_inquiries: unknown;
  needs_reply_now: unknown;
  daily: unknown;
  top_listings: unknown;
}

function nonnegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return value as number;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = nonnegativeInteger(value, field);
  if (parsed < 1) throw new RepositoryInvariantError(`${field} is invalid.`);
  return parsed;
}

function timestamp(value: unknown, field: string): string {
  try {
    return formatApiTimestamp(value instanceof Date ? value : new Date(String(value)));
  } catch {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
}

function mapDaily(value: unknown): readonly AnalyticsDailyPoint[] {
  if (!Array.isArray(value)) throw new RepositoryInvariantError("analytics.daily is invalid.");
  return Object.freeze(
    value.map((point, index) => {
      if (typeof point !== "object" || point === null) {
        throw new RepositoryInvariantError(`analytics.daily[${index}] is invalid.`);
      }
      const item = point as Record<string, unknown>;
      if (typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
        throw new RepositoryInvariantError(`analytics.daily[${index}].date is invalid.`);
      }
      return Object.freeze({
        date: item.date,
        inquiries: nonnegativeInteger(item.inquiries, `analytics.daily[${index}].inquiries`),
        firstResponses: nonnegativeInteger(item.firstResponses, `analytics.daily[${index}].firstResponses`)
      });
    })
  );
}

function mapTopListings(value: unknown): readonly AnalyticsListingRank[] {
  if (!Array.isArray(value)) throw new RepositoryInvariantError("analytics.topListings is invalid.");
  return Object.freeze(
    value.map((rank, index) => {
      if (typeof rank !== "object" || rank === null) {
        throw new RepositoryInvariantError(`analytics.topListings[${index}] is invalid.`);
      }
      const item = rank as Record<string, unknown>;
      return Object.freeze({
        listingId: positiveInteger(item.listingId, `analytics.topListings[${index}].listingId`),
        inquiries: nonnegativeInteger(item.inquiries, `analytics.topListings[${index}].inquiries`)
      });
    })
  );
}

function mapSnapshot(row: Readonly<AnalyticsRow>): LandlordAnalyticsSnapshot {
  return Object.freeze({
    sinceAt: timestamp(row.since_at, "analytics.sinceAt"),
    measuredAt: timestamp(row.measured_at, "analytics.measuredAt"),
    inquiries: nonnegativeInteger(row.inquiries, "analytics.inquiries"),
    uniqueTenants: nonnegativeInteger(row.unique_tenants, "analytics.uniqueTenants"),
    respondedInquiries: nonnegativeInteger(row.responded_inquiries, "analytics.respondedInquiries"),
    respondedWithin24Hours: nonnegativeInteger(row.responded_within_24_hours, "analytics.respondedWithin24Hours"),
    averageFirstResponseMinutes:
      row.average_first_response_minutes === null
        ? null
        : nonnegativeInteger(row.average_first_response_minutes, "analytics.averageFirstResponseMinutes"),
    closedInquiries: nonnegativeInteger(row.closed_inquiries, "analytics.closedInquiries"),
    needsReplyNow: nonnegativeInteger(row.needs_reply_now, "analytics.needsReplyNow"),
    daily: mapDaily(row.daily),
    topListings: mapTopListings(row.top_listings)
  });
}

export interface AnalyticsRepository {
  readonly load: (executor: SqlExecutor, landlordId: number, days: 7 | 30 | 90) => Promise<LandlordAnalyticsSnapshot>;
}

export function createAnalyticsRepository(): AnalyticsRepository {
  const repository: AnalyticsRepository = {
    load(executor, landlordId, days) {
      return queryExactlyOne<AnalyticsRow, LandlordAnalyticsSnapshot>(
        executor,
        {
          text: `WITH params AS (
              SELECT CURRENT_TIMESTAMP AS measured_at,
                ((date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
                  - make_interval(days => $2::integer - 1)) AT TIME ZONE 'UTC') AS since_at
            ),
            period_inquiries AS MATERIALIZED (
              SELECT i.id, i.tenant_id, i.listing_id, i.status, i.created_at
              FROM listing_inquiries AS i CROSS JOIN params AS p
              WHERE i.landlord_id = $1 AND i.created_at >= p.since_at AND i.created_at <= p.measured_at
            ),
            first_replies AS MATERIALIZED (
              SELECT pi.id AS inquiry_id, min(m.created_at) AS first_reply_at
              FROM period_inquiries AS pi
              LEFT JOIN inquiry_messages AS m
                ON m.inquiry_id = pi.id AND m.sender_role = 'LANDLORD'
                AND m.created_at <= (SELECT measured_at FROM params)
              GROUP BY pi.id
            ),
            daily_rows AS (
              SELECT to_char(day_value, 'YYYY-MM-DD') AS date,
                (SELECT count(*)::integer FROM period_inquiries AS pi
                  WHERE (pi.created_at AT TIME ZONE 'UTC')::date = day_value::date) AS inquiries,
                (SELECT count(*)::integer FROM first_replies AS fr
                  WHERE fr.first_reply_at IS NOT NULL
                    AND (fr.first_reply_at AT TIME ZONE 'UTC')::date = day_value::date) AS first_responses
              FROM params AS p,
                generate_series(
                  (p.since_at AT TIME ZONE 'UTC')::date,
                  (p.measured_at AT TIME ZONE 'UTC')::date,
                  interval '1 day'
                ) AS day_value
              ORDER BY day_value ASC
            ),
            top_listing_rows AS (
              SELECT listing_id, count(*)::integer AS inquiries
              FROM period_inquiries GROUP BY listing_id
              ORDER BY inquiries DESC, listing_id ASC LIMIT 5
            ),
            current_needs_reply AS (
              SELECT count(*)::integer AS value
              FROM listing_inquiries AS i
              LEFT JOIN LATERAL (
                SELECT sender_role FROM inquiry_messages
                WHERE inquiry_id = i.id ORDER BY created_at DESC, id DESC LIMIT 1
              ) AS latest ON TRUE
              WHERE i.landlord_id = $1 AND i.status <> 'CLOSED' AND latest.sender_role = 'TENANT'
            )
            SELECT p.since_at, p.measured_at,
              count(pi.id)::integer AS inquiries,
              count(DISTINCT pi.tenant_id)::integer AS unique_tenants,
              count(fr.first_reply_at)::integer AS responded_inquiries,
              count(*) FILTER (
                WHERE fr.first_reply_at IS NOT NULL
                  AND fr.first_reply_at <= pi.created_at + interval '24 hours'
              )::integer AS responded_within_24_hours,
              round(avg(extract(epoch FROM (fr.first_reply_at - pi.created_at)) / 60)
                FILTER (WHERE fr.first_reply_at IS NOT NULL))::integer AS average_first_response_minutes,
              count(*) FILTER (WHERE pi.status = 'CLOSED')::integer AS closed_inquiries,
              (SELECT value FROM current_needs_reply) AS needs_reply_now,
              (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'date', date, 'inquiries', inquiries, 'firstResponses', first_responses
              ) ORDER BY date), '[]'::jsonb) FROM daily_rows) AS daily,
              (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'listingId', listing_id, 'inquiries', inquiries
              ) ORDER BY inquiries DESC, listing_id ASC), '[]'::jsonb) FROM top_listing_rows) AS top_listings
            FROM params AS p
            LEFT JOIN period_inquiries AS pi ON TRUE
            LEFT JOIN first_replies AS fr ON fr.inquiry_id = pi.id
            GROUP BY p.since_at, p.measured_at`,
          values: [landlordId, days]
        },
        mapSnapshot
      );
    }
  };
  return Object.freeze(repository);
}
