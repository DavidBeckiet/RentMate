import cors from "cors";
import express from "express";
import type { Logger } from "./shared/logging/logger.js";
import { unexpectedErrorHandler } from "./shared/middleware/error-handler.js";
import { requestIdMiddleware } from "./shared/middleware/request-id.js";
import { requestLoggerMiddleware } from "./shared/middleware/request-logger.js";

export interface AppDependencies {
  readonly frontendOrigin: string;
  readonly logger: Logger;
  readonly checkDatabaseConnection: () => Promise<void>;
}

export function createApp(dependencies: AppDependencies): express.Express {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware(dependencies.logger));
  app.use(
    cors({
      origin: dependencies.frontendOrigin
    })
  );
  app.use(express.json());

  app.get("/api/health", async (_request, response) => {
    try {
      await dependencies.checkDatabaseConnection();
      response.status(200).json({ status: "ok", database: "connected" });
    } catch {
      response.status(503).json({ status: "error", database: "unavailable" });
    }
  });

  app.use(unexpectedErrorHandler(dependencies.logger));

  return app;
}
