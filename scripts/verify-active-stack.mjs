import { pathToFileURL } from "node:url";

export class ActiveStackVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ActiveStackVerificationError";
  }
}

function readOrigin(value, key) {
  const normalized = value?.trim();
  if (!normalized) throw new ActiveStackVerificationError(`${key} is required.`);
  try {
    const parsed = new URL(normalized);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.hostname.includes("*") ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("unsafe origin");
    }
    return parsed.origin;
  } catch {
    throw new ActiveStackVerificationError(`${key} must be an exact HTTP(S) origin.`);
  }
}

function readStartupTimeout(value) {
  const parsed = value?.trim() ? Number(value) : 90_000;
  if (!Number.isSafeInteger(parsed) || parsed < 10_000 || parsed > 300_000) {
    throw new ActiveStackVerificationError(
      "RENTMATE_STACK_STARTUP_TIMEOUT_MS must be an integer between 10000 and 300000."
    );
  }
  return parsed;
}

export function readActiveStackVerificationConfiguration(source) {
  return Object.freeze({
    apiOrigin: readOrigin(source.RENTMATE_STACK_API_ORIGIN, "RENTMATE_STACK_API_ORIGIN"),
    frontendOrigin: readOrigin(source.FRONTEND_ORIGIN, "FRONTEND_ORIGIN"),
    startupTimeoutMs: readStartupTimeout(source.RENTMATE_STACK_STARTUP_TIMEOUT_MS),
    requestTimeoutMs: 5_000,
    retryIntervalMs: 1_000
  });
}

function hasSafeRequestId(response) {
  const requestId = response.headers.get("x-request-id");
  return Boolean(requestId && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId));
}

async function fetchWithTimeout(fetcher, url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, redirect: "error", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readRecord(response) {
  const payload = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("response is not a JSON object");
  }
  return payload;
}

async function waitForGatewayHealth(configuration, fetcher, delay) {
  const deadline = Date.now() + configuration.startupTimeoutMs;
  while (Date.now() <= deadline) {
    try {
      const response = await fetchWithTimeout(
        fetcher,
        `${configuration.apiOrigin}/api/health`,
        {},
        configuration.requestTimeoutMs
      );
      if (response.status === 200 && hasSafeRequestId(response)) {
        const payload = await readRecord(response);
        if (payload.status === "ok") return;
      }
    } catch {
      // A disposable stack may refuse connections while Compose is still converging.
    }
    await delay(configuration.retryIntervalMs);
  }
  throw new ActiveStackVerificationError("Gateway did not become healthy before the startup deadline.");
}

export async function runActiveStackVerification(
  configuration,
  fetcher = globalThis.fetch,
  delay = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs))
) {
  await waitForGatewayHealth(configuration, fetcher, delay);

  let response;
  try {
    response = await fetchWithTimeout(
      fetcher,
      `${configuration.apiOrigin}/api/v1/listings?page=1&pageSize=1`,
      { headers: { Origin: configuration.frontendOrigin } },
      configuration.requestTimeoutMs
    );
  } catch {
    throw new ActiveStackVerificationError("Public listing read could not be reached safely.");
  }

  if (response.status !== 200) {
    throw new ActiveStackVerificationError(`Public listing read returned HTTP ${response.status}.`);
  }
  if (!hasSafeRequestId(response)) {
    throw new ActiveStackVerificationError("Public listing read did not return a safe X-Request-Id.");
  }
  if (
    response.headers.get("access-control-allow-origin") !== configuration.frontendOrigin ||
    response.headers.get("access-control-allow-credentials")?.toLowerCase() !== "true"
  ) {
    throw new ActiveStackVerificationError("Public listing read returned an invalid credentialed CORS policy.");
  }

  let payload;
  try {
    payload = await readRecord(response);
  } catch {
    throw new ActiveStackVerificationError("Public listing read did not return a JSON object.");
  }
  if (!Array.isArray(payload.data) || !payload.pagination || typeof payload.pagination !== "object") {
    throw new ActiveStackVerificationError("Public listing read returned an invalid collection envelope.");
  }

  return Object.freeze({ checkCount: 2, productWritesPerformed: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runActiveStackVerification(readActiveStackVerificationConfiguration(process.env))
    .then((result) => {
      process.stdout.write(
        `${JSON.stringify({ level: "info", message: "Active stack verification passed", ...result })}\n`
      );
    })
    .catch((error) => {
      const reason =
        error instanceof ActiveStackVerificationError ? error.message : "Unexpected active stack verification failure.";
      process.stderr.write(`${JSON.stringify({ level: "error", message: reason })}\n`);
      process.exitCode = 1;
    });
}
