# RentMate SLO and alerting baseline

## Status

These objectives are an initial local/staging baseline. Production targets require measured traffic, an agreed support
window, and named owners. Do not present local load-test results as production availability evidence.

## Service-level indicators

| User journey | Indicator | Initial objective | Measurement window |
| --- | --- | ---: | --- |
| Public discovery | Successful non-5xx requests | 99.9% | Rolling 30 days |
| Public discovery | p95 server latency | Under 750 ms | Rolling 7 days |
| Authenticated reads | Successful non-5xx requests | 99.5% | Rolling 30 days |
| Authenticated reads | p95 server latency | Under 1 second | Rolling 7 days |
| Critical writes | Successful non-5xx requests excluding valid 4xx | 99.5% | Rolling 30 days |
| Telemetry collection | Collector scrape availability | 99.5% | Rolling 7 days |

Valid validation, authentication, authorization, not-found, and concurrency responses are not server failures. SLO
queries must classify by status and stable application error code rather than treating all non-2xx responses equally.

## Local alerts

Prometheus loads `docker/observability/rentmate-alerts.yml`. The initial rules surface:

- telemetry collector unavailable for two minutes;
- aggregate service 5xx ratio above five percent for ten minutes;
- aggregate p95 service latency above one second for ten minutes.

The rules deliberately do not send email, SMS, or paging notifications. A staging/production deployment must select an
approved alert destination, add ownership labels, and test routing without placing destination credentials in Git.

## Error budget policy

For a 99.9% monthly availability objective, the error budget is 0.1% of eligible requests. If more than half of the
monthly budget is consumed in seven days, pause non-critical rollout work and prioritize reliability. If the budget is
exhausted, allow only incident fixes, security fixes, and explicitly approved emergency changes until recovery is
demonstrated.

## Performance evidence

`npm.cmd run loadtest:public` enforces less than 1% failed requests, p95 below 750 ms, p99 below 1.5 seconds, and more
than 99% successful checks. `npm.cmd run loadtest:authenticated` performs only login and protected reads. Use dedicated
test users; never load-test production without an approved window and operator.
