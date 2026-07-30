import { describe, expect, it } from "vitest";
import { readTestDatabaseUrl, TestDatabaseConfigurationError } from "./support/test-database.js";

describe("test database configuration", () => {
  it("requires an explicit TEST_DATABASE_URL", () => {
    expect(() => readTestDatabaseUrl({})).toThrowError(TestDatabaseConfigurationError);
  });

  it("rejects the development database", () => {
    expect(() =>
      readTestDatabaseUrl({
        DB_NAME: "rentmate_test",
        TEST_DATABASE_URL: "postgresql://rentmate:password@localhost:5432/rentmate_test"
      })
    ).toThrowError("must not target the configured development database");
  });

  it("rejects a database outside the test-only namespace", () => {
    expect(() =>
      readTestDatabaseUrl({
        DB_NAME: "rentmate",
        TEST_DATABASE_URL: "postgresql://rentmate:password@localhost:5432/rentmate"
      })
    ).toThrowError("must start with rentmate_test");
  });

  it("accepts an explicitly separate test database", () => {
    const url = "postgresql://rentmate:password@localhost:5432/rentmate_test_smoke";

    expect(
      readTestDatabaseUrl({
        DB_NAME: "rentmate",
        TEST_DATABASE_URL: url
      })
    ).toBe(url);
  });
});
