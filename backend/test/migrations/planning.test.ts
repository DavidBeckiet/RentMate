import { describe, expect, it } from "vitest";
import { createMigrationPlan, parseDeploymentVersionRecord } from "../../src/db/migrations/planning.js";
import { MigrationPlanError, type MigrationFile } from "../../src/db/migrations/types.js";

function migration(version: number, description: string): MigrationFile {
  const prefix = String(version).padStart(4, "0");
  return {
    version,
    filename: `${prefix}_${description}.sql`,
    path: `C:\\verification-only\\${prefix}_${description}.sql`
  };
}

const inventory = [migration(3, "third"), migration(1, "first"), migration(2, "second")];

describe("migration planning", () => {
  it("selects every migration in order for a clean deployment", () => {
    const plan = createMigrationPlan("clean", inventory);

    expect(plan.appliedVersion).toBeNull();
    expect(plan.highestRepositoryVersion).toBe(3);
    expect(plan.migrations.map(({ version }) => version)).toStrictEqual([1, 2, 3]);
  });

  it("allows an empty clean migration inventory", () => {
    expect(createMigrationPlan("clean", [])).toStrictEqual({
      mode: "clean",
      appliedVersion: null,
      highestRepositoryVersion: null,
      migrations: []
    });
  });

  it("selects only versions newer than an external record", () => {
    const plan = createMigrationPlan("existing", inventory, { appliedVersion: 1 });

    expect(plan.migrations.map(({ version }) => version)).toStrictEqual([2, 3]);
  });

  it("returns an empty existing-deployment plan at the latest version", () => {
    const plan = createMigrationPlan("existing", inventory, { appliedVersion: 3 });

    expect(plan.migrations).toStrictEqual([]);
  });

  it("rejects a missing external record", () => {
    expect(() => createMigrationPlan("existing", inventory)).toThrowError(
      "requires an explicit deployment version record"
    );
  });

  it.each([
    [{}, "must contain only"],
    [{ appliedVersion: 0 }, "positive integer"],
    [{ appliedVersion: -1 }, "positive integer"],
    [{ appliedVersion: 1.5 }, "positive integer"],
    [{ appliedVersion: "1" }, "positive integer"],
    [{ appliedVersion: 1, extra: true }, "must contain only"]
  ])("rejects invalid external records", (record, expectedMessage) => {
    expect(() => parseDeploymentVersionRecord(record)).toThrowError(expectedMessage);
  });

  it("rejects a version newer than the repository", () => {
    expect(() => createMigrationPlan("existing", inventory, { appliedVersion: 4 })).toThrowError(
      "newer than the repository"
    );
  });

  it("rejects an external version missing from the repository inventory", () => {
    const inventoryWithGap = [migration(1, "first"), migration(3, "third")];

    expect(() => createMigrationPlan("existing", inventoryWithGap, { appliedVersion: 2 })).toThrowError(
      "does not reference a repository migration"
    );
  });

  it("rejects existing mode against an empty repository", () => {
    expect(() => createMigrationPlan("existing", [], { appliedVersion: 1 })).toThrowError(
      "cannot reference an empty migration inventory"
    );
  });

  it("does not read or execute SQL while planning", () => {
    const plan = createMigrationPlan("clean", [
      {
        ...migration(1, "invalid_sql_is_not_read"),
        path: "C:\\path-that-does-not-exist\\0001_invalid_sql_is_not_read.sql"
      }
    ]);

    expect(plan.migrations).toHaveLength(1);
  });

  it("rejects a deployment record in clean mode", () => {
    expect(() => createMigrationPlan("clean", inventory, { appliedVersion: 1 })).toThrowError(MigrationPlanError);
  });
});
