import http from "node:http";
import https from "node:https";
import { fileURLToPath } from "node:url";

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

const corsMethods = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
const corsHeaders = "Content-Type";

function readPort(value, fallback) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("GATEWAY_PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function readTimeout(value, fallback) {
  const timeout = Number(value ?? fallback);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120_000) {
    throw new Error("GATEWAY_UPSTREAM_TIMEOUT_MS must be an integer between 100 and 120000.");
  }
  return timeout;
}

function requireHttpUrl(value, name) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP or HTTPS URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }

  return parsed;
}

function normalizeBaseUrl(value, name) {
  const parsed = requireHttpUrl(value, name);
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  return parsed;
}

function normalizeOrigin(value, name) {
  const parsed = requireHttpUrl(value, name);
  if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error(`${name} must contain only an HTTP or HTTPS origin.`);
  }
  return parsed.origin;
}

export function createRouteTable(environment = process.env) {
  const backendUrl = normalizeBaseUrl(environment.BACKEND_URL ?? "http://localhost:4000", "BACKEND_URL");
  const frontendOrigin = normalizeOrigin(environment.FRONTEND_ORIGIN ?? "http://localhost:3000", "FRONTEND_ORIGIN");
  const optionalUrl = (key) => {
    const value = environment[key]?.trim();
    return value ? normalizeBaseUrl(value, key) : null;
  };

  return Object.freeze({
    backend: backendUrl,
    frontendOrigin,
    identity: optionalUrl("IDENTITY_SERVICE_URL"),
    listing: optionalUrl("LISTING_SERVICE_URL"),
    engagement: optionalUrl("ENGAGEMENT_SERVICE_URL"),
    internalServiceToken: environment.SERVICE_INTERNAL_TOKEN?.trim() || null,
    upstreamTimeoutMs: readTimeout(environment.GATEWAY_UPSTREAM_TIMEOUT_MS, 10_000)
  });
}

export function resolveUpstream(pathname, routes) {
  if (
    routes.identity &&
    (pathname.startsWith("/api/v1/auth") ||
      pathname.startsWith("/api/v1/users") ||
      pathname.startsWith("/api/v1/admin/users"))
  ) {
    return routes.identity;
  }
  if (
    routes.listing &&
    (pathname.startsWith("/api/v1/listings") ||
      pathname.startsWith("/api/v1/admin/listings") ||
      pathname.startsWith("/api/v1/lookups") ||
      pathname.startsWith("/api/v1/geocoding"))
  ) {
    return routes.listing;
  }
  if (routes.engagement && pathname.startsWith("/api/v1/favorites")) {
    return routes.engagement;
  }
  return routes.backend;
}

function copyRequestHeaders(request, upstream, internalServiceToken) {
  const headers = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined && name !== "host" && !hopByHopHeaders.has(name)) {
      headers[name] = value;
    }
  }

  headers.host = upstream.host;
  headers["x-forwarded-host"] = request.headers.host ?? "";
  headers["x-forwarded-proto"] = "http";
  if (internalServiceToken) {
    headers["x-rentmate-internal-token"] = internalServiceToken;
  }
  return headers;
}

function copyResponseHeaders(headers) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !hopByHopHeaders.has(name) && !name.toLowerCase().startsWith("access-control-")) {
      result[name] = value;
    }
  }
  return result;
}

function setCorsHeaders(request, response, frontendOrigin) {
  if (request.headers.origin !== frontendOrigin) {
    return false;
  }

  response.setHeader("Access-Control-Allow-Origin", frontendOrigin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Methods", corsMethods);
  response.setHeader("Access-Control-Allow-Headers", corsHeaders);
  response.setHeader("Vary", "Origin");
  return true;
}

function isUnsafeMethod(method) {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

function sendGatewayError(response, statusCode, code, message) {
  if (response.headersSent) {
    response.destroy();
    return;
  }

  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: { code, message } }));
}

function proxyRequest(request, response, upstream, internalServiceToken, upstreamTimeoutMs) {
  const target = new URL(request.url ?? "/", upstream);
  const transport = target.protocol === "https:" ? https : http;
  const proxy = transport.request(
    target,
    {
      method: request.method,
      headers: copyRequestHeaders(request, upstream, internalServiceToken)
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, copyResponseHeaders(upstreamResponse.headers));
      upstreamResponse.pipe(response);
    }
  );

  proxy.setTimeout(upstreamTimeoutMs, () => {
    proxy.destroy(new Error("Gateway upstream request timed out."));
    sendGatewayError(response, 504, "UPSTREAM_TIMEOUT", "The requested service did not respond in time.");
  });

  proxy.on("error", () => {
    sendGatewayError(response, 502, "UPSTREAM_UNAVAILABLE", "The requested service is unavailable.");
  });
  request.on("aborted", () => proxy.destroy());
  request.pipe(proxy);
}

export function createGatewayServer(environment = process.env) {
  const routes = createRouteTable(environment);
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://gateway.local").pathname;
    const origin = request.headers.origin;
    const originAllowed = !origin || setCorsHeaders(request, response, routes.frontendOrigin);

    if (!originAllowed && (request.method === "OPTIONS" || isUnsafeMethod(request.method ?? "GET"))) {
      sendGatewayError(response, 403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed.");
      return;
    }

    if (request.method === "OPTIONS") {
      if (originAllowed) {
        response.writeHead(204);
        response.end();
      } else {
        sendGatewayError(response, 403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed.");
      }
      return;
    }

    if (!pathname.startsWith("/api/")) {
      sendGatewayError(response, 404, "NOT_FOUND", "The requested route was not found.");
      return;
    }

    const upstream = resolveUpstream(pathname, routes);
    const isServiceUpstream = upstream !== routes.backend;
    proxyRequest(
      request,
      response,
      upstream,
      isServiceUpstream ? routes.internalServiceToken : null,
      routes.upstreamTimeoutMs
    );
  });

  return server;
}

export function startGateway(environment = process.env) {
  const port = readPort(environment.GATEWAY_PORT, 4001);
  const server = createGatewayServer(environment);
  server.listen(port, () => {
    process.stdout.write(`RentMate API Gateway listening on http://localhost:${port}\n`);
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startGateway();
}
