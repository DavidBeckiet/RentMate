import type { LandlordRegistrationBody, LoginBody, TenantRegistrationBody, UserProfile } from "../../../types/api";
import type { ApiTransport } from "./transport";

export function createAuthApi(transport: ApiTransport) {
  return {
    registerTenant: (body: TenantRegistrationBody, signal?: AbortSignal): Promise<UserProfile> =>
      transport.object("/api/v1/auth/register/tenant", { method: "POST", json: body, signal }),

    registerLandlord: (body: LandlordRegistrationBody, signal?: AbortSignal): Promise<UserProfile> =>
      transport.object("/api/v1/auth/register/landlord", { method: "POST", json: body, signal }),

    login: (body: LoginBody, signal?: AbortSignal): Promise<UserProfile> =>
      transport.object("/api/v1/auth/login", { method: "POST", json: body, signal }),

    logout: (signal?: AbortSignal): Promise<void> => transport.void("/api/v1/auth/logout", { method: "POST", signal })
  } as const;
}
