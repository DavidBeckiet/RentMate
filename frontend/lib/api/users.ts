import type {
  ContactVerificationStatus,
  CreateVerificationBody,
  LandlordVerification,
  TenantContactVerificationStatus,
  UpdateCurrentUserBody,
  UserProfile
} from "../../types/api";
import type { ApiTransport } from "./transport";

export function createUsersApi(transport: ApiTransport) {
  return {
    getCurrent: (signal?: AbortSignal): Promise<UserProfile> => transport.object("/api/v1/users/me", { signal }),

    updateCurrent: (body: UpdateCurrentUserBody, signal?: AbortSignal): Promise<UserProfile> =>
      transport.object("/api/v1/users/me", { method: "PATCH", json: body, signal }),

    getCurrentVerification: (signal?: AbortSignal): Promise<LandlordVerification | null> =>
      transport.object("/api/v1/landlord/verifications/current", { signal }),

    getContactVerificationStatus: (signal?: AbortSignal): Promise<ContactVerificationStatus> =>
      transport.object("/api/v1/landlord/verifications/status", { signal }),

    requestEmailVerification: (signal?: AbortSignal): Promise<ContactVerificationStatus> =>
      transport.object("/api/v1/landlord/verifications/email/request", { method: "POST", json: {}, signal }),

    confirmEmailVerification: (code: string, signal?: AbortSignal): Promise<ContactVerificationStatus> =>
      transport.object("/api/v1/landlord/verifications/email/confirm", {
        method: "POST",
        json: { code },
        signal
      }),

    requestPhoneVerification: (signal?: AbortSignal): Promise<ContactVerificationStatus> =>
      transport.object("/api/v1/landlord/verifications/phone/request", { method: "POST", json: {}, signal }),

    confirmPhoneVerification: (code: string, signal?: AbortSignal): Promise<ContactVerificationStatus> =>
      transport.object("/api/v1/landlord/verifications/phone/confirm", {
        method: "POST",
        json: { code },
        signal
      }),

    getTenantContactVerificationStatus: (signal?: AbortSignal): Promise<TenantContactVerificationStatus> =>
      transport.object("/api/v1/tenant/verifications/status", { signal }),

    requestTenantEmailVerification: (signal?: AbortSignal): Promise<TenantContactVerificationStatus> =>
      transport.object("/api/v1/tenant/verifications/email/request", { method: "POST", json: {}, signal }),

    confirmTenantEmailVerification: (code: string, signal?: AbortSignal): Promise<TenantContactVerificationStatus> =>
      transport.object("/api/v1/tenant/verifications/email/confirm", {
        method: "POST",
        json: { code },
        signal
      }),

    requestTenantPhoneVerification: (signal?: AbortSignal): Promise<TenantContactVerificationStatus> =>
      transport.object("/api/v1/tenant/verifications/phone/request", { method: "POST", json: {}, signal }),

    confirmTenantPhoneVerification: (code: string, signal?: AbortSignal): Promise<TenantContactVerificationStatus> =>
      transport.object("/api/v1/tenant/verifications/phone/confirm", {
        method: "POST",
        json: { code },
        signal
      }),

    submitVerification: (body: CreateVerificationBody, signal?: AbortSignal): Promise<LandlordVerification> =>
      transport.object("/api/v1/landlord/verifications", { method: "POST", json: body, signal })
  } as const;
}
