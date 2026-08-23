import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createGatewayServer, createRouteTable, resolveUpstream } from "../server.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test("keeps the monolith as the default upstream and switches configured boundaries", () => {
  const routes = createRouteTable({
    BACKEND_URL: "http://backend:4000",
    IDENTITY_SERVICE_URL: "http://identity:4100",
    LISTING_SERVICE_URL: "http://listing:4200",
    ENGAGEMENT_SERVICE_URL: "http://engagement:4300"
  });

  assert.equal(resolveUpstream("/api/v1/auth/login", routes).hostname, "identity");
  assert.equal(resolveUpstream("/api/v1/listings", routes).hostname, "listing");
  assert.equal(resolveUpstream("/api/v1/favorites", routes).hostname, "engagement");
  assert.equal(resolveUpstream("/api/v1/inquiries", routes).hostname, "engagement");
  assert.equal(resolveUpstream("/api/v1/notifications", routes).hostname, "engagement");
  assert.equal(resolveUpstream("/api/v1/saved-searches", routes).hostname, "engagement");
  assert.equal(resolveUpstream("/api/v1/admin/listings", routes).hostname, "listing");
  assert.equal(resolveUpstream("/api/v1/admin/users", routes).hostname, "identity");
  assert.equal(routes.upstreamTimeoutMs, 10000);
});

test("proxies API requests and preserves upstream response cookies", async () => {
  const upstream = http.createServer((request, response) => {
    assert.equal(request.url, "/api/v1/auth/login");
    assert.equal(request.headers.origin, "http://localhost:3000");
    assert.equal(request.headers["x-rentmate-internal-token"], "test-internal-token");
    response.writeHead(200, {
      "content-type": "application/json",
      "set-cookie": ["rentmate_session=test-cookie; HttpOnly; Path=/"]
    });
    response.end(JSON.stringify({ data: { ok: true } }));
  });
  const upstreamPort = await listen(upstream);
  const gateway = createGatewayServer({
    BACKEND_URL: `http://127.0.0.1:${upstreamPort}`,
    IDENTITY_SERVICE_URL: `http://127.0.0.1:${upstreamPort}`,
    SERVICE_INTERNAL_TOKEN: "test-internal-token"
  });
  const gatewayPort = await listen(gateway);

  try {
    const result = await fetch(`http://127.0.0.1:${gatewayPort}/api/v1/auth/login`, {
      headers: { origin: "http://localhost:3000" }
    });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.equal(result.headers.get("access-control-allow-credentials"), "true");
    assert.deepEqual(result.headers.getSetCookie(), ["rentmate_session=test-cookie; HttpOnly; Path=/"]);
    assert.deepEqual(await result.json(), { data: { ok: true } });
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test("handles allowed preflight and rejects unsafe requests from another origin", async () => {
  const gateway = createGatewayServer({
    BACKEND_URL: "http://127.0.0.1:1",
    FRONTEND_ORIGIN: "http://localhost:3000"
  });
  const gatewayPort = await listen(gateway);

  try {
    const preflight = await fetch(`http://127.0.0.1:${gatewayPort}/api/v1/listings`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type"
      }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");

    const rejected = await fetch(`http://127.0.0.1:${gatewayPort}/api/v1/listings`, {
      method: "POST",
      headers: { origin: "http://malicious.example" }
    });
    assert.equal(rejected.status, 403);
    assert.deepEqual(await rejected.json(), {
      error: { code: "ORIGIN_NOT_ALLOWED", message: "The request origin is not allowed." }
    });
  } finally {
    await close(gateway);
  }
});
