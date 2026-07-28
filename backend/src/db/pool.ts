import { Pool } from "pg";
import { env } from "../config/env.js";

export const databasePool = new Pool(env.database);

export async function checkDatabaseConnection(): Promise<void> {
  await databasePool.query("SELECT 1");
}
