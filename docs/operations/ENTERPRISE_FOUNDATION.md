# RentMate enterprise foundation

## Scope

This foundation makes the current local microservice architecture observable and operationally testable without a
cloud account. It does not claim that staging or production exists, and it does not change product API, privacy,
authorization, listing lifecycle, or database ownership contracts.

## Telemetry topology

```text
Browser / k6
  -> API Gateway
       -> Identity Service
       -> Listing Service
       -> Engagement Service

Gateway and services
  -> OTLP/HTTP -> OpenTelemetry Collector
                    -> Jaeger (distributed traces)
                    -> Prometheus (metrics)
                                      -> Grafana
```

The Gateway accepts an incoming `X-Request-Id` only when it matches the bounded safe format; otherwise it creates a
new identifier. The identifier is returned to the caller and forwarded to the selected service. OpenTelemetry's HTTP
instrumentation propagates W3C trace context independently of the request ID.

Logs are JSON and contain service, environment, request ID, trace ID, method, normalized route, status, and duration.
They do not contain query strings, request/response bodies, authentication headers, cookies, credentials, OTPs, JWTs,
or provider secrets.

## Local endpoints

| Component | URL | Purpose |
| --- | --- | --- |
| Gateway | `http://localhost:4001` | Browser API entrypoint |
| Grafana | `http://localhost:3001` | Provisioned RentMate dashboard |
| Prometheus | `http://localhost:9090` | Metrics and local alert state |
| Jaeger | `http://localhost:16686` | Cross-service trace inspection |
| OTLP gRPC | `http://localhost:4317` | Local instrumentation ingress |
| OTLP HTTP | `http://localhost:4318` | Local instrumentation ingress |

The Grafana instance enables anonymous Viewer access only for local development. Do not expose it publicly. A real
deployment must use authenticated access and an approved secret/configuration store.

## Verification

1. Start the microservice stack with `docker compose -f docker-compose.microservices.yml up -d --build`.
2. Check `docker compose -f docker-compose.microservices.yml ps` until application and observability containers are
   healthy/running.
3. Request `http://localhost:4001/api/v1/listings?page=1&pageSize=20` several times.
4. Open Jaeger, select `rentmate-gateway`, and confirm the trace contains the routed service span.
5. Open Grafana and confirm the RentMate service overview receives request rate and latency series.
6. Run `npm.cmd run loadtest:public`; thresholds must pass before using the result as performance evidence.

Missing telemetry must not make a product request fail. Exporters batch asynchronously, while local structured logs
remain available through `docker compose logs`.

The `clean-database-stack-smoke` CI job exercises the deployable topology from an empty, uniquely named Compose
project. It starts disposable PostgreSQL, runs all three service migration inventories, waits for application health,
and verifies Gateway health plus one public collection read with request-ID and credentialed-CORS checks. It captures
bounded diagnostics on failure and always removes the project volumes. The job performs no product writes after
migration and uses no live provider credentials.

## Production hardening baseline

The active application images run as the Alpine `node` user. Compose applies a read-only root filesystem, a bounded
64 MiB temporary filesystem, an init process, a 256-process ceiling, all-capability removal, `no-new-privileges`, and a
30-second graceful-stop window to Identity, Listing, Engagement, Gateway, and the optional verification adapter.
PostgreSQL and observability images keep their vendor-specific runtime requirements and are not covered by this shared
application anchor.

`npm run deploy:validate` validates the active microservice production environment without contacting providers or
printing secret values. `npm run smoke:production` performs public reads plus isolated login/protected-read/logout
checks for dedicated tenant, landlord, and admin smoke accounts; it does not mutate product data. Production can fail
closed on missing smoke credentials with `RENTMATE_SMOKE_REQUIRE_AUTHENTICATED=true`. Migration commands at the
repository root orchestrate all three owned databases and require a separate external version manifest per database
for an existing deployment. `npm run admin:provision` transactionally provisions the controlled admin in the Identity
database from protected environment values. Compatibility-backend operational commands are explicitly namespaced
`legacy:`.

## Security pipeline

`.github/workflows/security.yml` adds CodeQL, pull-request dependency review, Trivy filesystem vulnerability/secret/
misconfiguration scanning, an SPDX JSON SBOM artifact, and blocking HIGH/CRITICAL vulnerability scans for all five
active application images. CI also verifies that each image is configured to run as `node`. The filesystem gate skips
the retained `backend/` reference tree because it is not part of the active microservice deployment. These checks
complement rather than replace manual threat modeling, provider review, penetration testing, or OWASP ASVS
verification.

## Release evidence

The active CI gate runs `npm run release:evidence` and uploads a 30-day evidence bundle. The manifest binds the exact
source revision and release version to the five built image IDs with verified OCI labels, checksums for active
dependency locks and container/topology inputs, and all 35 ordered service migrations. Generation is write-once per
release label and excludes the retained compatibility backend. See
[RELEASE_EVIDENCE.md](RELEASE_EVIDENCE.md) for review, rollback, and production-signing boundaries.
