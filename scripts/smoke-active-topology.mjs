import { pathToFileURL } from "node:url";

export class ActiveSmokeError extends Error {
  constructor(message) {
    super(message);
    this.name = "ActiveSmokeError";
  }
}

function readBoolean(source, key, defaultValue = false) {
  const value = source[key]?.trim().toLowerCase();
  if (!value) return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ActiveSmokeError(`${key} must equal true or false.`);
}

function isLocalHostname(hostname) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "host.docker.internal" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.startsWith("127.") ||
    normalized.endsWith(".local")
  );
}

function readOrigin(value, key, allowLocal) {
  const normalized = value?.trim();
  if (!normalized) throw new ActiveSmokeError(`${key} is required.`);
  try {
    const parsed = new URL(normalized);
    const local = isLocalHostname(parsed.hostname);
    if (
      (!allowLocal && parsed.protocol !== "https:") ||
      (allowLocal && parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.hostname.includes("*") ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      (!allowLocal && local)
    ) {
      throw new Error("unsafe origin");
    }
    return parsed.origin;
  } catch {
    throw new ActiveSmokeError(`${key} must be an exact ${allowLocal ? "HTTP(S)" : "non-local HTTPS"} origin.`);
  }
}

const authenticatedActors = Object.freeze([
  Object.freeze({
    name: "tenant",
    role: "TENANT",
    emailKey: "RENTMATE_SMOKE_TENANT_EMAIL",
    passwordKey: "RENTMATE_SMOKE_TENANT_PASSWORD",
    readPath: "/api/v1/favorites?page=1&pageSize=1"
  }),
  Object.freeze({
    name: "landlord",
    role: "LANDLORD",
    emailKey: "RENTMATE_SMOKE_LANDLORD_EMAIL",
    passwordKey: "RENTMATE_SMOKE_LANDLORD_PASSWORD",
    readPath: "/api/v1/landlord/listings?page=1&pageSize=1"
  }),
  Object.freeze({
    name: "admin",
    role: "ADMIN",
    emailKey: "RENTMATE_SMOKE_ADMIN_EMAIL",
    passwordKey: "RENTMATE_SMOKE_ADMIN_PASSWORD",
    readPath: "/api/v1/admin/listings?status=PENDING&page=1&pageSize=1"
  })
]);

function readAuthenticatedActors(source) {
  const requireAuthenticated = readBoolean(source, "RENTMATE_SMOKE_REQUIRE_AUTHENTICATED");
  const hasAnyCredential = authenticatedActors.some(
    (actor) => source[actor.emailKey]?.trim() || source[actor.passwordKey]
  );
  if (!requireAuthenticated && !hasAnyCredential) return null;

  const missingKeys = authenticatedActors.flatMap((actor) => {
    const missing = [];
    if (!source[actor.emailKey]?.trim()) missing.push(actor.emailKey);
    if (!source[actor.passwordKey]) missing.push(actor.passwordKey);
    return missing;
  });
  if (missingKeys.length > 0) {
    throw new ActiveSmokeError(`Authenticated smoke requires ${missingKeys.join(", ")}.`);
  }

  return Object.freeze(
    authenticatedActors.map((actor) => {
      const email = source[actor.emailKey].trim().toLowerCase();
      const password = source[actor.passwordKey];
      if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ActiveSmokeError(`${actor.emailKey} must contain a valid email address.`);
      }
      if ([...password].length < 8 || Buffer.byteLength(password, "utf8") > 72) {
        throw new ActiveSmokeError(`${actor.passwordKey} must contain 8 characters and at most 72 UTF-8 bytes.`);
      }
      return Object.freeze({ ...actor, email, password });
    })
  );
}

export function readActiveSmokeConfiguration(source) {
  const allowLocal = readBoolean(source, "RENTMATE_SMOKE_ALLOW_LOCAL");
  const listingIdRaw = source.RENTMATE_SMOKE_PUBLIC_LISTING_ID?.trim();
  const listingId = listingIdRaw ? Number(listingIdRaw) : null;
  if (listingId !== null && (!Number.isSafeInteger(listingId) || listingId < 1 || listingId > 2_147_483_647)) {
    throw new ActiveSmokeError("RENTMATE_SMOKE_PUBLIC_LISTING_ID must be a positive 32-bit integer.");
  }
  return Object.freeze({
    frontendOrigin: readOrigin(source.FRONTEND_ORIGIN, "FRONTEND_ORIGIN", allowLocal),
    apiOrigin: readOrigin(source.NEXT_PUBLIC_API_BASE_URL, "NEXT_PUBLIC_API_BASE_URL", allowLocal),
    listingId,
    actors: readAuthenticatedActors(source),
    timeoutMs: 10_000
  });
}

async function request(fetcher, configuration, label, url, init = {}, expectedStatus = 200) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);
  try {
    const response = await fetcher(url, { ...init, redirect: "error", signal: controller.signal });
    if (response.status !== expectedStatus) throw new ActiveSmokeError(`${label} returned HTTP ${response.status}.`);
    const requestId = response.headers.get("x-request-id");
    if (url.startsWith(configuration.apiOrigin) && (!requestId || !/^[A-Za-z0-9._:-]{1,128}$/.test(requestId))) {
      throw new ActiveSmokeError(`${label} did not return a safe X-Request-Id.`);
    }
    return response;
  } catch (error) {
    if (error instanceof ActiveSmokeError) throw error;
    throw new ActiveSmokeError(`${label} could not be reached safely.`);
  } finally {
    clearTimeout(timeout);
  }
}

