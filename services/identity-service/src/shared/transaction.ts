import type { SqlExecutor } from "../../../shared/src/runtime/db/sql-executor.js";

export type TransactionRunner = <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
