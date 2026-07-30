import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../src/shared/logging/logger.js";
import { createShutdownHandler, type HttpServerCloser } from "../src/shutdown.js";

function createLoggerMock(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

class FakeHttpServer implements HttpServerCloser {
  closeCount = 0;

  constructor(private readonly closeOrder: string[]) {}

  close(callback: (error?: Error) => void): void {
    this.closeCount += 1;
    this.closeOrder.push("http");
    callback();
  }
}

describe("createShutdownHandler", () => {
  it("closes HTTP before PostgreSQL and reuses one shutdown operation", async () => {
    const closeOrder: string[] = [];
    const server = new FakeHttpServer(closeOrder);
    const closeDatabase = vi.fn(async () => {
      closeOrder.push("database");
    });
    const shutdown = createShutdownHandler({
      server,
      closeDatabase,
      logger: createLoggerMock()
    });

    const firstCall = shutdown("SIGTERM");
    const repeatedCall = shutdown("SIGINT");

    expect(repeatedCall).toBe(firstCall);
    await Promise.all([firstCall, repeatedCall]);

    expect(closeOrder).toStrictEqual(["http", "database"]);
    expect(server.closeCount).toBe(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });
});
