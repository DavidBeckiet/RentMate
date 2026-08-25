import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryExactlyOne,
  queryOptional
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { UserRole } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import { mapUserProfileRow, type UserProfile, type UserProfileRow } from "../../users/user-profile.js";

export interface CreateGoogleUserRecord {
  readonly role: "TENANT" | "LANDLORD";
  readonly displayName: string | null;
  readonly email: string;
  readonly phone: string | null;
  readonly passwordHash: string;
  readonly providerSubject: string;
}

export class GoogleIdentityConflictError extends Error {
  constructor() {
    super("The Google identity is already linked to another account.");
    this.name = "GoogleIdentityConflictError";
  }
}

interface GoogleIdentityUserRow extends UserProfileRow, QueryResultRow {}

interface PostgresConstraintError {
  readonly code?: unknown;
  readonly constraint?: unknown;
}

function isConstraint(error: unknown, constraint: string): error is PostgresConstraintError {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as PostgresConstraintError;
  return candidate.code === "23505" && candidate.constraint === constraint;
}

export interface GoogleAuthRepository {
  findUserByProviderSubject(providerSubject: string): Promise<UserProfile | null>;
  linkProviderSubject(executor: SqlExecutor, userId: number, providerSubject: string): Promise<void>;
  createUserAndLinkProvider(executor: SqlExecutor, input: CreateGoogleUserRecord): Promise<UserProfile>;
}

export function createGoogleAuthRepository(executor: SqlExecutor): GoogleAuthRepository {
  return Object.freeze({
    async findUserByProviderSubject(providerSubject: string) {
      return queryOptional<GoogleIdentityUserRow, UserProfile>(
        executor,
        {
          text: `
            SELECT
              u.id,
              u.role,
              u.display_name,
              u.email,
              u.phone_e164,
              u.is_active,
              u.created_at,
              u.updated_at
            FROM user_auth_identities AS identity
            INNER JOIN users AS u ON u.id = identity.user_id
            WHERE identity.provider = 'GOOGLE'
              AND identity.provider_subject = $1
            LIMIT 1
          `,
          values: [providerSubject]
        },
        mapUserProfileRow
      );
    },

    async linkProviderSubject(currentExecutor: SqlExecutor, userId: number, providerSubject: string) {
      try {
        await executeCommand(currentExecutor, {
          text: `
            INSERT INTO user_auth_identities (user_id, provider, provider_subject)
            VALUES ($1, 'GOOGLE', $2)
          `,
          values: [userId, providerSubject]
        });
      } catch (error) {
        if (isConstraint(error, "uq_user_auth_identities_provider_subject")) {
          throw new GoogleIdentityConflictError();
        }
        throw error;
      }
    },

    async createUserAndLinkProvider(currentExecutor: SqlExecutor, input: CreateGoogleUserRecord) {
      let user: UserProfile;
      try {
        user = await queryExactlyOne<UserProfileRow, UserProfile>(
          currentExecutor,
          {
            text: `
              INSERT INTO users (
                role,
                display_name,
                email,
                phone_e164,
                password_hash
              )
              VALUES ($1, $2, $3, $4, $5)
              RETURNING
                id,
                role,
                display_name,
                email,
                phone_e164,
                is_active,
                created_at,
                updated_at
            `,
            values: [input.role as UserRole, input.displayName, input.email, input.phone, input.passwordHash]
          },
          mapUserProfileRow
        );
      } catch (error) {
        if (isConstraint(error, "uq_users_email")) {
          throw new GoogleIdentityConflictError();
        }
        throw error;
      }

      try {
        await executeCommand(currentExecutor, {
          text: `
            INSERT INTO user_auth_identities (user_id, provider, provider_subject)
            VALUES ($1, 'GOOGLE', $2)
          `,
          values: [user.id, input.providerSubject]
        });
      } catch (error) {
        if (isConstraint(error, "uq_user_auth_identities_provider_subject")) {
          throw new GoogleIdentityConflictError();
        }
        throw error;
      }

      return user;
    }
  });
}
