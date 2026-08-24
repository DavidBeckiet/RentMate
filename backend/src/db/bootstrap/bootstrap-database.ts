import type { Pool, QueryResultRow } from "pg";
import type { AdminProvisioningInput } from "../admin-provisioning/input.js";
import {
  provisionAdmin,
  type AdminProvisioningResult,
  type PasswordHasher
} from "../admin-provisioning/provision-admin.js";
import { discoverMigrations } from "../migrations/discovery.js";
import { executeMigrationPlan } from "../migrations/execution.js";
import { createMigrationPlan } from "../migrations/planning.js";
import { highestExpectedMigrationVersion } from "../schema-verification/expected-schema.js";
import { verifyFinalSchema, type FinalSchemaVerificationResult } from "../schema-verification/verify-final-schema.js";

interface DatabaseObjectCountRow extends QueryResultRow {
  readonly relationCount: number;
  readonly enumCount: number;
  readonly routineCount: number;
  readonly extensionCount: number;
}

export interface DatabaseBootstrapResult {
  readonly appliedMigrationCount: 13;
  readonly lastAppliedMigrationVersion: 13;
  readonly schema: FinalSchemaVerificationResult;
  readonly admin: AdminProvisioningResult;
}

export class DatabaseBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseBootstrapError";
  }
}

async function requireEmptyDatabase(pool: Pick<Pool, "connect">): Promise<void> {
  const client = await pool.connect();

  try {
    const objectCounts = await client.query<DatabaseObjectCountRow>(
      `
        SELECT
          (
            SELECT count(*)::integer
            FROM pg_class AS relation
            JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
          ) AS "relationCount",
          (
            SELECT count(DISTINCT type.oid)::integer
            FROM pg_type AS type
            JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
            JOIN pg_enum AS enum_value ON enum_value.enumtypid = type.oid
            WHERE namespace.nspname = 'public'
          ) AS "enumCount",
          (
            SELECT count(*)::integer
            FROM pg_proc AS routine
            JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
            WHERE namespace.nspname = 'public'
              AND routine.prokind IN ('f', 'p')
          ) AS "routineCount",
          (
            SELECT count(*)::integer
            FROM pg_extension AS extension_record
            JOIN pg_namespace AS namespace ON namespace.oid = extension_record.extnamespace
            WHERE namespace.nspname = 'public'
          ) AS "extensionCount"
      `
    );
    const counts = objectCounts.rows[0];

    if (
      !counts ||
      counts.relationCount !== 0 ||
      counts.enumCount !== 0 ||
      counts.routineCount !== 0 ||
      counts.extensionCount !== 0
    ) {
      throw new DatabaseBootstrapError(
        "db:bootstrap requires an empty public schema and does not repair or replace existing objects."
      );
    }
  } catch (error) {
    if (error instanceof DatabaseBootstrapError) {
      throw error;
    }

    throw new DatabaseBootstrapError("The empty-database precondition could not be verified.");
  } finally {
    client.release();
  }
}

export async function bootstrapDatabase(options: {
  readonly pool: Pool;
  readonly migrationsDirectory: string;
  readonly adminInput: AdminProvisioningInput;
  readonly passwordHasher?: PasswordHasher;
}): Promise<DatabaseBootstrapResult> {
  await requireEmptyDatabase(options.pool);

  const migrations = await discoverMigrations(options.migrationsDirectory);
  const versions = migrations.map(({ version }) => version);
  const expectedVersions = Array.from({ length: highestExpectedMigrationVersion }, (_, index) => index + 1);

  if (JSON.stringify(versions) !== JSON.stringify(expectedVersions)) {
    throw new DatabaseBootstrapError("The migration inventory must contain exactly versions 0001 through 0013.");
  }

  const migrationResult = await executeMigrationPlan(options.pool, createMigrationPlan("clean", migrations));
  const appliedMigrationCount = migrationResult.completedMigrations.length;
  const lastAppliedMigrationVersion = migrationResult.lastSuccessfulMigration?.version;

  if (appliedMigrationCount !== 13 || lastAppliedMigrationVersion !== 13) {
    throw new DatabaseBootstrapError("Clean bootstrap did not apply exactly migrations 0001 through 0013.");
  }

  const firstVerification = await verifyFinalSchema(options.pool);
  const adminResult = await provisionAdmin(options.pool, options.adminInput, options.passwordHasher);
  const finalVerification = await verifyFinalSchema(options.pool);

  if (JSON.stringify(firstVerification) !== JSON.stringify(finalVerification)) {
    throw new DatabaseBootstrapError("Admin provisioning unexpectedly changed the frozen schema inventory.");
  }

  return {
    appliedMigrationCount,
    lastAppliedMigrationVersion,
    schema: finalVerification,
    admin: adminResult
  };
}
