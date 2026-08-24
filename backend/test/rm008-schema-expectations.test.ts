import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import {
  expectedAmenities,
  expectedColumnSignatures,
  expectedEnumTypes,
  expectedExplicitIndexes,
  expectedForeignKeys,
  expectedKeyConstraints,
  expectedNamedConstraints,
  expectedProductTables,
  expectedPropertyTypes,
  highestExpectedMigrationVersion
} from "../src/db/schema-verification/expected-schema.js";

const migrationDirectory = path.resolve(process.cwd(), "migrations");

describe("RM-008 final schema expectations", () => {
  it("defines exactly two enums with the frozen ordered labels", () => {
    expect(expectedEnumTypes).toStrictEqual([
      {
        name: "listing_status",
        labels: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"]
      },
      {
        name: "user_role",
        labels: ["TENANT", "LANDLORD", "ADMIN"]
      }
    ]);
  });

  it("defines exactly eight product tables and their 53 frozen columns", () => {
    expect(expectedProductTables).toStrictEqual([
      "amenities",
      "favorites",
      "listing_amenities",
      "listing_images",
      "listings",
      "moderation_history",
      "property_types",
      "users"
    ]);
    expect(expectedColumnSignatures).toHaveLength(53);
  });

  it("defines exactly 52 named constraints in the frozen categories", () => {
    expect(expectedNamedConstraints).toHaveLength(52);
    expect(expectedNamedConstraints.filter(([, , type]) => type === "p")).toHaveLength(8);
    expect(expectedNamedConstraints.filter(([, , type]) => type === "f")).toHaveLength(9);
    expect(expectedNamedConstraints.filter(([, , type]) => type === "u")).toHaveLength(7);
    expect(expectedNamedConstraints.filter(([, , type]) => type === "c")).toHaveLength(28);
    expect(expectedForeignKeys).toHaveLength(9);
    expect(expectedKeyConstraints).toHaveLength(15);
  });

  it("defines exactly ten B-tree index shapes with five approved-status partial predicates", () => {
    expect(expectedExplicitIndexes).toHaveLength(10);
    expect(expectedExplicitIndexes.filter(({ predicate }) => predicate !== null)).toHaveLength(5);
    expect(
      expectedExplicitIndexes
        .filter(({ predicate }) => predicate !== null)
        .every(({ predicate }) => predicate === "(status = 'APPROVED'::listing_status)")
    ).toBe(true);
  });

  it("defines exactly five property types and twelve amenities without fixed identities", () => {
    expect(expectedPropertyTypes).toHaveLength(5);
    expect(expectedAmenities).toHaveLength(12);
    expect(expectedPropertyTypes.every((row) => row.length === 2)).toBe(true);
    expect(expectedAmenities.every((row) => row.length === 2)).toBe(true);
  });

  it("expects migrations to end exactly at committed version 0012", async () => {
    const migrations = await discoverMigrations(migrationDirectory);

    expect(highestExpectedMigrationVersion).toBe(12);
    expect(migrations.map(({ version }) => version)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(migrations.some(({ version }) => version > 12)).toBe(false);
  });
});
