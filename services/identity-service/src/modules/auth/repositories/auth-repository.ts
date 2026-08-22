import type { QueryResultRow } from "pg";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { queryExactlyOne, queryOptional } from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { UserRole } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import { mapUserProfileRow, type UserProfile, type UserProfileRow } from "../../users/user-profile.js";

export interface CreateUserRecord {
  readonly role: "TENANT" | "LANDLORD";
  readonly email: string;
  readonly phone: string | null;
  readonly passwordHash: string;
}

export interface AuthRepository {
  createUser(input: CreateUserRecord): Promise<UserProfile>;
}

export interface LoginAccount {
  readonly id: number;
  readonly role: UserRole;
  readonly email: string;
  readonly phone: string | null;
  readonly passwordHash: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface LoginAuthRepository {
  findLoginAccount(email: string): Promise<LoginAccount | null>;
}

export interface LoginAccountRow extends UserProfileRow, QueryResultRow {
  readonly password_hash: string;
}

export class LoginAccountMappingError extends Error {
  constructor() {
    super("Login account row is invalid.");
    this.name = "LoginAccountMappingError";
  }
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

export function mapLoginAccountRow(row: Readonly<LoginAccountRow>): LoginAccount {
  if (typeof row.password_hash !== "string" || row.password_hash.length === 0) {
    throw new LoginAccountMappingError();
  }

  const user = mapUserProfileRow(row);
  return Object.freeze({
    ...user,
    passwordHash: row.password_hash
  });
}

export function createAuthRepository(executor: SqlExecutor): AuthRepository & LoginAuthRepository {
  return Object.freeze({
    async createUser(input: CreateUserRecord): Promise<UserProfile> {
      try {
        return await queryExactlyOne<UserProfileRow, UserProfile>(
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
          mapUserProfileRow
        );
      } catch (error) {
        if (isEmailUniqueViolation(error)) {
          throw new RegistrationEmailAlreadyExistsError();
        }

        throw error;
      }
    },

    async findLoginAccount(email: string): Promise<LoginAccount | null> {
      return queryOptional<LoginAccountRow, LoginAccount>(
        executor,
        {
          text: `
            SELECT
              id,
              role,
              email,
              phone_e164,
              password_hash,
              is_active,
              created_at,
              updated_at
            FROM users
            WHERE email = $1
            LIMIT 1
          `,
          values: [email]
        },
        mapLoginAccountRow
      );
    }
  });
}
