import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import type { PasswordService } from "../password.js";
import {
  RegistrationEmailAlreadyExistsError,
  type AuthRepository,
  type CreateUserRecord
} from "../repositories/auth-repository.js";
import type { RegistrationInput, RegistrationRole } from "../validations/registration-validation.js";
import type { UserProfile } from "../../users/user-profile.js";

export interface RegistrationService {
  register(role: RegistrationRole, input: RegistrationInput): Promise<UserProfile>;
}

export function createRegistrationService(dependencies: {
  readonly passwordService: PasswordService;
  readonly authRepository: AuthRepository;
}): RegistrationService {
  return Object.freeze({
    async register(role: RegistrationRole, input: RegistrationInput): Promise<UserProfile> {
      if (role !== "TENANT" && role !== "LANDLORD") {
        throw new Error("Registration role is invalid.");
      }

      const passwordHash = await dependencies.passwordService.hashPassword(input.password);
      const record: CreateUserRecord = {
        role,
        displayName: input.displayName ?? null,
        email: input.email,
        phone: input.phone,
        passwordHash
      };

      try {
        return await dependencies.authRepository.createUser(record);
      } catch (error) {
        if (error instanceof RegistrationEmailAlreadyExistsError) {
          throw new ApplicationError("EMAIL_ALREADY_EXISTS", "An account with this email already exists.");
        }

        throw error;
      }
    }
  });
}
