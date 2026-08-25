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

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    };
    return entities[character];
  });
}

function createEmailContent(input) {
  if (input.eventType === "PASSWORD_RESET") {
    const safeResetUrl = escapeHtml(input.resetUrl);
    return {
      subject: "Đặt lại mật khẩu RentMate",
      textContent: `Bạn có thể đặt lại mật khẩu RentMate tại liên kết sau:\n${input.resetUrl}\n\nNếu bạn không yêu cầu thao tác này, hãy bỏ qua email.`,
      htmlContent: `<p>Bạn có thể đặt lại mật khẩu RentMate tại liên kết sau:</p><p><a href="${safeResetUrl}">Đặt lại mật khẩu RentMate</a></p><p>Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.</p>`
    };
  }

  const safeSecret = escapeHtml(input.secret);
  return {
    subject: "Mã xác minh RentMate",
    textContent: `Mã xác minh RentMate của bạn là: ${input.secret}\n\nNếu bạn không yêu cầu mã này, hãy bỏ qua email.`,
    htmlContent: `<p>Mã xác minh RentMate của bạn là:</p><p><strong>${safeSecret}</strong></p><p>Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>`
  };
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
    textContent: content.textContent,
    htmlContent: content.htmlContent
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
