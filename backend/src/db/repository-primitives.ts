import type { QueryResultRow } from "pg";
import type { ParameterizedQuery, SqlExecutor } from "./sql-executor.js";

export class RepositoryInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryInvariantError";
  }
}

type RowMapper<Row extends QueryResultRow, Value> = (row: Row) => Value;

function identity<Row extends QueryResultRow>(row: Row): Row {
  return row;
}

export function queryMany<Row extends QueryResultRow>(executor: SqlExecutor, query: ParameterizedQuery): Promise<Row[]>;
export function queryMany<Row extends QueryResultRow, Value>(
  executor: SqlExecutor,
  query: ParameterizedQuery,
  mapper: RowMapper<Row, Value>
): Promise<Value[]>;
export async function queryMany<Row extends QueryResultRow, Value = Row>(
  executor: SqlExecutor,
  query: ParameterizedQuery,
  mapper: RowMapper<Row, Value> = identity as RowMapper<Row, Value>
): Promise<Value[]> {
  const result = await executor.query<Row>(query);
  return result.rows.map(mapper);
}

export function queryOptional<Row extends QueryResultRow>(
  executor: SqlExecutor,
  query: ParameterizedQuery
): Promise<Row | null>;
export function queryOptional<Row extends QueryResultRow, Value>(
  executor: SqlExecutor,
  query: ParameterizedQuery,
  mapper: RowMapper<Row, Value>
): Promise<Value | null>;
export async function queryOptional<Row extends QueryResultRow, Value = Row>(
  executor: SqlExecutor,
  query: ParameterizedQuery,
  mapper: RowMapper<Row, Value> = identity as RowMapper<Row, Value>
): Promise<Value | null> {
  const result = await executor.query<Row>(query);

  if (result.rows.length === 0) {
    return null;
  }

  if (result.rows.length !== 1) {
    throw new RepositoryInvariantError("Optional repository query returned more than one row.");
  }

  return mapper(result.rows[0]);
}

export function queryExactlyOne<Row extends QueryResultRow>(
  executor: SqlExecutor,
  query: ParameterizedQuery
): Promise<Row>;
export function queryExactlyOne<Row extends QueryResultRow, Value>(
  executor: SqlExecutor,
  query: ParameterizedQuery,
  mapper: RowMapper<Row, Value>
): Promise<Value>;
export async function queryExactlyOne<Row extends QueryResultRow, Value = Row>(
  executor: SqlExecutor,
  query: ParameterizedQuery,
  mapper: RowMapper<Row, Value> = identity as RowMapper<Row, Value>
): Promise<Value> {
  const result = await executor.query<Row>(query);

  if (result.rows.length !== 1) {
    throw new RepositoryInvariantError("Required repository query did not return exactly one row.");
  }

  return mapper(result.rows[0]);
}

export async function executeCommand(executor: SqlExecutor, query: ParameterizedQuery): Promise<number> {
  const result = await executor.query(query);

  if (result.rowCount === null) {
    throw new RepositoryInvariantError("Repository command did not report an affected-row count.");
  }

  return result.rowCount;
}
