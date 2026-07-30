import type { Logger } from "./shared/logging/logger.js";

export interface HttpServerCloser {
  close(callback: (error?: Error) => void): void;
}

export interface ShutdownDependencies {
  readonly server: HttpServerCloser;
  readonly closeDatabase: () => Promise<void>;
  readonly logger: Logger;
}

function closeHttpServer(server: HttpServerCloser): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export function createShutdownHandler(dependencies: ShutdownDependencies): (signal: NodeJS.Signals) => Promise<void> {
  let shutdownPromise: Promise<void> | undefined;

  return (signal: NodeJS.Signals): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      let failed = false;

      dependencies.logger.info("Backend shutdown started", { signal });

      try {
        await closeHttpServer(dependencies.server);
      } catch {
        failed = true;
        dependencies.logger.error("HTTP server shutdown failed");
      }

      try {
        await dependencies.closeDatabase();
      } catch {
        failed = true;
        dependencies.logger.error("PostgreSQL pool shutdown failed");
      }

      if (failed) {
        throw new Error("Backend shutdown failed");
      }

      dependencies.logger.info("Backend shutdown completed", { signal });
    })();

    return shutdownPromise;
  };
}
