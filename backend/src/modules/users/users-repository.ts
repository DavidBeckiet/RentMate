import type { QueryResultRow } from "pg";
import { queryOptional } from "../../db/repository-primitives.js";
import type { SqlExecutor } from "../../db/sql-executor.js";
import { isUserRole, type AuthenticationAccount, type UserRole } from "../../shared/types/authentication.js";
import { mapUserProfileRow, type UserProfile, type UserProfileRow } from "./user-profile.js";

const maximumUserId = 2_147_483_647;

export interface UsersRepository {
  readonly findAuthenticationAccountById: (userId: number) => Promise<AuthenticationAccount | null>;
  readonly findProfileById: (userId: number) => Promise<UserProfile | null>;
  readonly updatePhone: (userId: number, phone: string | null) => Promise<UserProfile | null>;
}

interface AuthenticationAccountRow extends QueryResultRow {
  readonly id: number;
  readonly role: UserRole;
  readonly is_active: boolean;
}

function mapAuthenticationAccountRow(row: Readonly<AuthenticationAccountRow>): AuthenticationAccount {
  if (
    !Number.isInteger(row.id) ||
    row.id < 1 ||
    row.id > maximumUserId ||
    !isUserRole(row.role) ||
    typeof row.is_active !== "boolean"
  ) {
    throw new Error("Authentication account row is invalid.");
  }

  return Object.freeze({
    id: row.id,
    role: row.role,
    isActive: row.is_active
  });
}

const profileSelect = `
      SELECT
        id,
        role,
        email,
        phone_e164,
        is_active,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
        AND is_active = true
      LIMIT 1
    `;

export function createUsersRepository(executor: SqlExecutor): UsersRepository {
  const findProfileById = async (userId: number): Promise<UserProfile | null> =>
    queryOptional<UserProfileRow, UserProfile>(
      executor,
      {
        text: profileSelect,
        values: [userId]
      },
      mapUserProfileRow
    );

  return Object.freeze({
    async findAuthenticationAccountById(userId: number): Promise<AuthenticationAccount | null> {
      return queryOptional<AuthenticationAccountRow, AuthenticationAccount>(
        executor,
        {
          text: `
            SELECT
              id,
              role,
              is_active
            FROM users
            WHERE id = $1
            LIMIT 1
          `,
          values: [userId]
        },
        mapAuthenticationAccountRow
      );
    },

    findProfileById,

    async updatePhone(userId: number, phone: string | null): Promise<UserProfile | null> {
      const updated = await queryOptional<UserProfileRow, UserProfile>(
        executor,
        {
          text: `
            UPDATE users
            SET
              phone_e164 = $2,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND is_active = true
              AND phone_e164 IS DISTINCT FROM $2
            RETURNING
              id,
              role,
              email,
              phone_e164,
              is_active,
              created_at,
              updated_at
          `,
          values: [userId, phone]
        },
        mapUserProfileRow
      );

      return updated ?? findProfileById(userId);
    }
  });
}
