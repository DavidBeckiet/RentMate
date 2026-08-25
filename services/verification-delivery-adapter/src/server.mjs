import { createHash, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadAdapterConfig, AdapterConfigurationError } from "./config.mjs";
import { createBrevoClient, BrevoConfigurationError, BrevoProviderError } from "./brevo-client.mjs";
import { createSpeedSmsClient, SpeedSmsConfigurationError, SpeedSmsProviderError } from "./speedsms-client.mjs";
import { RequestBodyTooLargeError, readJsonBody } from "./validation.mjs";

export const verificationDeliveryPath = "/internal/v1/verification-delivery";
export const healthPath = "/api/health";
export const readinessPath = "/api/ready";

function createDefaultLogger() {
  const safeKeys = new Set(["channel", "providerStatus", "reason", "path", "status", "durationMs"]);
  const write = (level, message, context = {}) => {
    const safeContext = Object.fromEntries(Object.entries(context).filter(([key]) => safeKeys.has(key)));
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...safeContext
    });
    if (level === "error") console.error(entry);
    else if (level === "warn") console.warn(entry);
    else console.log(entry);
  };
  return Object.freeze({
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context)
  });
}

function writeJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store"
  });
  response.end(payload);
}

function tokenMatches(expected, provided) {
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

function getTokenHeader(request) {
  const value = request.headers["x-rentmate-verification-token"];
  return typeof value === "string" ? value : "";
}

function pathWithoutQuery(url) {
  return (url ?? "").split("?", 1)[0];
}

export function createVerificationDeliveryServer({
  config,
  brevoClient,
  speedSmsClient,
  logger = createDefaultLogger()
}) {
  const server = createHttpServer(async (request, response) => {
    const path = pathWithoutQuery(request.url);
    const startedAt = process.hrtime.bigint();
    const finish = (status) => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info("Verification delivery request completed", {
        path,
        status,
        durationMs: Math.round(durationMs * 100) / 100
      });
    };

    if (request.method === "GET" && path === healthPath) {
      finish(200);
      writeJson(response, 200, { status: "ok", service: "verification-delivery-adapter" });
      return;
    }

    if (request.method === "GET" && path === readinessPath) {
      finish(200);
      writeJson(response, 200, { status: "ready", service: "verification-delivery-adapter" });
      return;
    }

    if (request.method !== "POST" || path !== verificationDeliveryPath) {
      finish(404);
      writeJson(response, 404, { error: "Not found." });
      return;
    }

    if (!tokenMatches(config.deliveryToken, getTokenHeader(request))) {
      logger.warn("Verification delivery authentication failed", { reason: "invalid_token" });
      finish(403);
      writeJson(response, 403, { error: "Forbidden." });
      return;
    }

    let input;
    try {
      input = await readJsonBody(request);
    } catch (error) {
      const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
      logger.warn("Verification delivery request rejected", {
        reason: error instanceof RequestBodyTooLargeError ? "payload_too_large" : "invalid_payload"
      });
      finish(status);
      writeJson(response, status, { error: "Invalid verification delivery request." });
      return;
    }

    try {
      const deliveryClient = input.channel === "EMAIL" ? brevoClient : speedSmsClient;
      await deliveryClient.deliver(input);
    } catch (error) {
      const configurationError =
        error instanceof BrevoConfigurationError || error instanceof SpeedSmsConfigurationError;
      const providerError =
        error instanceof BrevoProviderError || error instanceof SpeedSmsProviderError ? error : null;
      const status = providerError?.kind === "rejected" ? 502 : 503;
      logger.error("Verification delivery provider failure", {
        channel: input.channel,
        reason: configurationError ? "configuration" : (providerError?.kind ?? "unexpected"),
        providerStatus: providerError?.statusCode ?? null
      });
      finish(status);
      writeJson(response, status, {
        error:
          providerError?.kind === "rejected"
            ? "Delivery provider rejected the request."
            : "Delivery provider unavailable."
      });
      return;
    }

    finish(202);
    writeJson(response, 202, { accepted: true });
  });

  return server;
}

function createProcessLogger() {
  return createDefaultLogger();
}

export async function startAdapter() {
  let config;
  try {
    config = loadAdapterConfig();
  } catch (error) {
    const issues = error instanceof AdapterConfigurationError ? error.issues : ["unexpected_configuration_error"];
    console.error(
      JSON.stringify({ level: "error", message: "Verification delivery adapter configuration failed.", issues })
    );
    process.exitCode = 1;
    return;
  }

  const logger = createProcessLogger();
  const brevoClient = createBrevoClient(config);
  const speedSmsClient = createSpeedSmsClient(config);
  const server = createVerificationDeliveryServer({ config, brevoClient, speedSmsClient, logger });
  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  server.listen(config.port, "0.0.0.0", () => {
    logger.info("Verification delivery adapter started", { path: verificationDeliveryPath });
  });
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entryPath === import.meta.url) {
  void startAdapter();
}
