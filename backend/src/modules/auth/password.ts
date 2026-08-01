import { compare, getRounds, hash } from "bcrypt";
import { ApplicationError } from "../../shared/errors/application-error.js";
import { validatePasswordRepresentation } from "../../shared/validation/normalization.js";

const minimumBcryptCost = 4;
const maximumBcryptCost = 31;
const bcryptHashLength = 60;
const supportedBcryptPrefixes = ["$2a$", "$2b$", "$2y$"] as const;
const bcryptEncodedAlphabet = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const storedPasswordHashErrorMessage = "Stored password hash is invalid.";

export interface PasswordService {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, passwordHash: string): Promise<boolean>;
}

export class StoredPasswordHashError extends Error {
  constructor() {
    super(storedPasswordHashErrorMessage);
    this.name = "StoredPasswordHashError";
  }
}

function validateBcryptCost(bcryptCost: number): void {
  if (!Number.isInteger(bcryptCost) || bcryptCost < minimumBcryptCost || bcryptCost > maximumBcryptCost) {
    throw new Error("bcryptCost must be an integer between 4 and 31.");
  }
}

function isPasswordValidationFailure(error: unknown): boolean {
  return error instanceof ApplicationError && error.code === "VALIDATION_FAILED";
}

function assertReadablePasswordHash(passwordHash: string): void {
  try {
    const rounds = getRounds(passwordHash);
    const hasSupportedPrefix = supportedBcryptPrefixes.some((prefix) => passwordHash.startsWith(prefix));
    const hasCanonicalCost = passwordHash.slice(4, 6) === String(rounds).padStart(2, "0");
    const hasValidEncoding = [...passwordHash.slice(7)].every((character) => bcryptEncodedAlphabet.includes(character));

    if (
      passwordHash.length !== bcryptHashLength ||
      !hasSupportedPrefix ||
      passwordHash[6] !== "$" ||
      !hasCanonicalCost ||
      !hasValidEncoding ||
      !Number.isInteger(rounds) ||
      rounds < minimumBcryptCost ||
      rounds > maximumBcryptCost
    ) {
      throw new StoredPasswordHashError();
    }
  } catch (error) {
    if (error instanceof StoredPasswordHashError) {
      throw error;
    }

    throw new StoredPasswordHashError();
  }
}

export function createPasswordService(options: Readonly<{ bcryptCost: number }>): PasswordService {
  validateBcryptCost(options.bcryptCost);

  return Object.freeze({
    async hashPassword(password: string): Promise<string> {
      const validatedPassword = validatePasswordRepresentation(password);
      return hash(validatedPassword, options.bcryptCost);
    },

    async verifyPassword(password: string, passwordHash: string): Promise<boolean> {
      try {
        validatePasswordRepresentation(password);
      } catch (error) {
        if (isPasswordValidationFailure(error)) {
          return false;
        }

        throw error;
      }

      assertReadablePasswordHash(passwordHash);

      try {
        return await compare(password, passwordHash);
      } catch {
        throw new StoredPasswordHashError();
      }
    }
  });
}
