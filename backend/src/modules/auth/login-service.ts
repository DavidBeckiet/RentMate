import { ApplicationError } from "../../shared/errors/application-error.js";
import type { LoginAccount } from "./auth-repository.js";
import type { LoginInput } from "./login-validation.js";
import type { UserProfile } from "../users/user-profile.js";

export const invalidCredentialsMessage = "The email or password is incorrect.";

export interface LoginService {
  login(input: LoginInput): Promise<UserProfile>;
}

export interface LoginServiceDependencies {
  readonly findLoginAccount: (email: string) => Promise<LoginAccount | null>;
  readonly verifyPassword: (password: string, passwordHash: string) => Promise<boolean>;
  readonly missingAccountPasswordHash: string;
}

function invalidCredentials(): ApplicationError {
  return new ApplicationError("INVALID_CREDENTIALS", invalidCredentialsMessage);
}

function withoutPasswordHash(account: LoginAccount): UserProfile {
  return Object.freeze({
    id: account.id,
    role: account.role,
    email: account.email,
    phone: account.phone,
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  });
}

export function createLoginService(dependencies: Readonly<LoginServiceDependencies>): LoginService {
  return Object.freeze({
    async login(input: LoginInput): Promise<UserProfile> {
      const account = await dependencies.findLoginAccount(input.email);

      if (!account) {
        await dependencies.verifyPassword(input.password, dependencies.missingAccountPasswordHash);
        throw invalidCredentials();
      }

      const passwordMatches = await dependencies.verifyPassword(input.password, account.passwordHash);
      if (!passwordMatches || !account.isActive) {
        throw invalidCredentials();
      }

      return withoutPasswordHash(account);
    }
  });
}
