import type { QueryResultRow } from "pg";
import {
  queryExactlyOne,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";

export interface IdentityOverview {
  readonly accounts: {
    readonly total: number;
    readonly byRole: { readonly TENANT: number; readonly LANDLORD: number; readonly ADMIN: number };
    readonly active: number;
    readonly inactive: number;
  };
  readonly verifications: { readonly pending: number };
  readonly capturedAt: string;
}

interface OverviewRow extends QueryResultRow {
  readonly account_total: unknown;
  readonly tenant_count: unknown;
  readonly landlord_count: unknown;
  readonly admin_count: unknown;
  readonly active_count: unknown;
  readonly inactive_count: unknown;
  readonly pending_verification_count: unknown;
  readonly captured_at: unknown;
}

function count(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new RepositoryInvariantError(`${field} is invalid.`);
  return value as number;
}

function timestamp(value: unknown): string {
  try {
    return formatApiTimestamp(value instanceof Date ? value : new Date(String(value)));
  } catch {
    throw new RepositoryInvariantError("overview.capturedAt is invalid.");
  }
}

function mapOverview(row: Readonly<OverviewRow>): IdentityOverview {
  const total = count(row.account_total, "overview.accounts.total");
  const tenant = count(row.tenant_count, "overview.accounts.byRole.TENANT");
  const landlord = count(row.landlord_count, "overview.accounts.byRole.LANDLORD");
  const admin = count(row.admin_count, "overview.accounts.byRole.ADMIN");
  const active = count(row.active_count, "overview.accounts.active");
  const inactive = count(row.inactive_count, "overview.accounts.inactive");
  if (total !== tenant + landlord + admin || total !== active + inactive) {
    throw new RepositoryInvariantError("Identity overview count invariants are invalid.");
  }
  return Object.freeze({
    accounts: Object.freeze({
      total,
      byRole: Object.freeze({ TENANT: tenant, LANDLORD: landlord, ADMIN: admin }),
      active,
      inactive
    }),
    verifications: Object.freeze({ pending: count(row.pending_verification_count, "overview.verifications.pending") }),
    capturedAt: timestamp(row.captured_at)
  });
}

export interface IdentityOverviewRepository {
  readonly read: () => Promise<IdentityOverview>;
}

export function createIdentityOverviewRepository(executor: SqlExecutor): IdentityOverviewRepository {
  return Object.freeze({
    read: () =>
      queryExactlyOne<OverviewRow, IdentityOverview>(
        executor,
        {
          text: `
          SELECT
            (SELECT COUNT(*)::integer FROM users) AS account_total,
            (SELECT COUNT(*) FILTER (WHERE role = 'TENANT')::integer FROM users) AS tenant_count,
            (SELECT COUNT(*) FILTER (WHERE role = 'LANDLORD')::integer FROM users) AS landlord_count,
            (SELECT COUNT(*) FILTER (WHERE role = 'ADMIN')::integer FROM users) AS admin_count,
            (SELECT COUNT(*) FILTER (WHERE is_active)::integer FROM users) AS active_count,
            (SELECT COUNT(*) FILTER (WHERE NOT is_active)::integer FROM users) AS inactive_count,
            (SELECT COUNT(*)::integer FROM landlord_verifications WHERE status = 'PENDING') AS pending_verification_count,
            CURRENT_TIMESTAMP AS captured_at
        `,
          values: []
        },
        mapOverview
      )
  });
}
