import { hash } from "bcrypt";
import type { Pool, QueryResultRow } from "pg";
import type { AdminProvisioningInput } from "./input.js";

interface ExistingUserRow extends QueryResultRow {
  readonly id: number;
  readonly role: "TENANT" | "LANDLORD" | "ADMIN";
  readonly isActive: boolean;
}

interface InsertedUserRow extends QueryResultRow {
  readonly id: number;
}

export interface AdminProvisioningResult {
  readonly outcome: "created" | "already-provisioned";
  readonly userId: number;
}

export class AdminProvisioningConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminProvisioningConflictError";
  }
}

export class AdminProvisioningError extends Error {
  constructor() {
    super("Admin provisioning failed.");
    this.name = "AdminProvisioningError";
  }
}

export type PasswordHasher = (password: string, bcryptCost: number) => Promise<string>;

export async function provisionAdmin(
  pool: Pick<Pool, "connect">,
  input: AdminProvisioningInput,
  passwordHasher: PasswordHasher = hash
): Promise<AdminProvisioningResult> {
  const passwordHash = await passwordHasher(input.password, input.bcryptCost);
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const inserted = await client.query<InsertedUserRow>(
      `
        INSERT INTO users (role, email, phone_e164, password_hash, is_active)
        VALUES ('ADMIN', $1, $2, $3, true)
        ON CONFLICT (email) DO NOTHING
        RETURNING id
      `,
      [input.email, input.phoneE164, passwordHash]
    );

    const createdUser = inserted.rows[0];
    if (createdUser) {
      await client.query("COMMIT");
      return {
        outcome: "created",
        userId: createdUser.id
      };
    }

    const existing = await client.query<ExistingUserRow>(
      `
        SELECT id, role, is_active AS "isActive"
        FROM users
        WHERE email = $1
        FOR UPDATE
      `,
      [input.email]
    );
    const existingUser = existing.rows[0];

    if (!existingUser) {
      throw new AdminProvisioningError();
    }

    if (existingUser.role !== "ADMIN") {
      throw new AdminProvisioningConflictError(
        "The normalized admin email is already assigned to a non-admin account."
      );
    }

    if (!existingUser.isActive) {
      throw new AdminProvisioningConflictError(
        "An inactive admin already exists and requires a separate authorized activation process."
      );
    }

    await client.query("COMMIT");
    return {
      outcome: "already-provisioned",
      userId: existingUser.id
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        throw new AdminProvisioningError();
      }
    }

    if (error instanceof AdminProvisioningConflictError || error instanceof AdminProvisioningError) {
      throw error;
    }

    throw new AdminProvisioningError();
  } finally {
    client.release();
  }
}
