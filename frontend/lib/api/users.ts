import type { CreateVerificationBody, LandlordVerification, UpdateCurrentUserBody, UserProfile } from "../../types/api";
import type { ApiTransport } from "./transport";

export function createUsersApi(transport: ApiTransport) {
  return {
    getCurrent: (signal?: AbortSignal): Promise<UserProfile> => transport.object("/api/v1/users/me", { signal }),

    updateCurrent: (body: UpdateCurrentUserBody, signal?: AbortSignal): Promise<UserProfile> =>
      transport.object("/api/v1/users/me", { method: "PATCH", json: body, signal }),

    getCurrentVerification: (signal?: AbortSignal): Promise<LandlordVerification | null> =>
      transport.object("/api/v1/landlord/verifications/current", { signal }),

    submitVerification: (body: CreateVerificationBody, signal?: AbortSignal): Promise<LandlordVerification> =>
      transport.object("/api/v1/landlord/verifications", { method: "POST", json: body, signal })
  } as const;
}
