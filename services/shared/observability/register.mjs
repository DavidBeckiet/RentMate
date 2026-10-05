import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION
} from "@opentelemetry/semantic-conventions";

function structuredLog(level, message, context = {}) {
  const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  writer(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: process.env.OTEL_SERVICE_NAME ?? process.env.SERVICE_NAME ?? "rentmate-service",
      message,
      ...context
    })
  );
}

function readPositiveInteger(value, fallback) {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const collectorEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim().replace(/\/$/, "");
const telemetryDisabled = process.env.OTEL_SDK_DISABLED === "true" || !collectorEndpoint;

if (!telemetryDisabled) {
  const serviceName = process.env.OTEL_SERVICE_NAME ?? process.env.SERVICE_NAME ?? "rentmate-service";
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: process.env.RENTMATE_RELEASE_VERSION ?? "development",
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.NODE_ENV ?? "development"
  });
  const metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${collectorEndpoint}/v1/metrics` }),
    exportIntervalMillis: readPositiveInteger(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS, 10_000)
  });
  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({ url: `${collectorEndpoint}/v1/traces` }),
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingRequestHook: (request) => serviceName === "rentmate-gateway" || request.url === "/api/health",
          ignoreOutgoingRequestHook: () => serviceName === "rentmate-gateway"
        }
      })
    ]
  });

  try {
    sdk.start();
    structuredLog("info", "OpenTelemetry SDK started", { collectorConfigured: true });
  } catch (error) {
    structuredLog("error", "OpenTelemetry SDK startup failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }

  process.once("beforeExit", async () => {
    try {
      await sdk.shutdown();
    } catch (error) {
      structuredLog("warn", "OpenTelemetry SDK shutdown failed", {
        errorType: error instanceof Error ? error.name : "UnknownError"
      });
    }
  });
}
