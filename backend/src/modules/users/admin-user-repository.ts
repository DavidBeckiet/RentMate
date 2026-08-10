import { queryExactlyOne, queryMany, queryOptional } from "../../db/repository-primitives.js";
import type { SqlExecutor } from "../../db/sql-executor.js";
import type { UserRole } from "../../shared/types/authentication.js";
import { mapUserProfileRow, type UserProfile, type UserProfileRow } from "./user-profile.js";

export interface AdminUserPageInput {
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
  readonly lockActivationTarget: (userId: number) => Promise<UserProfile | null>;
  readonly updateActivation: (input: AdminUserActivationUpdate) => Promise<UserProfile>;
}

export type AdminUserRepositoryFactory = (executor: SqlExecutor) => AdminUserRepository;

const profileProjection = `
  id,
  role,
  email,
  phone_e164,
  is_active,
  created_at,
  updated_at
`;

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
              ORDER BY
                created_at DESC,
                id DESC
              LIMIT $3
              OFFSET $4
            `,
            values: [input.role, input.isActive, input.limit, input.offset]
          },
          mapUserProfileRow
        )
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
