import type { AnalyticsPeriod, LandlordAnalytics } from "../../types/api";
import type { ApiTransport } from "./transport";

export function createAnalyticsApi(transport: ApiTransport) {
  return {
    getLandlord: (period: AnalyticsPeriod = "30D", signal?: AbortSignal): Promise<LandlordAnalytics> =>
      transport.object("/api/v1/landlord/analytics", { query: { period }, signal })
  } as const;
}
