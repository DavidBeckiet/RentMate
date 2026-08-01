import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

export interface ParameterizedQuery {
  readonly text: string;
  readonly values: readonly unknown[];
}

export interface SqlExecutor {
  query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>>;
}

type PgQueryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export function createSqlExecutor(queryable: PgQueryable): SqlExecutor {
  return {
    query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
      return queryable.query<Row, unknown[]>({
        text: query.text,
        values: [...query.values]
      });
    }
  };
}
