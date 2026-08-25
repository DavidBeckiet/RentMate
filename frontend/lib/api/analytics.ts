import type { AnalyticsEventType, AnalyticsPeriod, LandlordAnalytics } from "../../types/api";
import type { ApiTransport } from "./transport";

export function createAnalyticsApi(transport: ApiTransport) {
  return {
    getLandlord: (period: AnalyticsPeriod = "30D", signal?: AbortSignal): Promise<LandlordAnalytics> =>
      transport.object("/api/v1/landlord/analytics", { query: { period }, signal }),

    trackListingEvent: (listingId: number, eventType: AnalyticsEventType, signal?: AbortSignal): Promise<void> =>
      transport.void(`/api/v1/analytics/listings/${listingId}/events`, {
        method: "POST",
        json: { eventType },
        signal
      })
  } as const;
}
