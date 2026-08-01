import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { SqlExecutor } from "../src/db/sql-executor.js";
import { createAuthRepository } from "../src/modules/auth/auth-repository.js";

function result<T extends QueryResultRow>(rows: T[], command = "SELECT"): QueryResult<T> {
  return { command, rowCount: rows.length, oid: 0, fields: [], rows };
}

const loginRow = {
  id: 31,
  role: "LANDLORD" as const,
  email: "landlord@example.com",
  phone_e164: "+84901234567",
  password_hash: "stored-password-hash-sentinel",
  is_active: true,
  created_at: "2030-01-01T00:00:00.000Z",
  updated_at: new Date("2030-01-02T00:00:00.000Z")
};

describe("RM-016 auth repository login lookup", () => {
  it("uses one normalized-email parameter and explicitly maps the narrow read projection", async () => {
    const query = vi.fn().mockResolvedValue(result([loginRow]));
    const repository = createAuthRepository({ query } as unknown as SqlExecutor);

    const account = await repository.findLoginAccount("landlord@example.com");

    expect(query).toHaveBeenCalledOnce();
    const statement = query.mock.calls[0][0] as { text: string; values: unknown[] };
    const sql = statement.text.replace(/\s+/g, " ").trim();
    expect(sql).toBe(
      "SELECT id, role, email, phone_e164, password_hash, is_active, created_at, updated_at FROM users WHERE email = $1 LIMIT 1"
    );
    expect(statement.values).toStrictEqual(["landlord@example.com"]);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/);
    expect(sql).not.toContain("landlord@example.com");
    expect(account).toStrictEqual({
      id: 31,
      role: "LANDLORD",
      email: "landlord@example.com",
      phone: "+84901234567",
      passwordHash: "stored-password-hash-sentinel",
      isActive: true,
      createdAt: new Date("2030-01-01T00:00:00.000Z"),
      updatedAt: loginRow.updated_at
    });
    expect(account).not.toHaveProperty("phone_e164");
    expect(account).not.toHaveProperty("password_hash");
    expect(account).not.toHaveProperty("created_at");
    expect(Object.isFrozen(account)).toBe(true);
  });

  it("returns null when the normalized email is absent", async () => {
    const query = vi.fn().mockResolvedValue(result([]));
    const repository = createAuthRepository({ query } as unknown as SqlExecutor);

    await expect(repository.findLoginAccount("missing@example.com")).resolves.toBeNull();
  });

  it("preserves the existing parameterized createUser operation", async () => {
    const createdRow = {
      id: 32,
      role: "TENANT" as const,
      email: "tenant@example.com",
      phone_e164: null,
      is_active: true,
      created_at: new Date("2030-01-01T00:00:00.000Z"),
      updated_at: new Date("2030-01-01T00:00:00.000Z")
    };
    const query = vi.fn().mockResolvedValue(result([createdRow], "INSERT"));
    const repository = createAuthRepository({ query } as unknown as SqlExecutor);

    await repository.createUser({
      role: "TENANT",
      email: "tenant@example.com",
      phone: null,
      passwordHash: "new-password-hash-sentinel"
    });

    const statement = query.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(statement.text).toContain("INSERT INTO users");
    expect(statement.values).toStrictEqual(["TENANT", "tenant@example.com", null, "new-password-hash-sentinel"]);
  });
});
