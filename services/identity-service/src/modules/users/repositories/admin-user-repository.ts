import {
  queryExactlyOne,
  queryMany,
  queryOptional
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { UserRole } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import {
  mapAdminUserDetailRow,
  mapUserProfileRow,
  type AdminUserDetail,
  type AdminUserDetailRow,
  type UserProfile,
  type UserProfileRow
} from "../user-profile.js";

export interface AdminUserPageInput {
  readonly q: string | null;
  readonly userId: number | null;
  readonly role: UserRole | null;
  readonly isActive: boolean | null;
  readonly limit: number;
  readonly offset: number;
}

export interface AdminUserActivationUpdate {
  readonly userId: number;
  readonly isActive: boolean;
  readonly lockedRole: "TENANT" | "LANDLORD";
}

export interface AdminUserRepository {
  readonly findUserPage: (input: AdminUserPageInput) => Promise<readonly UserProfile[]>;
  readonly findUserDetail: (userId: number) => Promise<AdminUserDetail | null>;
  readonly lockActivationTarget: (userId: number) => Promise<UserProfile | null>;
  readonly updateActivation: (input: AdminUserActivationUpdate) => Promise<UserProfile>;
}

export type AdminUserRepositoryFactory = (executor: SqlExecutor) => AdminUserRepository;

const profileProjection = `
  id,
  role,
  display_name,
  email,
  phone_e164,
  is_active,
  created_at,
  updated_at
`;

function escapedLikePattern(value: string | null): string | null {
  return value === null ? null : `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

export function createAdminUserRepository(executor: SqlExecutor): AdminUserRepository {
  return Object.freeze({
    async findUserPage(input: AdminUserPageInput): Promise<readonly UserProfile[]> {
      return Object.freeze(
        await queryMany<UserProfileRow, UserProfile>(
          executor,
          {
            text: `
              SELECT ${profileProjection}
              FROM users
              WHERE ($1::user_role IS NULL OR role = $1::user_role)
                AND ($2::boolean IS NULL OR is_active = $2::boolean)
                AND (
                  $3::text IS NULL
                  OR ($4::integer IS NOT NULL AND id = $4::integer)
                  OR email ILIKE $3::text ESCAPE '\\'
                  OR display_name ILIKE $3::text ESCAPE '\\'
                )
              ORDER BY
                created_at DESC,
                id DESC
              LIMIT $5
              OFFSET $6
            `,
            values: [input.role, input.isActive, escapedLikePattern(input.q), input.userId, input.limit, input.offset]
          },
          mapUserProfileRow
        )
      );
    },

    findUserDetail(userId: number): Promise<AdminUserDetail | null> {
      return queryOptional<AdminUserDetailRow, AdminUserDetail>(
        executor,
        {
          text: `
            SELECT
              ${profileProjection},
              email_verified_at IS NOT NULL AS email_verified,
              phone_verified_at IS NOT NULL AS phone_verified
            FROM users
            WHERE id = $1
          `,
          values: [userId]
        },
        mapAdminUserDetailRow
      );
    },

    lockActivationTarget(userId: number): Promise<UserProfile | null> {
      return queryOptional<UserProfileRow, UserProfile>(
        executor,
        {
          text: `
            SELECT ${profileProjection}
            FROM users
            WHERE id = $1
            FOR UPDATE
          `,
          values: [userId]
        },
        mapUserProfileRow
      );
    },

    updateActivation(input: AdminUserActivationUpdate): Promise<UserProfile> {
      return queryExactlyOne<UserProfileRow, UserProfile>(
        executor,
        {
          text: `
            UPDATE users
            SET
              is_active = $2,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND role = $3::user_role
              AND role IN ('TENANT', 'LANDLORD')
              AND is_active IS DISTINCT FROM $2
            RETURNING ${profileProjection}
          `,
          values: [input.userId, input.isActive, input.lockedRole]
        },
        mapUserProfileRow
      );
    }
  });
}
