import type { HealthResponse } from "../../types/api";
import { createAdminApi } from "./admin";
import { createAuthApi } from "./auth";
import { createFavoritesApi } from "./favorites";
import { createContactApi } from "./contact";
import { createListingsApi } from "./listings";
import { createLookupsApi } from "./lookups";
import { createTransport, type ApiTransport } from "./transport";
import { createUsersApi } from "./users";
import { createSavedSearchApi } from "./saved-searches";
import { createLeadsApi } from "./leads";
import { createAnalyticsApi } from "./analytics";
import { createListingNotesApi } from "./listing-notes";
import { createReviewsApi } from "./reviews";

export function createApiClient(transport: ApiTransport = createTransport()) {
  return {
    health: {
      check: (signal?: AbortSignal): Promise<HealthResponse> => transport.raw("/api/health", { signal })
    },
    auth: createAuthApi(transport),
    users: createUsersApi(transport),
    lookups: createLookupsApi(transport),
    listings: createListingsApi(transport),
    favorites: createFavoritesApi(transport),
    contact: createContactApi(transport),
    savedSearches: createSavedSearchApi(transport),
    leads: createLeadsApi(transport),
    analytics: createAnalyticsApi(transport),
    listingNotes: createListingNotesApi(transport),
    reviews: createReviewsApi(transport),
    admin: createAdminApi(transport)
  } as const;
}

export const api = createApiClient();

export { ApiError } from "./transport";
