import type { HealthResponse } from "../../types/api";
import { createAdminApi } from "./admin";
import { createAuthApi } from "./auth";
import { createFavoritesApi } from "./favorites";
import { createContactApi } from "./contact";
import { createListingsApi } from "./listings";
import { createLookupsApi } from "./lookups";
import { createTransport, type ApiTransport } from "./transport";
import { createUsersApi } from "./users";

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
    admin: createAdminApi(transport)
  } as const;
}

export const api = createApiClient();

export { ApiError } from "./transport";
