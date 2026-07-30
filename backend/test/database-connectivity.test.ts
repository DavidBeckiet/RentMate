import dotenv from "dotenv";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTestDatabasePool, readTestDatabaseUrl } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

describe("disposable PostgreSQL test database", () => {
  it("connects only through the explicit test database configuration", async () => {
    const expectedDatabaseName = decodeURIComponent(new URL(readTestDatabaseUrl()).pathname.slice(1));
    const pool = createTestDatabasePool();

    try {
      const result = await pool.query<{ databaseName: string; value: number }>(
        'SELECT current_database() AS "databaseName", 1 AS value'
      );
      expect(result.rows).toStrictEqual([
        {
          databaseName: expectedDatabaseName,
          value: 1
        }
      ]);
    } finally {
      await pool.end();
    }
  });
});
