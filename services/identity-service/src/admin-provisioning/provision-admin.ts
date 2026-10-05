import type { createPostgresPool } from "../../../shared/src/runtime/db/pool.js";
import type { PasswordService } from "../modules/auth/password.js";
import type { AdminProvisioningInput } from "./input.js";

type AdminProvisioningPool = Pick<ReturnType<typeof createPostgresPool>, "connect">;

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

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function existingUser(
  value: unknown
): { readonly id: number; readonly role: string; readonly isActive: boolean } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = positiveInteger(row.id);
  if (id === null || typeof row.role !== "string" || typeof row.isActive !== "boolean") return null;
  return { id, role: row.role, isActive: row.isActive };
}

export async function provisionAdmin(
  pool: AdminProvisioningPool,
  passwordService: Pick<PasswordService, "hashPassword">,
  input: AdminProvisioningInput
): Promise<AdminProvisioningResult> {
  const passwordHash = await passwordService.hashPassword(input.password);
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query({ text: "BEGIN", values: [] });
    transactionStarted = true;
    const inserted = await client.query({
      text: `
        INSERT INTO users (role, email, phone_e164, password_hash, is_active)
        VALUES ('ADMIN', $1, $2, $3, true)
        ON CONFLICT (email) DO NOTHING
        RETURNING id
      `,
      values: [input.email, input.phone, passwordHash]
    });
    const insertedId = positiveInteger(inserted.rows[0]?.id);
    if (insertedId !== null) {
      await client.query({ text: "COMMIT", values: [] });
      return Object.freeze({ outcome: "created", userId: insertedId });
    }

    const selected = await client.query({
      text: `
        SELECT id, role, is_active AS "isActive"
        FROM users
        WHERE email = $1
        FOR UPDATE
      `,
      values: [input.email]
    });
    const current = existingUser(selected.rows[0]);
    if (!current || selected.rows.length !== 1) throw new AdminProvisioningError();
    if (current.role !== "ADMIN") {
      throw new AdminProvisioningConflictError("The admin email is already assigned to a non-admin account.");
    }
    if (!current.isActive) {
      throw new AdminProvisioningConflictError(
        "An inactive admin already exists and requires the authorized activation flow."
      );
    }

    await client.query({ text: "COMMIT", values: [] });
    return Object.freeze({ outcome: "already-provisioned", userId: current.id });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query({ text: "ROLLBACK", values: [] });
      } catch {
        throw new AdminProvisioningError();
      }
    }
    if (error instanceof AdminProvisioningConflictError || error instanceof AdminProvisioningError) throw error;
    throw new AdminProvisioningError();
  } finally {
    client.release();
  }
}
