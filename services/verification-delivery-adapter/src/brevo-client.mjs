import { createEmailContent } from "./email-content.mjs";

const emailPath = "/v3/smtp/email";

export class BrevoProviderError extends Error {
  constructor(kind, statusCode) {
    const messages = {
      timeout: "Brevo provider timed out.",
      unavailable: "Brevo provider is unavailable.",
      rejected: "Brevo provider rejected the request."
    };
    super(messages[kind]);
    this.name = "BrevoProviderError";
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

export class BrevoConfigurationError extends Error {
  constructor() {
    super("Brevo email delivery is not configured.");
    this.name = "BrevoConfigurationError";
  }
}

function assertBrevoConfiguration(config) {
  if (!config.brevoApiKey || !config.emailSender || !config.emailSenderName) {
    throw new BrevoConfigurationError();
  }
}

function createEmailPayload(input, config) {
  const content = createEmailContent(input);
  return {
    sender: {
      email: config.emailSender,
      name: config.emailSenderName
    },
    to: [{ email: input.destination }],
    subject: content.subject,
    textContent: content.text,
    htmlContent: content.html
  };
}

async function postToBrevo({ fetcher, url, apiKey, payload, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch {
    if (controller.signal.aborted) throw new BrevoProviderError("timeout");
    throw new BrevoProviderError("unavailable");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new BrevoProviderError("rejected", response.status);
}

export function createBrevoClient(config, options = {}) {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);

  return Object.freeze({
    async deliver(input) {
      assertBrevoConfiguration(config);

      await postToBrevo({
        fetcher,
        url: `${config.brevoApiBaseUrl}${emailPath}`,
        apiKey: config.brevoApiKey,
        payload: createEmailPayload(input, config),
        timeoutMs: config.timeoutMs
      });
    }
  });
}
