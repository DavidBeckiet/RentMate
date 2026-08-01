import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createUsersRepository } from "../src/modules/users/users-repository.js";
import type { SqlExecutor } from "../src/db/sql-executor.js";

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

const profileRow = {
  id: 17,
  role: "LANDLORD" as const,
  email: "landlord@example.com",
  phone_e164: "+84901234567",
  is_active: true,
  created_at: new Date("2030-01-01T00:00:00.000Z"),
  updated_at: new Date("2030-01-02T00:00:00.000Z")
};

describe("RM-017 users repository", () => {
  it("loads only the minimal authentication account projection", async () => {
    const query = vi.fn().mockResolvedValue(result([{ id: 17, role: "TENANT", is_active: true }]));
    const repository = createUsersRepository({ query } as unknown as SqlExecutor);

    await expect(repository.findAuthenticationAccountById(17)).resolves.toStrictEqual({
      id: 17,
      role: "TENANT",
      isActive: true
    });

    const statement = query.mock.calls[0][0] as { text: string; values: unknown[] };
    const normalized = statement.text.replace(/\s+/g, " ");
    expect(normalized).toContain("SELECT id, role, is_active FROM users WHERE id = $1 LIMIT 1");
    expect(normalized).not.toMatch(/email|phone|password_hash|created_at|updated_at/);
    expect(statement.values).toEqual([17]);
  });

  it("returns null for a missing authentication account", async () => {
    const query = vi.fn().mockResolvedValue(result([]));
    const repository = createUsersRepository({ query } as unknown as SqlExecutor);

    await expect(repository.findAuthenticationAccountById(99)).resolves.toBeNull();
  });

  it("requires an active row and maps an explicit safe profile", async () => {
    const query = vi.fn().mockResolvedValue(result([profileRow]));
    const repository = createUsersRepository({ query } as unknown as SqlExecutor);

    const profile = await repository.findProfileById(17);

    expect(profile).toStrictEqual({
      id: 17,
      role: "LANDLORD",
      email: "landlord@example.com",
      phone: "+84901234567",
      isActive: true,
      createdAt: profileRow.created_at,
      updatedAt: profileRow.updated_at
    });
    expect(Object.isFrozen(profile)).toBe(true);

    const statement = query.mock.calls[0][0] as { text: string; values: unknown[] };
    const normalized = statement.text.replace(/\s+/g, " ");
    expect(normalized).toContain(
      "SELECT id, role, email, phone_e164, is_active, created_at, updated_at FROM users WHERE id = $1 AND is_active = true LIMIT 1"
    );
    expect(normalized).not.toContain("password_hash");
    expect(statement.values).toEqual([17]);
  });

  it("returns null for a missing active profile", async () => {
    const query = vi.fn().mockResolvedValue(result([]));
    const repository = createUsersRepository({ query } as unknown as SqlExecutor);

    await expect(repository.findProfileById(17)).resolves.toBeNull();
  });

  it("updates a changed phone with a null-safe conditional statement", async () => {
    const query = vi.fn().mockResolvedValue(result([{ ...profileRow, phone_e164: "+84981112223" }]));
    const repository = createUsersRepository({ query } as unknown as SqlExecutor);

    await expect(repository.updatePhone(17, "+84981112223")).resolves.toStrictEqual({
      id: 17,
      role: "LANDLORD",
      email: "landlord@example.com",
      phone: "+84981112223",
      isActive: true,
      createdAt: profileRow.created_at,
      updatedAt: profileRow.updated_at
    });

    const statement = query.mock.calls[0][0] as { text: string; values: unknown[] };
    const normalized = statement.text.replace(/\s+/g, " ");
    expect(normalized).toContain("UPDATE users SET phone_e164 = $2, updated_at = CURRENT_TIMESTAMP");
    expect(normalized).toContain("AND phone_e164 IS DISTINCT FROM $2");
    expect(normalized).toContain("RETURNING id, role, email, phone_e164, is_active, created_at, updated_at");
    expect(normalized).not.toMatch(/password_hash|phone_e164\s*=\s*\$1/);
    expect(statement.values).toEqual([17, "+84981112223"]);
  });

  it("falls back to the active profile after a no-op update", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([profileRow]));
    const repository = createUsersRepository({ query } as unknown as SqlExecutor);

    await expect(repository.updatePhone(17, profileRow.phone_e164)).resolves.toStrictEqual({
      id: 17,
      role: "LANDLORD",
      email: "landlord@example.com",
      phone: "+84901234567",
      isActive: true,
      createdAt: profileRow.created_at,
      updatedAt: profileRow.updated_at
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect((query.mock.calls[1][0] as { text: string }).text).toContain("AND is_active = true");
  });

  it.each(["missing", "inactive"] as const)("returns null when fallback profile is %s", async () => {
    const query = vi.fn().mockResolvedValueOnce(result([])).mockResolvedValueOnce(result([]));
    const repository = createUsersRepository({ query } as unknown as SqlExecutor);

    await expect(repository.updatePhone(17, null)).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("never emits raw database names or dynamic SQL fields", async () => {
    const query = vi.fn().mockResolvedValue(result([profileRow]));
    const repository = createUsersRepository({ query } as unknown as SqlExecutor);
    await repository.findProfileById(17);

    const statement = query.mock.calls[0][0] as { text: string };
    expect(statement.text).not.toContain("SELECT *");
    expect(statement.text).not.toMatch(/password_hash|\$\{.*\}|\+\s*field/i);
  });
});
