import { context, isSpanContextValid, metrics, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

const meter = metrics.getMeter("rentmate.gateway");
const tracer = trace.getTracer("rentmate.gateway");
const requestCounter = meter.createCounter("rentmate.gateway.request.count", {
  description: "Gateway requests completed"
});
const requestDuration = meter.createHistogram("rentmate.gateway.request.duration", {
  description: "Gateway request duration",
  unit: "s"
});
const activeRequests = meter.createUpDownCounter("rentmate.gateway.request.active", {
  description: "Gateway requests currently in flight"
});

function normalizeRoute(pathname) {
  return pathname
    .replace(/\/[0-9]+(?=\/|$)/g, "/:id")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":uuid")
    .slice(0, 160);
}

export function withGatewayRequestTelemetry(method, pathname, operation) {
  const route = normalizeRoute(pathname);
  const startedAt = process.hrtime.bigint();
  const baseAttributes = { "http.request.method": method, "http.route": route };
  const span = tracer.startSpan(`${method} ${route}`, { kind: SpanKind.SERVER, attributes: baseAttributes });
  const activeSpanContext = span.spanContext();
  const spanContext = isSpanContextValid(activeSpanContext) ? activeSpanContext : undefined;
  activeRequests.add(1, baseAttributes);
  let completed = false;

  const telemetry = Object.freeze({
    traceId: spanContext?.traceId ?? null,
    spanId: spanContext?.spanId ?? null,
    traceparent: spanContext ? `00-${spanContext.traceId}-${spanContext.spanId}-01` : null,
    end(statusCode) {
      if (completed) return null;
      completed = true;
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      const attributes = { ...baseAttributes, "http.response.status_code": statusCode };
      activeRequests.add(-1, baseAttributes);
      requestCounter.add(1, attributes);
      requestDuration.record(durationSeconds, attributes);
      span.setAttribute("http.response.status_code", statusCode);
      span.setStatus({ code: statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.UNSET });
      span.end();
      return Math.round(durationSeconds * 100_000) / 100;
    }
  });

  return context.with(trace.setSpan(context.active(), span), () => operation(telemetry));
}
