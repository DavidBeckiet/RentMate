import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryExactlyOne,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";

export type ContactVerificationChannel = "EMAIL" | "PHONE";

export interface ContactVerificationStatus {
  readonly email: string;
  readonly phone: string | null;
  readonly emailVerifiedAt: string | null;
  readonly phoneVerifiedAt: string | null;
}

export interface ContactVerificationChallenge {
  readonly id: number;
  readonly userId: number;
  readonly channel: ContactVerificationChannel;
  readonly destination: string;
  readonly secretHash: string;
  readonly attemptCount: number;
  readonly expiresAt: string;
}

interface ContactStatusRow extends QueryResultRow {
  email: unknown;
  phone_e164: unknown;
  email_verified_at: unknown;
  phone_verified_at: unknown;
}

interface ChallengeRow extends QueryResultRow {
  id: unknown;
  user_id: unknown;
  channel: unknown;
  destination: unknown;
  secret_hash: unknown;
  attempt_count: unknown;
  expires_at: unknown;
}

interface AttemptRow extends QueryResultRow {
  attempt_count: unknown;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return value as number;
}

function nonblank(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  return value === null ? null : nonblank(value, field);
}

function nullableTimestamp(value: unknown, field: string): string | null {
  if (value === null) return null;
  try {
    return formatApiTimestamp(value instanceof Date ? value : new Date(String(value)));
  } catch {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
}

function timestamp(value: unknown, field: string): string {
  const result = nullableTimestamp(value, field);
  if (result === null) throw new RepositoryInvariantError(`${field} is invalid.`);
  return result;
}

function channel(value: unknown): ContactVerificationChannel {
  if (value !== "EMAIL" && value !== "PHONE") {
    throw new RepositoryInvariantError("contactVerification.channel is invalid.");
  }
  return value;
}

function mapStatus(row: Readonly<ContactStatusRow>): ContactVerificationStatus {
  return Object.freeze({
    email: nonblank(row.email, "contactVerification.email"),
    phone: nullableText(row.phone_e164, "contactVerification.phone"),
    emailVerifiedAt: nullableTimestamp(row.email_verified_at, "contactVerification.emailVerifiedAt"),
    phoneVerifiedAt: nullableTimestamp(row.phone_verified_at, "contactVerification.phoneVerifiedAt")
  });
}

function mapChallenge(row: Readonly<ChallengeRow>): ContactVerificationChallenge {
  if (!Number.isSafeInteger(row.attempt_count)) {
    throw new RepositoryInvariantError("contactVerification.attemptCount is invalid.");
  }
  const attemptCount = row.attempt_count as number;
  if (attemptCount < 0 || attemptCount > 5) {
    throw new RepositoryInvariantError("contactVerification.attemptCount is invalid.");
  }
  return Object.freeze({
    id: positiveInteger(row.id, "contactVerification.id"),
    userId: positiveInteger(row.user_id, "contactVerification.userId"),
    channel: channel(row.channel),
    destination: nonblank(row.destination, "contactVerification.destination"),
    secretHash: nonblank(row.secret_hash, "contactVerification.secretHash"),
    attemptCount,
    expiresAt: timestamp(row.expires_at, "contactVerification.expiresAt")
  });
}

export interface ContactVerificationRepository {
  readonly findStatus: (
    executor: SqlExecutor,
    userId: number,
    options?: { readonly forUpdate?: boolean }
  ) => Promise<ContactVerificationStatus | null>;
  readonly createChallenge: (
    executor: SqlExecutor,
    input: {
      readonly userId: number;
      readonly channel: ContactVerificationChannel;
      readonly destination: string;
      readonly secretHash: string;
      readonly expiresAt: Date;
    }
  ) => Promise<ContactVerificationChallenge>;
  readonly findChallengeForUpdate: (
    executor: SqlExecutor,
    input: {
      readonly userId: number;
      readonly channel: ContactVerificationChannel;
    }
  ) => Promise<ContactVerificationChallenge | null>;
  readonly incrementAttempts: (executor: SqlExecutor, challengeId: number) => Promise<number | null>;
  readonly consumeChallenge: (executor: SqlExecutor, challengeId: number) => Promise<void>;
  readonly markVerified: (executor: SqlExecutor, userId: number, channel: ContactVerificationChannel) => Promise<void>;
}

export function createContactVerificationRepository(): ContactVerificationRepository {
  const repository: ContactVerificationRepository = {
    findStatus(executor, userId, options = {}) {
      return queryOptional<ContactStatusRow, ContactVerificationStatus>(
        executor,
        {
          text: `
            SELECT email, phone_e164, email_verified_at, phone_verified_at
            FROM users
            WHERE id = $1 AND is_active = true
            LIMIT 1
            ${options.forUpdate ? "FOR UPDATE" : ""}
          `,
          values: [userId]
        },
        mapStatus
      );
    },

    createChallenge(executor, input) {
      return queryExactlyOne<ChallengeRow, ContactVerificationChallenge>(
        executor,
        {
          text: `
            WITH revoked AS (
              UPDATE contact_verification_challenges
              SET consumed_at = CURRENT_TIMESTAMP
              WHERE user_id = $1 AND channel = $2 AND consumed_at IS NULL
            )
            INSERT INTO contact_verification_challenges (
              user_id, channel, destination, secret_hash, expires_at
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, user_id, channel, destination, secret_hash, attempt_count, expires_at
          `,
          values: [input.userId, input.channel, input.destination, input.secretHash, input.expiresAt]
        },
        mapChallenge
      );
    },

    findChallengeForUpdate(executor, input) {
      return queryOptional<ChallengeRow, ContactVerificationChallenge>(
        executor,
        {
          text: `
            SELECT id, user_id, channel, destination, secret_hash, attempt_count, expires_at
            FROM contact_verification_challenges
            WHERE user_id = $1
              AND channel = $2
              AND consumed_at IS NULL
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            FOR UPDATE
          `,
          values: [input.userId, input.channel]
        },
        mapChallenge
      );
    },

    async incrementAttempts(executor, challengeId) {
      const row = await queryOptional<AttemptRow, number>(
        executor,
        {
          text: `
            UPDATE contact_verification_challenges
            SET
              attempt_count = attempt_count + 1,
              consumed_at = CASE WHEN attempt_count + 1 >= 5 THEN CURRENT_TIMESTAMP ELSE consumed_at END
            WHERE id = $1 AND consumed_at IS NULL
            RETURNING attempt_count
          `,
          values: [challengeId]
        },
        (value) => {
          if (!Number.isSafeInteger(value.attempt_count) || (value.attempt_count as number) < 1) {
            throw new RepositoryInvariantError("contactVerification.attemptCount is invalid.");
          }
          return value.attempt_count as number;
        }
      );
      return row;
    },

    async consumeChallenge(executor, challengeId) {
      await executeCommand(executor, {
        text: `
          UPDATE contact_verification_challenges
          SET consumed_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND consumed_at IS NULL
        `,
        values: [challengeId]
      });
    },

    async markVerified(executor, userId, verificationChannel) {
      const column = verificationChannel === "EMAIL" ? "email_verified_at" : "phone_verified_at";
      await executeCommand(executor, {
        text: `
          UPDATE users
          SET ${column} = COALESCE(${column}, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND is_active = true
        `,
        values: [userId]
      });
    }
  };
  return Object.freeze(repository);
}
