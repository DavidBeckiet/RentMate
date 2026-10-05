# RentMate incident response runbook

## Triage

1. Record incident start time, reporter, environment, release version, and observable user impact.
2. Check Gateway health and the affected user journey without performing a product mutation.
3. Inspect Grafana for request rate, 5xx ratio, latency, and active requests.
4. Use a request ID or trace ID to inspect the complete path in Jaeger and structured container logs.
5. Check PostgreSQL health, connection pressure, provider status, and the most recent deployment/migration record.
6. Assign severity and one incident owner. Keep credentials, cookies, message bodies, exact addresses, and personal data
   out of incident notes.

## Containment

- Roll back only the application artifact when the schema remains backward compatible.
- Disable an optional provider or AI capability through its existing rollout configuration when that boundary is the
  source of failure.
- Do not edit an applied migration, blind down-migrate, restore over the source database, or weaken authorization and
  privacy checks to recover availability.
- If data integrity is uncertain, stop affected writes while preserving safe reads and evidence.

## Recovery and closure

1. Confirm health, representative traces, error ratio, latency, database connectivity, and provider status.
2. Run the documented non-mutating smoke checks.
3. Monitor for at least one normal traffic interval before closing the incident.
4. Record root cause, detection gap, user impact, timeline, corrective owner, and due date.
5. Add a regression test or operational control for the confirmed failure mode.

The local Prometheus rules link to this runbook but do not page an operator. Production requires named escalation and
communications owners.
