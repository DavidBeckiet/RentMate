import type { Pool, QueryResultRow } from "pg";
import {
  expectedAmenities,
  expectedColumnSignatures,
  expectedEnumTypes,
  expectedExplicitIndexes,
  expectedForeignKeys,
  expectedKeyConstraints,
  expectedNamedConstraints,
  expectedProductTables,
  expectedPropertyTypes
} from "./expected-schema.js";

interface EnumRow extends QueryResultRow {
  readonly name: string;
  readonly labels: string[];
}

interface TableRow extends QueryResultRow {
  readonly name: string;
}

interface SignatureRow extends QueryResultRow {
  readonly signature: string;
}

interface ConstraintRow extends QueryResultRow {
  readonly tableName: string;
  readonly constraintName: string;
  readonly constraintType: string;
}

interface KeyConstraintRow extends QueryResultRow {
  readonly constraintName: string;
  readonly columns: string[];
}

interface ForeignKeyRow extends QueryResultRow {
  readonly constraintName: string;
  readonly sourceTable: string;
  readonly sourceColumn: string;
  readonly parentTable: string;
  readonly parentColumn: string;
  readonly deleteAction: string;
  readonly updateAction: string;
}

interface IndexRow extends QueryResultRow {
  readonly name: string;
  readonly tableName: string;
  readonly method: string;
  readonly unique: boolean;
  readonly keys: string[];
  readonly directions: string[];
  readonly attributeCount: number;
  readonly keyCount: number;
  readonly predicate: string | null;
}

interface LookupRow extends QueryResultRow {
  readonly code: string;
  readonly label: string;
}

interface ProhibitedObjectRow extends QueryResultRow {
  readonly triggerCount: number;
  readonly routineCount: number;
  readonly postgisExtensionCount: number;
}

interface DeferrableConstraintRow extends QueryResultRow {
  readonly deferrable: boolean;
  readonly deferred: boolean;
}

export interface FinalSchemaVerificationResult {
  readonly enumCount: 2;
  readonly tableCount: 8;
  readonly constraintCount: 52;
  readonly explicitIndexCount: 10;
  readonly propertyTypeCount: 5;
  readonly amenityCount: 12;
}

