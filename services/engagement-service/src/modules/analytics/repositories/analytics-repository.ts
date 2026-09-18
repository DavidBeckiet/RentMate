import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryExactlyOne,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";
import type { AnalyticsEventType } from "../validations/analytics-validation.js";

export interface AnalyticsDailyPoint {
  readonly date: string;
  readonly inquiries: number;
  readonly firstResponses: number;
}

export interface AnalyticsListingRank {
  readonly listingId: number;
  readonly inquiries: number;
  readonly views: number;
  readonly favorites: number;
  readonly callClicks: number;
  readonly emailClicks: number;
}

export interface AnalyticsPreviousPeriod {
  readonly sinceAt: string;
  readonly untilAt: string;
  readonly inquiries: number;
  readonly views: number;
  readonly favorites: number;
  readonly callClicks: number;
  readonly emailClicks: number;
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
  readonly views: number;
  readonly favorites: number;
  readonly callClicks: number;
  readonly emailClicks: number;
  readonly previousPeriod: AnalyticsPreviousPeriod;
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
  views: unknown;
  favorites: unknown;
  call_clicks: unknown;
  email_clicks: unknown;
  previous_since_at: unknown;
  previous_until_at: unknown;
  previous_inquiries: unknown;
  previous_views: unknown;
  previous_favorites: unknown;
  previous_call_clicks: unknown;
  previous_email_clicks: unknown;
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
        inquiries: nonnegativeInteger(item.inquiries, `analytics.topListings[${index}].inquiries`),
        views: nonnegativeInteger(item.views, `analytics.topListings[${index}].views`),
        favorites: nonnegativeInteger(item.favorites, `analytics.topListings[${index}].favorites`),
        callClicks: nonnegativeInteger(item.callClicks, `analytics.topListings[${index}].callClicks`),
        emailClicks: nonnegativeInteger(item.emailClicks, `analytics.topListings[${index}].emailClicks`)
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
    views: nonnegativeInteger(row.views, "analytics.views"),
    favorites: nonnegativeInteger(row.favorites, "analytics.favorites"),
    callClicks: nonnegativeInteger(row.call_clicks, "analytics.callClicks"),
    emailClicks: nonnegativeInteger(row.email_clicks, "analytics.emailClicks"),
    previousPeriod: Object.freeze({
      sinceAt: timestamp(row.previous_since_at, "analytics.previousPeriod.sinceAt"),
      untilAt: timestamp(row.previous_until_at, "analytics.previousPeriod.untilAt"),
      inquiries: nonnegativeInteger(row.previous_inquiries, "analytics.previousPeriod.inquiries"),
      views: nonnegativeInteger(row.previous_views, "analytics.previousPeriod.views"),
      favorites: nonnegativeInteger(row.previous_favorites, "analytics.previousPeriod.favorites"),
      callClicks: nonnegativeInteger(row.previous_call_clicks, "analytics.previousPeriod.callClicks"),
      emailClicks: nonnegativeInteger(row.previous_email_clicks, "analytics.previousPeriod.emailClicks")
    }),
    daily: mapDaily(row.daily),
    topListings: mapTopListings(row.top_listings)
  });
}

export interface AnalyticsRepository {
  readonly recordEvent: (
    executor: SqlExecutor,
    input: {
      readonly listingId: number;
      readonly landlordId: number;
      readonly actorId: number | null;
      readonly eventType: AnalyticsEventType;
    }
  ) => Promise<void>;
  readonly load: (executor: SqlExecutor, landlordId: number, days: 7 | 30 | 90) => Promise<LandlordAnalyticsSnapshot>;
}

