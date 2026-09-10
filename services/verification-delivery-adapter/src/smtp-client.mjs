import nodemailer from "nodemailer";
import { createEmailContent } from "./email-content.mjs";

export class SmtpConfigurationError extends Error {
  constructor() {
    super("SMTP email delivery is not configured.");
    this.name = "SmtpConfigurationError";
  }
}

export class SmtpProviderError extends Error {
  constructor(kind) {
    const messages = {
      timeout: "SMTP provider timed out.",
      unavailable: "SMTP provider is unavailable.",
      rejected: "SMTP provider rejected the request."
    };
    super(messages[kind]);
    this.name = "SmtpProviderError";
    this.kind = kind;
  }
}

function isConfigured(config) {
  return (
    typeof config.smtpHost === "string" &&
    config.smtpHost.length > 0 &&
    Number.isInteger(config.smtpPort) &&
    typeof config.smtpSecure === "boolean" &&
    typeof config.smtpUser === "string" &&
    config.smtpUser.length > 0 &&
    typeof config.smtpPassword === "string" &&
    config.smtpPassword.length > 0 &&
    typeof config.smtpFrom === "string" &&
    config.smtpFrom.length > 0 &&
    Number.isInteger(config.smtpTimeoutMs) &&
    config.smtpTimeoutMs >= 250 &&
    config.smtpTimeoutMs <= 30_000
  );
}

function providerError(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code)) return new SmtpProviderError("timeout");
  if (code === "EAUTH" || typeof error?.responseCode === "number") return new SmtpProviderError("rejected");
  return new SmtpProviderError("unavailable");
}

export function createSmtpClient(config, options = {}) {
  if (!isConfigured(config)) throw new SmtpConfigurationError();

  const createTransport = options.createTransport ?? nodemailer.createTransport;
  const transport = createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
    connectionTimeout: config.smtpTimeoutMs,
    greetingTimeout: config.smtpTimeoutMs,
    socketTimeout: config.smtpTimeoutMs
  });

  return Object.freeze({
    async deliver(input) {
      const content = createEmailContent(input);
      try {
        await transport.sendMail({
          from: config.smtpFrom,
          to: input.destination,
          subject: content.subject,
          text: content.text,
          html: content.html
        });
      } catch (error) {
        throw providerError(error);
      }
    }
  });
}
