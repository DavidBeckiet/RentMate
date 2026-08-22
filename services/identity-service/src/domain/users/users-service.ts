import { ApplicationError } from "../../../../shared/src/runtime/shared/errors/application-error.js";
import { authenticationRequiredMessage } from "../../../../shared/src/runtime/shared/middleware/authentication.js";
import type { AuthenticatedPrincipal } from "../../../../shared/src/runtime/shared/types/authentication.js";
import { validationDetail } from "../../../../shared/src/runtime/shared/validation/issues.js";
import type { UpdateCurrentUserInput } from "./user-validation.js";
import type { UserProfile } from "./user-profile.js";
import type { UsersRepository } from "./users-repository.js";

export interface UsersService {
  readonly getCurrentUser: (principal: AuthenticatedPrincipal) => Promise<UserProfile>;
  readonly updateCurrentUserPhone: (
    principal: AuthenticatedPrincipal,
    input: UpdateCurrentUserInput
  ) => Promise<UserProfile>;
}

function authenticationRequired(): ApplicationError {
  return new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
}

function landlordPhoneRequired(): ApplicationError {
  return new ApplicationError("VALIDATION_FAILED", "The request contains invalid data.", {
    details: [validationDetail("phone", "INVALID_VALUE", "phone is required for landlords.")]
  });
}

export function createUsersService(repository: UsersRepository): UsersService {
  const getCurrentUser = async (principal: AuthenticatedPrincipal): Promise<UserProfile> => {
    const profile = await repository.findProfileById(principal.userId);
    if (!profile) {
      throw authenticationRequired();
    }

    return profile;
  };

  return Object.freeze({
    getCurrentUser,

    async updateCurrentUserPhone(
      principal: AuthenticatedPrincipal,
      input: UpdateCurrentUserInput
    ): Promise<UserProfile> {
      if (principal.role === "LANDLORD" && input.phoneProvided && input.phone === null) {
        throw landlordPhoneRequired();
      }

      if (!input.phoneProvided) {
        return getCurrentUser(principal);
      }

      const profile = await repository.updatePhone(principal.userId, input.phone);
      if (!profile) {
        throw authenticationRequired();
      }

      return profile;
    }
  });
}
