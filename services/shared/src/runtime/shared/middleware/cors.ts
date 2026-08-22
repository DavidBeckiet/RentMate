import cors from "cors";
import type { RequestHandler } from "express";

const allowedMethods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

export function createCorsMiddleware(frontendOrigin: string): RequestHandler {
  return cors({
    origin(requestOrigin, callback) {
      callback(null, requestOrigin === frontendOrigin ? frontendOrigin : false);
    },
    credentials: true,
    methods: allowedMethods,
    preflightContinue: false,
    optionsSuccessStatus: 204
  });
}
