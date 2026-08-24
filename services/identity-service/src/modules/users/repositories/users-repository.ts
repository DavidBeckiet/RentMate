import type { QueryResultRow } from "pg";
import { queryMany, queryOptional } from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import {
  isUserRole,
  type AuthenticationAccount,
  type UserRole
} from "../../../../../shared/src/runtime/shared/types/authentication.js";
import { mapUserProfileRow, type UserProfile, type UserProfileRow } from "../user-profile.js";

const maximumUserId = 2_147_483_647;

export interface UsersRepository {
  readonly findAuthenticationAccountById: (userId: number) => Promise<AuthenticationAccount | null>;
  readonly findActiveLandlordIds?: () => Promise<readonly number[]>;
  readonly findProfilesByIds?: (userIds: readonly number[]) => Promise<readonly UserProfile[]>;
  readonly findProfileById: (userId: number) => Promise<UserProfile | null>;
  readonly updateProfile: (userId: number, input: UpdateUserProfileRecord) => Promise<UserProfile | null>;
}

export interface UpdateUserProfileRecord {
  readonly displayNameProvided: boolean;
  readonly displayName: string | null;
  readonly phoneProvided: boolean;
  readonly phone: string | null;
}

interface AuthenticationAccountRow extends QueryResultRow {
  readonly id: number;
  readonly role: UserRole;
  readonly is_active: boolean;
}

interface ActiveLandlordIdRow extends QueryResultRow {
  readonly id: number;
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
        display_name,
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

const profilesSelect = `
      SELECT
        id,
        role,
        display_name,
        email,
        phone_e164,
        is_active,
        created_at,
        updated_at
      FROM users
      WHERE id = ANY($1::integer[])
      ORDER BY id ASC
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

    async findActiveLandlordIds(): Promise<readonly number[]> {
      return Object.freeze(
        await queryMany<ActiveLandlordIdRow, number>(
          executor,
          {
            text: `
              SELECT id
              FROM users
              WHERE role = 'LANDLORD'
                AND is_active = true
              ORDER BY id ASC
            `,
            values: []
          },
          (row) => row.id
        )
      );
    },

    async findProfilesByIds(userIds: readonly number[]): Promise<readonly UserProfile[]> {
      if (userIds.length === 0) return Object.freeze([]);
      return Object.freeze(
        await queryMany<UserProfileRow, UserProfile>(
          executor,
          { text: profilesSelect, values: [[...userIds]] },
          mapUserProfileRow
        )
      );
    },

    findProfileById,

    async updateProfile(userId: number, input: UpdateUserProfileRecord): Promise<UserProfile | null> {
      const updated = await queryOptional<UserProfileRow, UserProfile>(
        executor,
        {
          text: `
            UPDATE users
            SET
              display_name = CASE WHEN $2::boolean THEN $3::varchar ELSE display_name END,
              phone_e164 = CASE WHEN $4::boolean THEN $5::varchar ELSE phone_e164 END,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND is_active = true
              AND (
                ($2::boolean AND display_name IS DISTINCT FROM $3::varchar)
                OR ($4::boolean AND phone_e164 IS DISTINCT FROM $5::varchar)
              )
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
          values: [userId, input.displayNameProvided, input.displayName, input.phoneProvided, input.phone]
        },
        mapUserProfileRow
      );

      return updated ?? findProfileById(userId);
    }
  });
}
