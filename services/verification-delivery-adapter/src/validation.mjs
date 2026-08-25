const maximumBodyBytes = 8_192;
const maximumSecretLength = 256;
const maximumResetUrlLength = 2_048;

export class InvalidDeliveryRequestError extends Error {
  constructor(message = "Invalid verification delivery request.") {
    super(message);
    this.name = "InvalidDeliveryRequestError";
  }
}

export class RequestBodyTooLargeError extends InvalidDeliveryRequestError {
  constructor() {
    super("Verification delivery request is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEmail(value) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhone(value) {
  return /^\+?[0-9]{6,15}$/.test(value);
}

function validateResetUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumResetUrlLength) return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0 &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export function parseDeliveryPayload(value) {
  if (!isPlainObject(value)) throw new InvalidDeliveryRequestError();

  const keys = new Set(Object.keys(value));
  const eventType = value.eventType;
  const isPasswordReset = eventType === "PASSWORD_RESET";
  const allowedKeys = isPasswordReset
    ? new Set(["eventType", "channel", "destination", "secret", "resetUrl"])
    : new Set(["channel", "destination", "secret"]);

  if ([...keys].some((key) => !allowedKeys.has(key))) throw new InvalidDeliveryRequestError();
  if (eventType !== undefined && eventType !== "PASSWORD_RESET") throw new InvalidDeliveryRequestError();
  if (typeof value.channel !== "string" || (value.channel !== "EMAIL" && value.channel !== "PHONE")) {
    throw new InvalidDeliveryRequestError();
  }
  if (typeof value.destination !== "string" || value.destination.length === 0) {
    throw new InvalidDeliveryRequestError();
  }
  if (typeof value.secret !== "string" || value.secret.length === 0 || value.secret.length > maximumSecretLength) {
    throw new InvalidDeliveryRequestError();
  }
  if (value.channel === "EMAIL" && !isEmail(value.destination)) throw new InvalidDeliveryRequestError();
  if (value.channel === "PHONE" && !isPhone(value.destination)) throw new InvalidDeliveryRequestError();
  if (isPasswordReset) {
    if (value.channel !== "EMAIL" || !validateResetUrl(value.resetUrl)) throw new InvalidDeliveryRequestError();
    return Object.freeze({
      eventType: "PASSWORD_RESET",
      channel: "EMAIL",
      destination: value.destination,
      secret: value.secret,
      resetUrl: value.resetUrl
    });
  }

  return Object.freeze({
    channel: value.channel,
    destination: value.destination,
    secret: value.secret
  });
}

export async function readJsonBody(request, maximumBytes = maximumBodyBytes) {
  const chunks = [];
  let byteLength = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.byteLength;
    if (byteLength > maximumBytes) throw new RequestBodyTooLargeError();
    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) throw new InvalidDeliveryRequestError();
  try {
    return parseDeliveryPayload(JSON.parse(rawBody));
  } catch (error) {
    if (error instanceof InvalidDeliveryRequestError) throw error;
    throw new InvalidDeliveryRequestError();
  }
}
