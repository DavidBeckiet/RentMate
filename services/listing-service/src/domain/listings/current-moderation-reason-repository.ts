import type { QueryResultRow } from "pg";
import { queryOptional, RepositoryInvariantError } from "../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../shared/src/runtime/db/sql-executor.js";
import type { CurrentModerationReasonStatus } from "./current-moderation-reason.js";

interface CurrentModerationReasonRow extends QueryResultRow {
  readonly reason: unknown;
}

export interface CurrentModerationReasonRepository {
  readonly findLatestReason: (listingId: number, status: CurrentModerationReasonStatus) => Promise<string | null>;
}

export type CurrentModerationReasonRepositoryFactory = (executor: SqlExecutor) => CurrentModerationReasonRepository;

function mapCurrentModerationReasonRow(row: Readonly<CurrentModerationReasonRow>): string {
  if (typeof row.reason !== "string" || row.reason.trim().length === 0 || [...row.reason].length > 1_000) {
    throw new RepositoryInvariantError("Current moderation reason row is invalid.");
  }
  return row.reason;
}

export function createCurrentModerationReasonRepository(executor: SqlExecutor): CurrentModerationReasonRepository {
  return Object.freeze({
    async findLatestReason(listingId: number, status: CurrentModerationReasonStatus): Promise<string | null> {
      return queryOptional<CurrentModerationReasonRow, string>(
        executor,
        {
          text: `
            SELECT
              reason
            FROM moderation_history
            WHERE listing_id = $1
              AND new_status = $2
            ORDER BY
              created_at DESC,
              id DESC
            LIMIT 1
          `,
          values: [listingId, status]
        },
        mapCurrentModerationReasonRow
      );
    }
  });
}
