import { ApplicationError } from "../../shared/errors/application-error.js";
import type { PasswordService } from "./password.js";
import { RegistrationEmailAlreadyExistsError, type AuthRepository, type CreateUserRecord } from "./auth-repository.js";
import type { RegistrationInput, RegistrationRole } from "./registration-validation.js";
import type { RegisteredUser } from "./user-profile.js";

export interface RegistrationService {
  register(role: RegistrationRole, input: RegistrationInput): Promise<RegisteredUser>;
}

export function createRegistrationService(dependencies: {
  readonly passwordService: PasswordService;
  readonly authRepository: AuthRepository;
}): RegistrationService {
  return Object.freeze({
    async register(role: RegistrationRole, input: RegistrationInput): Promise<RegisteredUser> {
      if (role !== "TENANT" && role !== "LANDLORD") {
        throw new Error("Registration role is invalid.");
      }

      const passwordHash = await dependencies.passwordService.hashPassword(input.password);
      const record: CreateUserRecord = {
        role,
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
