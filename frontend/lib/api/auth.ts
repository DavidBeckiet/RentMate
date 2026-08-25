import type {
  LandlordRegistrationBody,
  GoogleAuthStartBody,
  GoogleAuthStartResponse,
  GoogleLandlordCompletionBody,
  LoginBody,
  PasswordResetConfirmationBody,
  PasswordResetRequestBody,
  PasswordResetRequestReceipt,
  TenantRegistrationBody,
  UserProfile
} from "../../types/api";
import type { ApiTransport } from "./transport";

export function createAuthApi(transport: ApiTransport) {
  return {
    registerTenant: (body: TenantRegistrationBody, signal?: AbortSignal): Promise<UserProfile> =>
      transport.object("/api/v1/auth/register/tenant", { method: "POST", json: body, signal }),

    registerLandlord: (body: LandlordRegistrationBody, signal?: AbortSignal): Promise<UserProfile> =>
      transport.object("/api/v1/auth/register/landlord", { method: "POST", json: body, signal }),

    login: (body: LoginBody, signal?: AbortSignal): Promise<UserProfile> =>
      transport.object("/api/v1/auth/login", { method: "POST", json: body, signal }),

    startGoogle: (body: GoogleAuthStartBody, signal?: AbortSignal): Promise<GoogleAuthStartResponse> =>
      transport.object("/api/v1/auth/google/start", { method: "POST", json: body, signal }),

    completeGoogleLandlord: (body: GoogleLandlordCompletionBody, signal?: AbortSignal): Promise<UserProfile> =>
      transport.object("/api/v1/auth/google/complete-landlord", { method: "POST", json: body, signal }),

    requestPasswordReset: (
      body: PasswordResetRequestBody,
      signal?: AbortSignal
    ): Promise<PasswordResetRequestReceipt> =>
      transport.object("/api/v1/auth/password-reset/request", { method: "POST", json: body, signal }),

    confirmPasswordReset: (body: PasswordResetConfirmationBody, signal?: AbortSignal): Promise<void> =>
      transport.void("/api/v1/auth/password-reset/confirm", { method: "POST", json: body, signal }),

    logout: (signal?: AbortSignal): Promise<void> => transport.void("/api/v1/auth/logout", { method: "POST", signal })
  } as const;
}
