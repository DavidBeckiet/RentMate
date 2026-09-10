import type { QueryResultRow } from "pg";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import {
  executeCommand,
  queryExactlyOne,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";

export interface PasswordResetToken {
  readonly id: number;
  readonly userId: number;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

interface PasswordResetTokenRow extends QueryResultRow {
  readonly id: unknown;
  readonly user_id: unknown;
  readonly token_hash: unknown;
  readonly expires_at: unknown;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return value as number;
}

function expiry(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new RepositoryInvariantError("password reset expiry is invalid.");
  return date;
}

function mapToken(row: Readonly<PasswordResetTokenRow>): PasswordResetToken {
  if (typeof row.token_hash !== "string" || !/^[0-9a-f]{64}$/u.test(row.token_hash)) {
    throw new RepositoryInvariantError("password reset token hash is invalid.");
  }
  return Object.freeze({
    id: positiveInteger(row.id, "password reset token.id"),
    userId: positiveInteger(row.user_id, "password reset token.userId"),
    tokenHash: row.token_hash,
    expiresAt: expiry(row.expires_at)
  });
}

export interface PasswordResetRepository {
  readonly invalidateActiveTokens: (executor: SqlExecutor, userId: number) => Promise<void>;
  readonly createToken: (
    executor: SqlExecutor,
    input: { readonly userId: number; readonly tokenHash: string; readonly expiresAt: Date }
  ) => Promise<void>;
  readonly findActiveTokenForUserForUpdate: (
    executor: SqlExecutor,
    userId: number
  ) => Promise<PasswordResetToken | null>;
  readonly consumeToken: (executor: SqlExecutor, tokenId: number) => Promise<boolean>;
  readonly updatePasswordHash: (executor: SqlExecutor, userId: number, passwordHash: string) => Promise<boolean>;
}

export function createPasswordResetRepository(executor: SqlExecutor): PasswordResetRepository {
  const repository: PasswordResetRepository = {
    async invalidateActiveTokens(transactionExecutor, userId) {
      await executeCommand(transactionExecutor, {
        text: `
          UPDATE password_reset_tokens
          SET consumed_at = CURRENT_TIMESTAMP
          WHERE user_id = $1 AND consumed_at IS NULL
        `,
        values: [userId]
      });
    },

    async createToken(transactionExecutor, input) {
      await executeCommand(transactionExecutor, {
        text: `
          INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
          VALUES ($1, $2, $3)
        `,
        values: [input.userId, input.tokenHash, input.expiresAt]
      });
    },

    async findActiveTokenForUserForUpdate(transactionExecutor, userId) {
      return queryOptional<PasswordResetTokenRow, PasswordResetToken>(
        transactionExecutor,
        {
          text: `
            SELECT id, user_id, token_hash, expires_at
            FROM password_reset_tokens
            WHERE user_id = $1 AND consumed_at IS NULL
            FOR UPDATE
          `,
          values: [userId]
        },
        mapToken
      );
    },

    async consumeToken(transactionExecutor, tokenId) {
      const affected = await executeCommand(transactionExecutor, {
        text: `
          UPDATE password_reset_tokens
          SET consumed_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND consumed_at IS NULL
        `,
        values: [tokenId]
      });
      return affected === 1;
    },

    async updatePasswordHash(transactionExecutor, userId, passwordHash) {
      const affected = await executeCommand(transactionExecutor, {
        text: `
          UPDATE users
          SET password_hash = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND is_active = true
        `,
        values: [userId, passwordHash]
      });
      return affected === 1;
    }
  };
  return Object.freeze(repository);
}