export function createAnalyticsRepository(): AnalyticsRepository {
  const repository: AnalyticsRepository = {
    async recordEvent(executor, input) {
      await executeCommand(executor, {
        text: `
          INSERT INTO listing_analytics_events (listing_id, landlord_id, actor_id, event_type)
          VALUES ($1, $2, $3, $4)
        `,
        values: [input.listingId, input.landlordId, input.actorId, input.eventType]
      });
    },
    load(executor, landlordId, days) {
      return queryExactlyOne<AnalyticsRow, LandlordAnalyticsSnapshot>(
        executor,
        {
          text: `WITH analytics_clock AS (
              SELECT CURRENT_TIMESTAMP AS measured_at,
                ((date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')
                  - make_interval(days => $2::integer - 1)) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS since_at
            ),
            params AS (
              SELECT measured_at, since_at,
                since_at - make_interval(days => $2::integer) AS previous_since_at
              FROM analytics_clock
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
            period_events AS MATERIALIZED (
              SELECT listing_id, event_type, created_at
              FROM listing_analytics_events
              WHERE landlord_id = $1
                AND created_at >= (SELECT since_at FROM params)
                AND created_at <= (SELECT measured_at FROM params)
            ),
            previous_inquiries AS MATERIALIZED (
              SELECT i.id
              FROM listing_inquiries AS i CROSS JOIN params AS p
              WHERE i.landlord_id = $1
                AND i.created_at >= p.previous_since_at
                AND i.created_at < p.since_at
            ),
            previous_events AS MATERIALIZED (
              SELECT event_type
              FROM listing_analytics_events CROSS JOIN params AS p
              WHERE landlord_id = $1
                AND created_at >= p.previous_since_at
                AND created_at < p.since_at
            ),
            daily_rows AS (
              SELECT to_char(day_value, 'YYYY-MM-DD') AS date,
                (SELECT count(*)::integer FROM period_inquiries AS pi
                  WHERE (pi.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = day_value::date) AS inquiries,
                (SELECT count(*)::integer FROM first_replies AS fr
                  WHERE fr.first_reply_at IS NOT NULL
                    AND (fr.first_reply_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = day_value::date) AS first_responses
              FROM params AS p,
                generate_series(
                  (p.since_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
                  (p.measured_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
                  interval '1 day'
                ) AS day_value
              ORDER BY day_value ASC
            ),
            event_totals AS (
              SELECT
                count(*) FILTER (WHERE event_type = 'VIEW')::integer AS views,
                count(*) FILTER (WHERE event_type = 'FAVORITE')::integer AS favorites,
                count(*) FILTER (WHERE event_type = 'CALL_CLICK')::integer AS call_clicks,
                count(*) FILTER (WHERE event_type = 'EMAIL_CLICK')::integer AS email_clicks
              FROM period_events
            ),
            previous_totals AS (
              SELECT
                (SELECT count(*)::integer FROM previous_inquiries) AS inquiries,
                count(*) FILTER (WHERE event_type = 'VIEW')::integer AS views,
                count(*) FILTER (WHERE event_type = 'FAVORITE')::integer AS favorites,
                count(*) FILTER (WHERE event_type = 'CALL_CLICK')::integer AS call_clicks,
                count(*) FILTER (WHERE event_type = 'EMAIL_CLICK')::integer AS email_clicks
              FROM previous_events
            ),
            listing_activity AS (
              SELECT listing_id,
                count(*)::integer AS inquiries,
                0::integer AS views,
                0::integer AS favorites,
                0::integer AS call_clicks,
                0::integer AS email_clicks
              FROM period_inquiries
              GROUP BY listing_id
              UNION ALL
              SELECT listing_id,
                0::integer AS inquiries,
                count(*) FILTER (WHERE event_type = 'VIEW')::integer AS views,
                count(*) FILTER (WHERE event_type = 'FAVORITE')::integer AS favorites,
                count(*) FILTER (WHERE event_type = 'CALL_CLICK')::integer AS call_clicks,
                count(*) FILTER (WHERE event_type = 'EMAIL_CLICK')::integer AS email_clicks
              FROM period_events
              GROUP BY listing_id
            ),
            top_listing_rows AS (
              SELECT listing_id,
                sum(inquiries)::integer AS inquiries,
                sum(views)::integer AS views,
                sum(favorites)::integer AS favorites,
                sum(call_clicks)::integer AS call_clicks,
                sum(email_clicks)::integer AS email_clicks
              FROM listing_activity
              GROUP BY listing_id
              ORDER BY sum(inquiries) DESC,
                (sum(call_clicks) + sum(email_clicks)) DESC,
                sum(favorites) DESC,
                sum(views) DESC,
                listing_id ASC
              LIMIT 5
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
              (SELECT views FROM event_totals) AS views,
              (SELECT favorites FROM event_totals) AS favorites,
              (SELECT call_clicks FROM event_totals) AS call_clicks,
              (SELECT email_clicks FROM event_totals) AS email_clicks,
              p.previous_since_at,
              p.since_at AS previous_until_at,
              (SELECT inquiries FROM previous_totals) AS previous_inquiries,
              (SELECT views FROM previous_totals) AS previous_views,
              (SELECT favorites FROM previous_totals) AS previous_favorites,
              (SELECT call_clicks FROM previous_totals) AS previous_call_clicks,
              (SELECT email_clicks FROM previous_totals) AS previous_email_clicks,
              (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'date', date, 'inquiries', inquiries, 'firstResponses', first_responses
              ) ORDER BY date), '[]'::jsonb) FROM daily_rows) AS daily,
              (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'listingId', listing_id,
                'inquiries', inquiries,
                'views', views,
                'favorites', favorites,
                'callClicks', call_clicks,
                'emailClicks', email_clicks
              ) ORDER BY inquiries DESC, (call_clicks + email_clicks) DESC, favorites DESC, views DESC,
                listing_id ASC), '[]'::jsonb)
                FROM top_listing_rows) AS top_listings
            FROM params AS p
            LEFT JOIN period_inquiries AS pi ON TRUE
            LEFT JOIN first_replies AS fr ON fr.inquiry_id = pi.id
            GROUP BY p.since_at, p.previous_since_at, p.measured_at`,
          values: [landlordId, days]
        },
        mapSnapshot
      );
    }
  };
  return Object.freeze(repository);
}
