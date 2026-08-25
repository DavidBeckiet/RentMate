import {
  readScalarQueryValue,
  validateBodyFields,
  validateQueryKeys
} from "../../../../../shared/src/runtime/shared/validation/request.js";
import { normalizeControlledCode } from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";

export const analyticsPeriods = ["7D", "30D", "90D"] as const;
export type AnalyticsPeriod = (typeof analyticsPeriods)[number];
export const analyticsEventTypes = ["VIEW", "FAVORITE", "CALL_CLICK", "EMAIL_CLICK"] as const;
export type AnalyticsEventType = (typeof analyticsEventTypes)[number];

export interface TrackAnalyticsEventInput {
  readonly eventType: AnalyticsEventType;
}

export interface AnalyticsQuery {
  readonly period: AnalyticsPeriod;
  readonly days: 7 | 30 | 90;
}

export function validateAnalyticsQuery(value: unknown): AnalyticsQuery {
  const query = validateQueryKeys(value, ["period"]);
  const period = normalizeControlledCode(
    readScalarQueryValue(query.period, "period") ?? "30D",
    "period",
    analyticsPeriods
  ) as AnalyticsPeriod;
  const days = period === "7D" ? 7 : period === "30D" ? 30 : 90;
  return Object.freeze({ period, days });
}

export function validateTrackAnalyticsEventBody(value: unknown): TrackAnalyticsEventInput {
  const body = validateBodyFields(value, ["eventType"]);
  if (!("eventType" in body)) throwValidationIssue("eventType", "REQUIRED", "eventType is required.");
  return Object.freeze({
    eventType: normalizeControlledCode(body.eventType, "eventType", analyticsEventTypes) as AnalyticsEventType
  });
}

export function parseAnalyticsListingId(value: string | string[]): number {
  return parsePathId(value as string, "listingId");
}
