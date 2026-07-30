import type { LogLevel } from "../../config/env.js";

type LogContextValue = string | number | boolean | null;
export type LogContext = Readonly<Record<string, LogContextValue>>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

const logLevelPriority: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const sensitiveContextKey = /(authorization|cookie|credential|password|secret|token)/i;
const maximumContextStringLength = 512;

function sanitizeContext(context: LogContext | undefined): Record<string, LogContextValue> {
  if (!context) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(context)
      .filter(([key]) => !sensitiveContextKey.test(key))
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, maximumContextStringLength) : value])
  );
}

export function createLogger(minimumLevel: LogLevel): Logger {
  const write = (level: LogLevel, message: string, context?: LogContext): void => {
    if (logLevelPriority[level] < logLevelPriority[minimumLevel]) {
      return;
    }

    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...sanitizeContext(context)
    });

    if (level === "error") {
      console.error(entry);
    } else if (level === "warn") {
      console.warn(entry);
    } else {
      console.log(entry);
    }
  };

  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context)
  };
}
