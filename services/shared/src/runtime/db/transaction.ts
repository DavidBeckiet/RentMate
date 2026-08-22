import type { Pool, QueryResultRow } from "pg";
import type { Logger } from "../shared/logging/logger.js";
import { createSqlExecutor, type ParameterizedQuery, type SqlExecutor } from "./sql-executor.js";

const beginQuery: ParameterizedQuery = {
  text: "BEGIN",
  values: []
};
const commitQuery: ParameterizedQuery = {
  text: "COMMIT",
  values: []
};
const rollbackQuery: ParameterizedQuery = {
  text: "ROLLBACK",
  values: []
};

export async function withTransaction<Value>(
  pool: Pick<Pool, "connect">,
  logger: Pick<Logger, "error">,
  operation: (transaction: SqlExecutor) => Promise<Value>
): Promise<Value> {
  const client = await pool.connect();
  const transaction = createSqlExecutor(client);
  let transactionStarted = false;

  try {
    await transaction.query<QueryResultRow>(beginQuery);
    transactionStarted = true;

    const result = await operation(transaction);
    await transaction.query<QueryResultRow>(commitQuery);
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await transaction.query<QueryResultRow>(rollbackQuery);
      } catch (rollbackError) {
        logger.error("PostgreSQL transaction rollback failed", {
          errorType: rollbackError instanceof Error ? rollbackError.name : "UnknownError"
        });
      }
    }

    throw error;
  } finally {
    client.release();
  }
}