export class SchemaVerificationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Final schema verification failed: ${issues.join("; ")}`);
    this.name = "SchemaVerificationError";
  }
}

function matches(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function requireMatch(label: string, actual: unknown, expected: unknown): void {
  if (!matches(actual, expected)) {
    throw new SchemaVerificationError([`${label} mismatch`]);
  }
}

export async function verifyFinalSchema(pool: Pick<Pool, "connect">): Promise<FinalSchemaVerificationResult> {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    transactionStarted = true;

    const enums = await client.query<EnumRow>(
      `
        SELECT
          type.typname::text AS name,
          array_agg(enum_value.enumlabel::text ORDER BY enum_value.enumsortorder) AS labels
        FROM pg_type AS type
        JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
        JOIN pg_enum AS enum_value ON enum_value.enumtypid = type.oid
        WHERE namespace.nspname = 'public'
        GROUP BY type.typname
        ORDER BY type.typname
      `
    );
    requireMatch(
      "enum inventory",
      enums.rows.map(({ name, labels }) => ({ name, labels })),
      expectedEnumTypes
    );

    const tables = await client.query<TableRow>(
      `
        SELECT tablename AS name
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `
    );
    requireMatch(
      "product table inventory",
      tables.rows.map(({ name }) => name),
      expectedProductTables
    );

    const columns = await client.query<SignatureRow>(
      `
        SELECT concat(
          table_name, '|',
          ordinal_position, '|',
          column_name, '|',
          data_type, '|',
          udt_name, '|',
          coalesce(character_maximum_length::text, '-'), '|',
          CASE
            WHEN data_type = 'numeric' THEN concat(numeric_precision, ',', numeric_scale)
            ELSE '-'
          END, '|',
          is_nullable, '|',
          is_identity, '|',
          coalesce(identity_generation, '-'), '|',
          coalesce(column_default, '-')
        ) AS signature
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name, ordinal_position
      `,
      [[...expectedProductTables]]
    );
    requireMatch(
      "column inventory",
      columns.rows.map(({ signature }) => signature),
      expectedColumnSignatures
    );

    const constraints = await client.query<ConstraintRow>(
      `
        SELECT
          relation.relname AS "tableName",
          constraint_record.conname AS "constraintName",
          constraint_record.contype AS "constraintType"
        FROM pg_constraint AS constraint_record
        JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = ANY($1::text[])
        ORDER BY relation.relname, constraint_record.conname
      `,
      [[...expectedProductTables]]
    );
    requireMatch(
      "named constraint inventory",
      constraints.rows.map(({ tableName, constraintName, constraintType }) => [
        tableName,
        constraintName,
        constraintType
      ]),
      expectedNamedConstraints
    );

    const keyConstraints = await client.query<KeyConstraintRow>(
      `
        SELECT
          constraint_record.conname AS "constraintName",
          ARRAY(
            SELECT attribute.attname::text
            FROM unnest(constraint_record.conkey) WITH ORDINALITY AS key_column(attribute_number, position)
            JOIN pg_attribute AS attribute
              ON attribute.attrelid = constraint_record.conrelid
              AND attribute.attnum = key_column.attribute_number
            ORDER BY key_column.position
          ) AS columns
        FROM pg_constraint AS constraint_record
        JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = ANY($1::text[])
          AND constraint_record.contype IN ('p', 'u')
        ORDER BY constraint_record.conname
      `,
      [[...expectedProductTables]]
    );
    requireMatch(
      "primary and unique key definitions",
      keyConstraints.rows.map(({ constraintName, columns: keyColumns }) => [constraintName, keyColumns]),
      expectedKeyConstraints
    );

    const foreignKeys = await client.query<ForeignKeyRow>(
      `
        SELECT
          constraint_record.conname AS "constraintName",
          source_relation.relname AS "sourceTable",
          source_attribute.attname AS "sourceColumn",
          parent_relation.relname AS "parentTable",
          parent_attribute.attname AS "parentColumn",
          constraint_record.confdeltype AS "deleteAction",
          constraint_record.confupdtype AS "updateAction"
        FROM pg_constraint AS constraint_record
        JOIN pg_class AS source_relation ON source_relation.oid = constraint_record.conrelid
        JOIN pg_class AS parent_relation ON parent_relation.oid = constraint_record.confrelid
        JOIN pg_namespace AS namespace ON namespace.oid = source_relation.relnamespace
        JOIN pg_attribute AS source_attribute
          ON source_attribute.attrelid = constraint_record.conrelid
          AND source_attribute.attnum = constraint_record.conkey[1]
        JOIN pg_attribute AS parent_attribute
          ON parent_attribute.attrelid = constraint_record.confrelid
          AND parent_attribute.attnum = constraint_record.confkey[1]
        WHERE namespace.nspname = 'public'
          AND constraint_record.contype = 'f'
          AND source_relation.relname = ANY($1::text[])
        ORDER BY constraint_record.conname
      `,
      [[...expectedProductTables]]
    );
    requireMatch(
      "foreign key definitions",
      foreignKeys.rows.map(
        ({ constraintName, sourceTable, sourceColumn, parentTable, parentColumn, deleteAction, updateAction }) => [
          constraintName,
          sourceTable,
          sourceColumn,
          parentTable,
          parentColumn,
          deleteAction,
          updateAction
        ]
      ),
      expectedForeignKeys
    );

    const deferrableConstraint = await client.query<DeferrableConstraintRow>(
      `
        SELECT condeferrable AS deferrable, condeferred AS deferred
        FROM pg_constraint
        WHERE conname = 'uq_listing_images_listing_display_order'
      `
    );
    requireMatch("image-order deferrability", deferrableConstraint.rows, [{ deferrable: true, deferred: false }]);

    const indexes = await client.query<IndexRow>(
      `
        SELECT
          index_relation.relname AS name,
          table_relation.relname AS "tableName",
          access_method.amname AS method,
          index_record.indisunique AS unique,
          ARRAY(
            SELECT pg_get_indexdef(index_record.indexrelid, position, true)
            FROM generate_series(1, index_record.indnkeyatts) AS position
          ) AS keys,
          ARRAY(
            SELECT CASE
              WHEN (index_record.indoption[position - 1] & 1) = 1 THEN 'DESC'
              ELSE 'ASC'
            END
            FROM generate_series(1, index_record.indnkeyatts) AS position
          ) AS directions,
          index_record.indnatts::integer AS "attributeCount",
          index_record.indnkeyatts::integer AS "keyCount",
          pg_get_expr(index_record.indpred, index_record.indrelid) AS predicate
        FROM pg_index AS index_record
        JOIN pg_class AS index_relation ON index_relation.oid = index_record.indexrelid
        JOIN pg_class AS table_relation ON table_relation.oid = index_record.indrelid
        JOIN pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
        JOIN pg_am AS access_method ON access_method.oid = index_relation.relam
        WHERE namespace.nspname = 'public'
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint AS constraint_record
            WHERE constraint_record.conindid = index_record.indexrelid
          )
        ORDER BY index_relation.relname
      `
    );
    requireMatch(
      "explicit index inventory",
      indexes.rows.map(
        ({ name, tableName, method, unique, keys, directions, attributeCount, keyCount, predicate }) => ({
          name,
          table: tableName,
          keys,
          directions,
          predicate,
          method,
          unique,
          attributeCount,
          keyCount
        })
      ),
      expectedExplicitIndexes.map((index) => ({
        ...index,
        method: "btree",
        unique: false,
        attributeCount: index.keys.length,
        keyCount: index.keys.length
      }))
    );

    const propertyTypes = await client.query<LookupRow>("SELECT code, label FROM property_types ORDER BY code");
    requireMatch(
      "property type seed inventory",
      propertyTypes.rows.map(({ code, label }) => [code, label]),
      expectedPropertyTypes
    );

    const amenities = await client.query<LookupRow>("SELECT code, label FROM amenities ORDER BY code");
    requireMatch(
      "amenity seed inventory",
      amenities.rows.map(({ code, label }) => [code, label]),
      expectedAmenities
    );

    const prohibitedObjects = await client.query<ProhibitedObjectRow>(
      `
        SELECT
          (
            SELECT count(*)::integer
            FROM pg_trigger AS trigger_record
            JOIN pg_class AS relation ON relation.oid = trigger_record.tgrelid
            JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND NOT trigger_record.tgisinternal
          ) AS "triggerCount",
          (
            SELECT count(*)::integer
            FROM pg_proc AS routine
            JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
            WHERE namespace.nspname = 'public'
              AND routine.prokind IN ('f', 'p')
          ) AS "routineCount",
          (
            SELECT count(*)::integer
            FROM pg_extension
            WHERE extname = 'postgis'
          ) AS "postgisExtensionCount"
      `
    );
    requireMatch("prohibited object inventory", prohibitedObjects.rows, [
      { triggerCount: 0, routineCount: 0, postgisExtensionCount: 0 }
    ]);

    await client.query("COMMIT");
    return {
      enumCount: 2,
      tableCount: 8,
      constraintCount: 52,
      explicitIndexCount: 10,
      propertyTypeCount: 5,
      amenityCount: 12
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        throw new SchemaVerificationError(["read-only transaction cleanup failed"]);
      }
    }

    if (error instanceof SchemaVerificationError) {
      throw error;
    }

    throw new SchemaVerificationError(["database catalogs could not be verified"]);
  } finally {
    client.release();
  }
}
