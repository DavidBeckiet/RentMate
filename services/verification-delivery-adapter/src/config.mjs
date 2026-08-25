const runtimeEnvironments = new Set(["development", "test", "production"]);
const defaultPort = 4_400;
const defaultTimeoutMs = 5_000;
const minimumTimeoutMs = 250;
const maximumTimeoutMs = 30_000;

export const defaultBrevoApiBaseUrl = "https://api.brevo.com";
export const defaultSpeedSmsApiBaseUrl = "https://api.speedsms.vn/index.php";

export class AdapterConfigurationError extends Error {
  constructor(issues) {
    super("Verification delivery adapter configuration is invalid.");
    this.name = "AdapterConfigurationError";
    this.issues = Object.freeze([...issues]);
  }
}

function readValue(source, name) {
  return typeof source[name] === "string" ? source[name] : "";
}

function isEmail(value) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function readPort(source, issues) {
  const value = readValue(source, "VERIFICATION_DELIVERY_ADAPTER_PORT") || String(defaultPort);
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    issues.push("VERIFICATION_DELIVERY_ADAPTER_PORT");
    return defaultPort;
  }
  return port;
}

function readTimeout(source, issues) {
  const value = readValue(source, "BREVO_TIMEOUT_MS") || String(defaultTimeoutMs);
  const timeoutMs = Number(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs < minimumTimeoutMs || timeoutMs > maximumTimeoutMs) {
    issues.push("BREVO_TIMEOUT_MS");
    return defaultTimeoutMs;
  }
  return timeoutMs;
}

function readBrevoBaseUrl(source, nodeEnvironment, issues) {
  const value = readValue(source, "BREVO_API_BASE_URL") || defaultBrevoApiBaseUrl;
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      issues.push("BREVO_API_BASE_URL");
    } else if (nodeEnvironment === "production" && parsed.protocol !== "https:") {
      issues.push("BREVO_API_BASE_URL");
    } else {
      return parsed.href.replace(/\/$/, "");
    }
  } catch {
    issues.push("BREVO_API_BASE_URL");
  }
  return defaultBrevoApiBaseUrl;
}

export function loadAdapterConfig(source = process.env) {
  const nodeEnvironment = readValue(source, "NODE_ENV") || "production";
  const issues = [];
  if (!runtimeEnvironments.has(nodeEnvironment)) issues.push("NODE_ENV");

  const deliveryToken = readValue(source, "VERIFICATION_DELIVERY_TOKEN");
  const brevoApiKey = readValue(source, "BREVO_API_KEY");
  const emailSender = readValue(source, "BREVO_EMAIL_SENDER").trim();
  const emailSenderName = (readValue(source, "BREVO_EMAIL_SENDER_NAME") || "RentMate").trim();
  const speedSmsAccessToken = readValue(source, "SPEEDSMS_ACCESS_TOKEN");
  const speedSmsApiBaseUrl = readValue(source, "SPEEDSMS_API_BASE_URL") || defaultSpeedSmsApiBaseUrl;
  const speedSmsTimeoutMsValue = readValue(source, "SPEEDSMS_TIMEOUT_MS");
  const speedSmsTimeoutMs = speedSmsTimeoutMsValue ? Number(speedSmsTimeoutMsValue) : defaultTimeoutMs;

  if (!deliveryToken) issues.push("VERIFICATION_DELIVERY_TOKEN");
  if (!brevoApiKey) issues.push("BREVO_API_KEY");
  if (!isEmail(emailSender)) issues.push("BREVO_EMAIL_SENDER");
  if (!emailSenderName || emailSenderName.length > 70 || /[\r\n]/.test(emailSenderName)) {
    issues.push("BREVO_EMAIL_SENDER_NAME");
  }
  const port = readPort(source, issues);
  const timeoutMs = readTimeout(source, issues);
  const brevoApiBaseUrl = readBrevoBaseUrl(source, nodeEnvironment, issues);

  if (issues.length > 0) throw new AdapterConfigurationError([...new Set(issues)]);

  return Object.freeze({
    nodeEnvironment,
    port,
    deliveryToken,
    brevoApiKey,
    emailSender,
    emailSenderName,
    brevoApiBaseUrl,
    timeoutMs,
    speedSmsAccessToken,
    speedSmsApiBaseUrl,
    speedSmsTimeoutMs
  });
}