function assertCredentialedCors(response, configuration, label) {
  if (
    response.headers.get("access-control-allow-origin") !== configuration.frontendOrigin ||
    response.headers.get("access-control-allow-credentials")?.toLowerCase() !== "true"
  ) {
    throw new ActiveSmokeError(`${label} returned an invalid credentialed CORS policy.`);
  }
}

function readSessionCookie(response, configuration, label) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const attributes = setCookie.split(";").map((value) => value.trim());
  const session = attributes[0] ?? "";
  if (!/^rentmate_session=[^;=]+$/.test(session)) {
    throw new ActiveSmokeError(`${label} did not set the expected session cookie.`);
  }
  const lowerAttributes = attributes.slice(1).map((value) => value.toLowerCase());
  if (
    !lowerAttributes.includes("httponly") ||
    !lowerAttributes.includes("samesite=lax") ||
    !lowerAttributes.includes("path=/") ||
    lowerAttributes.some((value) => value.startsWith("domain=")) ||
    (new URL(configuration.apiOrigin).protocol === "https:" && !lowerAttributes.includes("secure"))
  ) {
    throw new ActiveSmokeError(`${label} returned unsafe session-cookie attributes.`);
  }
  return session;
}

async function readRecord(response, label) {
  try {
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("not an object");
    return payload;
  } catch {
    throw new ActiveSmokeError(`${label} did not return a JSON object.`);
  }
}

function assertCollectionEnvelope(payload, label) {
  if (!Array.isArray(payload.data) || !payload.pagination || typeof payload.pagination !== "object") {
    throw new ActiveSmokeError(`${label} returned an invalid collection envelope.`);
  }
}

async function runAuthenticatedActorSmoke(fetcher, configuration, actor) {
  const loginLabel = `${actor.name} login`;
  const loginResponse = await request(
    fetcher,
    configuration,
    loginLabel,
    `${configuration.apiOrigin}/api/v1/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: configuration.frontendOrigin },
      body: JSON.stringify({ email: actor.email, password: actor.password })
    }
  );
  assertCredentialedCors(loginResponse, configuration, loginLabel);
  const sessionCookie = readSessionCookie(loginResponse, configuration, loginLabel);
  const login = await readRecord(loginResponse, loginLabel);
  if (!login.data || typeof login.data !== "object" || login.data.role !== actor.role) {
    throw new ActiveSmokeError(`${loginLabel} returned an unexpected role.`);
  }

  const readLabel = `${actor.name} protected read`;
  const readResponse = await request(fetcher, configuration, readLabel, `${configuration.apiOrigin}${actor.readPath}`, {
    headers: { Cookie: sessionCookie, Origin: configuration.frontendOrigin }
  });
  assertCredentialedCors(readResponse, configuration, readLabel);
  assertCollectionEnvelope(await readRecord(readResponse, readLabel), readLabel);

  const logoutLabel = `${actor.name} logout`;
  const logoutResponse = await request(
    fetcher,
    configuration,
    logoutLabel,
    `${configuration.apiOrigin}/api/v1/auth/logout`,
    {
      method: "POST",
      headers: { Cookie: sessionCookie, Origin: configuration.frontendOrigin }
    },
    204
  );
  assertCredentialedCors(logoutResponse, configuration, logoutLabel);
}

export async function runActiveSmoke(configuration, fetcher = globalThis.fetch) {
  const frontend = await request(fetcher, configuration, "frontend root", configuration.frontendOrigin);
  if (!(await frontend.text()).includes("RentMate")) {
    throw new ActiveSmokeError("frontend root did not contain the RentMate marker.");
  }

  const health = await readRecord(
    await request(fetcher, configuration, "gateway health", `${configuration.apiOrigin}/api/health`),
    "gateway health"
  );
  if (health.status !== "ok") throw new ActiveSmokeError("gateway health did not report ok.");

  const listingResponse = await request(
    fetcher,
    configuration,
    "public listing search",
    `${configuration.apiOrigin}/api/v1/listings?page=1&pageSize=1`,
    { headers: { Origin: configuration.frontendOrigin } }
  );
  assertCredentialedCors(listingResponse, configuration, "public listing search");
  const listings = await readRecord(listingResponse, "public listing search");
  assertCollectionEnvelope(listings, "public listing search");

  let checkCount = 3;
  if (configuration.listingId !== null) {
    const detail = await readRecord(
      await request(
        fetcher,
        configuration,
        "public listing detail",
        `${configuration.apiOrigin}/api/v1/listings/${configuration.listingId}`
      ),
      "public listing detail"
    );
    if (!detail.data || typeof detail.data !== "object" || Array.isArray(detail.data)) {
      throw new ActiveSmokeError("public listing detail returned an invalid data envelope.");
    }
    checkCount += 1;
  }

  for (const actor of configuration.actors ?? []) {
    await runAuthenticatedActorSmoke(fetcher, configuration, actor);
    checkCount += 3;
  }

  return Object.freeze({ checkCount, productWritesPerformed: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runActiveSmoke(readActiveSmokeConfiguration(process.env))
    .then((result) => {
      process.stdout.write(
        `${JSON.stringify({ level: "info", message: "Active topology smoke passed", ...result })}\n`
      );
    })
    .catch((error) => {
      const reason = error instanceof ActiveSmokeError ? error.message : "Unexpected active topology smoke failure.";
      process.stderr.write(`${JSON.stringify({ level: "error", message: reason })}\n`);
      process.exitCode = 1;
    });
}
