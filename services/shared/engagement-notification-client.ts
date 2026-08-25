export type ListingModerationNotificationEvent = "LISTING_APPROVED" | "LISTING_REJECTED" | "LISTING_HIDDEN";

export interface EngagementNotificationClientOptions {
  readonly baseUrl: string;
  readonly internalToken: string;
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface ListingModerationNotificationInput {
  readonly landlordId: number;
  readonly listingId: number;
  readonly moderationHistoryId: number;
  readonly eventType: ListingModerationNotificationEvent;
}

export interface ListingPublishedNotificationInput {
  readonly listingId: number;
}

export interface EngagementNotificationClient {
  readonly notifyListingModerationResult: (input: ListingModerationNotificationInput) => Promise<void>;
  readonly notifyListingPublished: (input: ListingPublishedNotificationInput) => Promise<void>;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function createEngagementNotificationClient(
  options: EngagementNotificationClientOptions
): EngagementNotificationClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetcher: typeof fetch = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 5_000;

  return Object.freeze({
    async notifyListingModerationResult(input: ListingModerationNotificationInput): Promise<void> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(`${baseUrl}/internal/v1/notifications/listing-moderation`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-rentmate-internal-token": options.internalToken
          },
          body: JSON.stringify(input),
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Engagement service notification request failed.");
      } catch {
        throw new Error("Engagement service notification request failed.");
      } finally {
        clearTimeout(timeout);
      }
    },

    async notifyListingPublished(input: ListingPublishedNotificationInput): Promise<void> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(`${baseUrl}/internal/v1/notifications/listing-published`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-rentmate-internal-token": options.internalToken
          },
          body: JSON.stringify(input),
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Engagement service saved search notification request failed.");
      } catch {
        throw new Error("Engagement service saved search notification request failed.");
      } finally {
        clearTimeout(timeout);
      }
    }
  });
}
