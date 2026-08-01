import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { BackendConfig } from "../src/config/env.js";
import {
  DatabaseConnectionError,
  buildPostgresPoolConfig,
  checkDatabaseConnection,
  createPostgresPool,
  createRuntimePoolManager
} from "../src/db/pool.js";
import type { Logger } from "../src/shared/logging/logger.js";

const databaseConfig: BackendConfig["database"] = {
  host: "postgres.internal",
  port: 5432,
  database: "rentmate",
  user: "rentmate_app",
  password: "private-database-password",
  max: 12,
  connectionTimeoutMillis: 4321,
  idleTimeoutMillis: 23456
};

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function fakePool(): Pool & { end: ReturnType<typeof vi.fn> } {
  return {
    end: vi.fn().mockResolvedValue(undefined)
  } as unknown as Pool & { end: ReturnType<typeof vi.fn> };
}

describe("RM-009 PostgreSQL pool conventions", () => {
  it("builds explicit validated pool settings, application name, and synchronous UTC startup option", () => {
    expect(buildPostgresPoolConfig(databaseConfig)).toEqual({
      host: "postgres.internal",
      port: 5432,
      database: "rentmate",
      user: "rentmate_app",
      password: "private-database-password",
      max: 12,
      connectionTimeoutMillis: 4321,
      idleTimeoutMillis: 23456,
      application_name: "rentmate-backend",
      options: "-c timezone=UTC"
    });
  });

  it("does not create a runtime pool until first access and reuses exactly one pool", () => {
    const pool = fakePool();
    const factory = vi.fn(() => pool);
    const manager = createRuntimePoolManager(factory);

    expect(factory).not.toHaveBeenCalled();
    expect(manager.getPool(databaseConfig, silentLogger)).toBe(pool);
    expect(manager.getPool(databaseConfig, silentLogger)).toBe(pool);
    expect(factory).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledWith(databaseConfig, silentLogger);
  });

  it("keeps independently owned pool managers independent", () => {
    const firstPool = fakePool();
    const secondPool = fakePool();
    const firstManager = createRuntimePoolManager(() => firstPool);
    const secondManager = createRuntimePoolManager(() => secondPool);

    expect(firstManager.getPool(databaseConfig, silentLogger)).toBe(firstPool);
    expect(secondManager.getPool(databaseConfig, silentLogger)).toBe(secondPool);
    expect(firstPool).not.toBe(secondPool);
  });

  it("guards repeated close calls with one shared close operation", async () => {
    const pool = fakePool();
    const manager = createRuntimePoolManager(() => pool);
    manager.getPool(databaseConfig, silentLogger);

    const firstClose = manager.close();
    const secondClose = manager.close();

    expect(secondClose).toBe(firstClose);
    await expect(firstClose).resolves.toBeUndefined();
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it("sanitizes connection failures", async () => {
    const secretUrl = "postgresql://user:secret@external.example/rentmate";
    const query = vi.fn().mockRejectedValue(new Error(secretUrl));

    await expect(checkDatabaseConnection({ query } as never)).rejects.toEqual(
      expect.objectContaining({
        name: "DatabaseConnectionError",
        message: "PostgreSQL connection failed."
      })
    );

    try {
      await checkDatabaseConnection({ query } as never);
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseConnectionError);
      expect(String(error)).not.toContain(secretUrl);
    }
  });

  it("creates an owned pool without opening a connection at factory time", async () => {
    const pool = createPostgresPool(databaseConfig, silentLogger);

    expect(pool.totalCount).toBe(0);
    await pool.end();
  });
});
