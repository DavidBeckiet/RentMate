const runtimeEnvironments = new Set(["development", "test", "production"]);
const emailDeliveryProviders = new Set(["BREVO", "GMAIL_SMTP"]);
const phoneDeliveryProviders = new Set(["SPEEDSMS", "DEV_PREVIEW"]);
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

function hasHeaderBreak(value) {
  return /[\r\n]/.test(value);
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

function readPortValue(source, name, issues) {
  const value = readValue(source, name);
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    issues.push(name);
    return 0;
  }
  return port;
}

function readTimeout(source, name, fallback, issues) {
  const value = readValue(source, name) || String(fallback);
  const timeoutMs = Number(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs < minimumTimeoutMs || timeoutMs > maximumTimeoutMs) {
    issues.push(name);
    return fallback;
  }
  return timeoutMs;
}

function readBoolean(source, name, fallback, issues, required = false) {
  const value = readValue(source, name).trim().toLowerCase();
  if (!value) {
    if (required) issues.push(name);
    return fallback;
  }
  if (value !== "true" && value !== "false") {
    issues.push(name);
    return fallback;
  }
  return value === "true";
}

function readProvider(source, name, providers, fallback, issues) {
  const value = readValue(source, name).trim();
  if (!value) return fallback;
  if (!providers.has(value)) {
    issues.push(name);
    return fallback;
  }
  return value;
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

function readSmtpHost(source, issues) {
  const value = readValue(source, "SMTP_HOST").trim();
  if (!value || value.length > 253 || hasHeaderBreak(value) || !/^[A-Za-z0-9.-]+$/.test(value)) {
    issues.push("SMTP_HOST");
    return "";
  }
  return value;
}

function readSmtpText(source, name, issues, validateEmail = false) {
  const value = readValue(source, name).trim();
  if (!value || hasHeaderBreak(value) || (validateEmail && !isEmail(value))) {
    issues.push(name);
    return "";
  }
  return value;
}

function readSmtpPassword(source, issues) {
  const value = readValue(source, "SMTP_PASSWORD");
  if (!value || hasHeaderBreak(value)) {
    issues.push("SMTP_PASSWORD");
    return "";
  }
  return value;
}

export function loadAdapterConfig(source = process.env) {
  const nodeEnvironment = readValue(source, "NODE_ENV") || "production";
  const issues = [];
  if (!runtimeEnvironments.has(nodeEnvironment)) issues.push("NODE_ENV");

  const emailDeliveryProvider = readProvider(
    source,
    "EMAIL_DELIVERY_PROVIDER",
    emailDeliveryProviders,
    "BREVO",
    issues
  );
  const phoneDeliveryProvider = readProvider(
    source,
    "PHONE_DELIVERY_PROVIDER",
    phoneDeliveryProviders,
    "SPEEDSMS",
    issues
  );
  const phoneDevPreviewEnabled = readBoolean(source, "PHONE_DEV_PREVIEW_ENABLED", false, issues);
  const deliveryToken = readValue(source, "VERIFICATION_DELIVERY_TOKEN");

  if (!deliveryToken) issues.push("VERIFICATION_DELIVERY_TOKEN");
  if (phoneDeliveryProvider === "DEV_PREVIEW" && (nodeEnvironment === "production" || !phoneDevPreviewEnabled)) {
    issues.push("PHONE_DELIVERY_PROVIDER");
  }

  const port = readPort(source, issues);
  const brevoTimeoutMs =
    emailDeliveryProvider === "BREVO"
      ? readTimeout(source, "BREVO_TIMEOUT_MS", defaultTimeoutMs, issues)
      : defaultTimeoutMs;
  const speedSmsTimeoutMs =
    phoneDeliveryProvider === "SPEEDSMS"
      ? readTimeout(source, "SPEEDSMS_TIMEOUT_MS", defaultTimeoutMs, issues)
      : defaultTimeoutMs;
  const smtpTimeoutMs =
    emailDeliveryProvider === "GMAIL_SMTP"
      ? readTimeout(source, "SMTP_TIMEOUT_MS", defaultTimeoutMs, issues)
      : defaultTimeoutMs;

  const brevoApiKey = emailDeliveryProvider === "BREVO" ? readValue(source, "BREVO_API_KEY") : "";
  const emailSender = emailDeliveryProvider === "BREVO" ? readValue(source, "BREVO_EMAIL_SENDER").trim() : "";
  const emailSenderName =
    emailDeliveryProvider === "BREVO" ? (readValue(source, "BREVO_EMAIL_SENDER_NAME") || "RentMate").trim() : "";
  const brevoApiBaseUrl =
    emailDeliveryProvider === "BREVO" ? readBrevoBaseUrl(source, nodeEnvironment, issues) : defaultBrevoApiBaseUrl;

  if (emailDeliveryProvider === "BREVO") {
    if (!brevoApiKey) issues.push("BREVO_API_KEY");
    if (!isEmail(emailSender)) issues.push("BREVO_EMAIL_SENDER");
    if (!emailSenderName || emailSenderName.length > 70 || hasHeaderBreak(emailSenderName)) {
      issues.push("BREVO_EMAIL_SENDER_NAME");
    }
  }

  const smtpHost = emailDeliveryProvider === "GMAIL_SMTP" ? readSmtpHost(source, issues) : "";
  const smtpPort = emailDeliveryProvider === "GMAIL_SMTP" ? readPortValue(source, "SMTP_PORT", issues) : 0;
  const smtpSecure =
    emailDeliveryProvider === "GMAIL_SMTP" ? readBoolean(source, "SMTP_SECURE", false, issues, true) : false;
  const smtpUser = emailDeliveryProvider === "GMAIL_SMTP" ? readSmtpText(source, "SMTP_USER", issues, true) : "";
  const smtpPassword = emailDeliveryProvider === "GMAIL_SMTP" ? readSmtpPassword(source, issues) : "";
  const smtpFrom = emailDeliveryProvider === "GMAIL_SMTP" ? readSmtpText(source, "SMTP_FROM", issues, true) : "";

  const speedSmsAccessToken = phoneDeliveryProvider === "SPEEDSMS" ? readValue(source, "SPEEDSMS_ACCESS_TOKEN") : "";
  const speedSmsApiBaseUrl =
    phoneDeliveryProvider === "SPEEDSMS"
      ? readValue(source, "SPEEDSMS_API_BASE_URL") || defaultSpeedSmsApiBaseUrl
      : defaultSpeedSmsApiBaseUrl;

  if (issues.length > 0) throw new AdapterConfigurationError([...new Set(issues)]);

  return Object.freeze({
    nodeEnvironment,
    port,
    deliveryToken,
    emailDeliveryProvider,
    phoneDeliveryProvider,
    phoneDevPreviewEnabled,
    brevoApiKey,
    emailSender,
    emailSenderName,
    brevoApiBaseUrl,
    timeoutMs: brevoTimeoutMs,
    speedSmsAccessToken,
    speedSmsApiBaseUrl,
    speedSmsTimeoutMs,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword,
    smtpFrom,
    smtpTimeoutMs
  });
}
