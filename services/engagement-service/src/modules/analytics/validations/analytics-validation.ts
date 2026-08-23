import { normalizeControlledCode } from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import {
  readScalarQueryValue,
  validateQueryKeys
} from "../../../../../shared/src/runtime/shared/validation/request.js";

export const analyticsPeriods = ["7D", "30D", "90D"] as const;
export type AnalyticsPeriod = (typeof analyticsPeriods)[number];

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
