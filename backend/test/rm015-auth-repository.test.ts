import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createAuthRepository, RegistrationEmailAlreadyExistsError } from "../src/modules/auth/auth-repository.js";
import type { SqlExecutor } from "../src/db/sql-executor.js";

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { command: "INSERT", rowCount: rows.length, oid: 0, fields: [], rows };
}

const createdRow = {
  id: 17,
  role: "TENANT" as const,
  email: "tenant@example.com",
  phone_e164: null,
  is_active: true,
  created_at: new Date("2030-01-01T00:00:00.000Z"),
  updated_at: new Date("2030-01-01T00:00:00.000Z")
};

describe("RM-015 auth repository", () => {
  it("inserts a narrow user projection with parameterized values", async () => {
    const query = vi.fn().mockResolvedValue(result([createdRow]));
    const repository = createAuthRepository({ query } as unknown as SqlExecutor);

    const user = await repository.createUser({
      role: "TENANT",
      email: "tenant@example.com",
      phone: null,
      passwordHash: "fake-rm015-bcrypt-hash"
    });

    expect(query).toHaveBeenCalledOnce();
    const statement = query.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(statement.text).toContain("INSERT INTO users");
    expect(statement.text.replace(/\s+/g, " ")).toContain(
      "RETURNING id, role, email, phone_e164, is_active, created_at, updated_at"
    );
    expect(statement.values).toEqual(["TENANT", "tenant@example.com", null, "fake-rm015-bcrypt-hash"]);
    expect(user).toStrictEqual({
      id: 17,
      role: "TENANT",
      email: "tenant@example.com",
      phone: null,
      isActive: true,
      createdAt: createdRow.created_at,
      updatedAt: createdRow.updated_at
    });
    expect(Object.isFrozen(user)).toBe(true);
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("maps only the exact users email constraint to the domain duplicate error", async () => {
    const duplicate = { code: "23505", constraint: "uq_users_email" };
    const query = vi.fn().mockRejectedValue(duplicate);
    const repository = createAuthRepository({ query } as unknown as SqlExecutor);

    await expect(
      repository.createUser({ role: "TENANT", email: "duplicate@example.com", phone: null, passwordHash: "hash" })
    ).rejects.toBeInstanceOf(RegistrationEmailAlreadyExistsError);

    for (const error of [
      { code: "23505", constraint: "other_constraint" },
      { code: "23503", constraint: "uq_users_email" },
      { code: "23505" }
    ]) {
      query.mockRejectedValueOnce(error);
      await expect(
        repository.createUser({ role: "TENANT", email: "duplicate@example.com", phone: null, passwordHash: "hash" })
      ).rejects.toBe(error);
    }
  });
});
