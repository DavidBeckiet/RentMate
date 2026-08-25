import { randomBytes } from "node:crypto";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import type { UserProfile } from "../../users/user-profile.js";
import type { PasswordService } from "../password.js";
import type { LoginAccount, LoginAuthRepository } from "../repositories/auth-repository.js";
import { GoogleIdentityConflictError, type GoogleAuthRepository } from "../repositories/google-auth-repository.js";
import type { GoogleProfile, GoogleOAuthClient, GoogleOAuthProviderError } from "../google-oauth-client.js";
import type { GoogleOAuthState } from "../google-oauth-state.js";
import type { GoogleOAuthOnboardingProfile } from "../google-oauth-onboarding.js";
import type { TransactionRunner } from "../../../shared/transaction.js";

export type GoogleAuthCompletion =
  | { readonly kind: "AUTHENTICATED"; readonly user: UserProfile }
  | { readonly kind: "LANDLORD_PROFILE_REQUIRED"; readonly profile: GoogleOAuthOnboardingProfile };

export interface GoogleAuthService {
  complete(input: Readonly<{ code: string; state: GoogleOAuthState }>): Promise<GoogleAuthCompletion>;
  completeLandlordRegistration(
    input: Readonly<{ profile: GoogleOAuthOnboardingProfile; phone: string }>
  ): Promise<UserProfile>;
}

function withoutPasswordHash(account: LoginAccount): UserProfile {
  return Object.freeze({
    id: account.id,
    role: account.role,
    displayName: account.displayName,
    email: account.email,
    phone: account.phone,
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  });
}

function isProviderError(error: unknown): error is GoogleOAuthProviderError {
  return error instanceof Error && error.name === "GoogleOAuthProviderError";
}

function providerApplicationError(cause?: unknown): ApplicationError {
  return new ApplicationError("GOOGLE_AUTH_FAILED", "Google authentication could not be completed.", { cause });
}

function invalidInactiveAccount(): ApplicationError {
  return new ApplicationError("INVALID_CREDENTIALS", "The Google account is not available.");
}

function existingGoogleAccount(): ApplicationError {
  return new ApplicationError("GOOGLE_ACCOUNT_EXISTS", "A RentMate account already exists for this Google account.");
}

function missingGoogleAccount(): ApplicationError {
  return new ApplicationError("GOOGLE_ACCOUNT_NOT_REGISTERED", "No RentMate account is linked to this Google account.");
}

function isUsableAccount(account: Readonly<{ isActive: boolean; role: string }>): boolean {
  return account.isActive && account.role !== "ADMIN";
}

export function createGoogleAuthService(
  dependencies: Readonly<{
    readonly client: GoogleOAuthClient;
    readonly repository: GoogleAuthRepository;
    readonly loginRepository: LoginAuthRepository;
    readonly passwordService: PasswordService;
    readonly transactionRunner: TransactionRunner;
  }>
): GoogleAuthService {
  return Object.freeze({
    async complete({
      code,
      state
    }: Readonly<{ code: string; state: GoogleOAuthState }>): Promise<GoogleAuthCompletion> {
      let googleProfile: GoogleProfile;
      try {
        googleProfile = await dependencies.client.exchangeCode(code, state.codeVerifier);
      } catch (error) {
        if (error instanceof ApplicationError && error.code === "GOOGLE_AUTH_FAILED") throw error;
        if (isProviderError(error)) throw providerApplicationError(error);
        throw providerApplicationError(error);
      }

      const linkedAccount = await dependencies.repository.findUserByProviderSubject(googleProfile.subject);
      if (linkedAccount) {
        if (!isUsableAccount(linkedAccount)) throw invalidInactiveAccount();
        if (state.intent === "REGISTER") throw existingGoogleAccount();
        return { kind: "AUTHENTICATED", user: linkedAccount };
      }

      const existingAccount = await dependencies.loginRepository.findLoginAccount(googleProfile.email);
      if (existingAccount) {
        if (!isUsableAccount(existingAccount)) throw invalidInactiveAccount();
        if (state.intent === "REGISTER") throw existingGoogleAccount();

        try {
          await dependencies.transactionRunner((executor) =>
            dependencies.repository.linkProviderSubject(executor, existingAccount.id, googleProfile.subject)
          );
        } catch (error) {
          if (error instanceof GoogleIdentityConflictError) throw providerApplicationError(error);
          throw error;
        }
        return { kind: "AUTHENTICATED", user: withoutPasswordHash(existingAccount) };
      }

      if (state.intent === "LOGIN") throw missingGoogleAccount();
      if (!state.role) throw providerApplicationError();

      if (state.role === "LANDLORD" && state.phone === null) {
        return {
          kind: "LANDLORD_PROFILE_REQUIRED",
          profile: Object.freeze({
            providerSubject: googleProfile.subject,
            email: googleProfile.email,
            displayName: googleProfile.displayName
          })
        };
      }

      const passwordHash = await dependencies.passwordService.hashPassword(randomBytes(32).toString("base64url"));
      try {
        const user = await dependencies.transactionRunner((executor) =>
          dependencies.repository.createUserAndLinkProvider(executor, {
            role: state.role!,
            displayName: googleProfile.displayName,
            email: googleProfile.email,
            phone: state.phone,
            passwordHash,
            providerSubject: googleProfile.subject
          })
        );
        return { kind: "AUTHENTICATED", user };
      } catch (error) {
        if (error instanceof GoogleIdentityConflictError) throw existingGoogleAccount();
        throw error;
      }
    },

    async completeLandlordRegistration({
      profile,
      phone
    }: Readonly<{ profile: GoogleOAuthOnboardingProfile; phone: string }>): Promise<UserProfile> {
      const passwordHash = await dependencies.passwordService.hashPassword(randomBytes(32).toString("base64url"));
      try {
        return await dependencies.transactionRunner((executor) =>
          dependencies.repository.createUserAndLinkProvider(executor, {
            role: "LANDLORD",
            displayName: profile.displayName,
            email: profile.email,
            phone,
            passwordHash,
            providerSubject: profile.providerSubject
          })
        );
      } catch (error) {
        if (error instanceof GoogleIdentityConflictError) throw existingGoogleAccount();
        throw error;
      }
    }
  });
}
