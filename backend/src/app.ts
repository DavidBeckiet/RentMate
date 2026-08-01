import express from "express";
import type { Logger } from "./shared/logging/logger.js";
import { cookieParserMiddleware } from "./shared/middleware/cookie-parser.js";
import { createCorsMiddleware } from "./shared/middleware/cors.js";
import { unexpectedErrorHandler } from "./shared/middleware/error-handler.js";
import { createOriginGuard } from "./shared/middleware/origin-guard.js";
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
  app.use(createCorsMiddleware(dependencies.frontendOrigin));
  app.use(createOriginGuard(dependencies.frontendOrigin));
  app.use(cookieParserMiddleware);
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
