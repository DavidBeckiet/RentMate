import type { ApplicationErrorCode } from "../../../../../shared/src/runtime/shared/errors/application-error.js";

export type AiProviderErrorCategory =
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "AUTH_OR_PERMISSION"
  | "TRANSPORT"
  | "SERVER_ERROR"
  | "SAFETY_BLOCK"
  | "REFUSAL"
  | "EMPTY_OUTPUT"
  | "MALFORMED_OUTPUT"
  | "SCHEMA_INVALID";

export interface AiTaskVersions {
  readonly promptVersion: string;
  readonly schemaVersion: string;
}

export interface AiUsageMetadata {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
}

export interface AiGenerationRequest<Output> {
  readonly task: string;
  readonly instructions: string;
  readonly input: unknown;
  readonly responseJsonSchema: Readonly<Record<string, unknown>>;
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly versions: AiTaskVersions;
  readonly validateOutput: (value: unknown) => Output;
}

export interface AiGenerationResult<Output> {
  readonly output: Output;
  readonly usage: AiUsageMetadata;
}

export interface AiProvider {
  generate<Output>(request: AiGenerationRequest<Output>): Promise<AiGenerationResult<Output>>;
}

export interface SanitizedAiError {
  readonly code: ApplicationErrorCode;
  readonly category: AiProviderErrorCategory;
}
