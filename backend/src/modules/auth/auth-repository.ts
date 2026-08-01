import type { SqlExecutor } from "../../db/sql-executor.js";
import { queryExactlyOne } from "../../db/repository-primitives.js";
import type { UserRole } from "../../shared/types/authentication.js";
import { mapCreatedUserRow, type CreatedUserRow, type RegisteredUser } from "./user-profile.js";

export interface CreateUserRecord {
  readonly role: "TENANT" | "LANDLORD";
  readonly email: string;
  readonly phone: string | null;
  readonly passwordHash: string;
}

export interface AuthRepository {
  createUser(input: CreateUserRecord): Promise<RegisteredUser>;
}

export class RegistrationEmailAlreadyExistsError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "RegistrationEmailAlreadyExistsError";
  }
}

interface PostgresConstraintError {
  readonly code?: unknown;
  readonly constraint?: unknown;
}

function isEmailUniqueViolation(error: unknown): error is PostgresConstraintError {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as PostgresConstraintError;
  return candidate.code === "23505" && candidate.constraint === "uq_users_email";
}

export function createAuthRepository(executor: SqlExecutor): AuthRepository {
  return Object.freeze({
    async createUser(input: CreateUserRecord): Promise<RegisteredUser> {
      try {
        return await queryExactlyOne<CreatedUserRow, RegisteredUser>(
          executor,
          {
            text: `
              INSERT INTO users (
                role,
                email,
                phone_e164,
                password_hash
              )
              VALUES ($1, $2, $3, $4)
              RETURNING
                id,
                role,
                email,
                phone_e164,
                is_active,
                created_at,
                updated_at
            `,
            values: [input.role as UserRole, input.email, input.phone, input.passwordHash]
          },
          mapCreatedUserRow
        );
      } catch (error) {
        if (isEmailUniqueViolation(error)) {
          throw new RegistrationEmailAlreadyExistsError();
        }

        throw error;
      }
    }
  });
}
