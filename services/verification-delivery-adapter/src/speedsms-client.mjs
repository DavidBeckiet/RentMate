const smsPath = "/sms/send";
const defaultSmsType = 4;
const minimumTimeoutMs = 250;
const maximumTimeoutMs = 30_000;

export class SpeedSmsConfigurationError extends Error {
  constructor() {
    super("SpeedSMS phone delivery is not configured.");
    this.name = "SpeedSmsConfigurationError";
  }
}

export class SpeedSmsProviderError extends Error {
  constructor(kind, statusCode) {
    const messages = {
      timeout: "SpeedSMS provider timed out.",
      unavailable: "SpeedSMS provider is unavailable.",
      rejected: "SpeedSMS provider rejected the request.",
      malformed: "SpeedSMS provider returned an invalid response."
    };
    super(messages[kind]);
    this.name = "SpeedSmsProviderError";
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

function normalizeBaseUrl(value) {
  try {
    const parsed = new URL(value);
    const hasCredentials = parsed.username.length > 0 || parsed.password.length > 0;
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      hasCredentials ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isSuccessResponse(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value;
  if (candidate.status !== "success" || candidate.code !== "00") return false;
  if (candidate.data === null || typeof candidate.data !== "object" || Array.isArray(candidate.data)) return false;
  const transactionId = candidate.data.tranId;
  return (
    (typeof transactionId === "number" && Number.isSafeInteger(transactionId)) ||
    (typeof transactionId === "string" && transactionId.length > 0)
  );
}

function isErrorResponse(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && value.status === "error";
}

function assertConfiguration(config) {
  const baseUrl = normalizeBaseUrl(config.speedSmsApiBaseUrl);
  const timeoutMs = config.speedSmsTimeoutMs;
  if (
    !config.speedSmsAccessToken ||
    !baseUrl ||
    (config.nodeEnvironment === "production" && !baseUrl.startsWith("https://")) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < minimumTimeoutMs ||
    timeoutMs > maximumTimeoutMs
  ) {
    throw new SpeedSmsConfigurationError();
  }
  return { baseUrl, timeoutMs };
}

function createAuthorizationHeader(accessToken) {
  return `Basic ${Buffer.from(`${accessToken}:x`, "utf8").toString("base64")}`;
}

function createSmsPayload(input) {
  return {
    to: [input.destination],
    content: `Ma xac minh RentMate cua ban la ${input.secret}. Khong chia se ma nay.`,
    sms_type: defaultSmsType
  };
}

async function postToSpeedSms({ fetcher, config, input }) {
  const { baseUrl, timeoutMs } = assertConfiguration(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetcher(`${baseUrl}${smsPath}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: createAuthorizationHeader(config.speedSmsAccessToken)
      },
      body: JSON.stringify(createSmsPayload(input)),
      signal: controller.signal
    });
  } catch {
    if (controller.signal.aborted) throw new SpeedSmsProviderError("timeout");
    throw new SpeedSmsProviderError("unavailable");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new SpeedSmsProviderError("rejected", response.status);

  let body;
  try {
    body = await response.json();
  } catch {
    throw new SpeedSmsProviderError("malformed", response.status);
  }

  if (isErrorResponse(body)) throw new SpeedSmsProviderError("rejected", response.status);
  if (!isSuccessResponse(body)) throw new SpeedSmsProviderError("malformed", response.status);
}

export function createSpeedSmsClient(config, options = {}) {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);

  return Object.freeze({
    async deliver(input) {
      await postToSpeedSms({ fetcher, config, input });
    }
  });
}
