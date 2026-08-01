import { Pool } from "pg";

const testDatabaseNamePattern = /^rentmate_test(?:_[a-z0-9]+)*$/;

export class TestDatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestDatabaseConfigurationError";
  }
}

export function readTestDatabaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  const value = source.TEST_DATABASE_URL?.trim();

  if (!value) {
    throw new TestDatabaseConfigurationError("TEST_DATABASE_URL is required for database tests");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TestDatabaseConfigurationError("TEST_DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new TestDatabaseConfigurationError("TEST_DATABASE_URL must use the PostgreSQL protocol");
  }

  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  const developmentDatabaseName = source.DB_NAME?.trim() || "rentmate";

  if (!parsed.hostname || !parsed.username || !databaseName) {
    throw new TestDatabaseConfigurationError("TEST_DATABASE_URL must include a host, user, and database name");
  }

  if (!testDatabaseNamePattern.test(databaseName)) {
    throw new TestDatabaseConfigurationError("The test database name must start with rentmate_test");
  }

  if (databaseName === developmentDatabaseName) {
    throw new TestDatabaseConfigurationError("TEST_DATABASE_URL must not target the configured development database");
  }

  return value;
}

export function createTestDatabasePool(
  source: NodeJS.ProcessEnv = process.env,
  options: Readonly<{ max?: number }> = {}
): Pool {
  return new Pool({
    connectionString: readTestDatabaseUrl(source),
    connectionTimeoutMillis: 5_000,
    max: options.max ?? 1
  });
}
