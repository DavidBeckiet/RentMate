import { AiProviderError } from "./ai-provider-error.js";
import type { AiGenerationRequest, AiGenerationResult, AiProvider } from "./ai-provider.js";

export const fakeAiProviderScenarios = [
  "SUCCESS",
  "TIMEOUT",
  "TRANSPORT_FAILURE",
  "RATE_LIMITED",
  "AUTH_OR_PERMISSION",
  "SERVER_ERROR",
  "SAFETY_BLOCK",
  "REFUSAL",
  "EMPTY_OUTPUT",
  "MALFORMED_OUTPUT",
  "SCHEMA_INVALID",
  "ADDITIONAL_PROPERTIES"
] as const;

export type FakeAiProviderScenario = (typeof fakeAiProviderScenarios)[number];

export interface FakeAiProviderOptions {
  readonly scenario?: FakeAiProviderScenario;
  readonly output?: unknown;
  readonly usage?: Partial<{
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  }>;
}

const defaultOutput = Object.freeze({ status: "OK", labels: ["A"] });
const schemaInvalidOutput = Object.freeze({ status: "INVALID", labels: [] });
const outputWithAdditionalProperty = Object.freeze({ status: "OK", labels: ["A"], unexpected: true });

export class FakeAiProvider implements AiProvider {
  readonly requests: AiGenerationRequest<unknown>[] = [];

  constructor(private readonly options: FakeAiProviderOptions = {}) {}

  async generate<Output>(request: AiGenerationRequest<Output>): Promise<AiGenerationResult<Output>> {
    this.requests.push(request as AiGenerationRequest<unknown>);
    const scenario = this.options.scenario ?? "SUCCESS";
    if (scenario === "TIMEOUT") throw new AiProviderError("TIMEOUT", "AI_TIMEOUT");
    if (scenario === "TRANSPORT_FAILURE") throw new AiProviderError("TRANSPORT", "AI_PROVIDER_UNAVAILABLE");
    if (scenario === "RATE_LIMITED") throw new AiProviderError("RATE_LIMITED", "AI_PROVIDER_UNAVAILABLE");
    if (scenario === "AUTH_OR_PERMISSION") throw new AiProviderError("AUTH_OR_PERMISSION", "AI_PROVIDER_UNAVAILABLE");
    if (scenario === "SERVER_ERROR") throw new AiProviderError("SERVER_ERROR", "AI_PROVIDER_UNAVAILABLE");
    if (scenario === "SAFETY_BLOCK") throw new AiProviderError("SAFETY_BLOCK", "AI_OUTPUT_INVALID");
    if (scenario === "REFUSAL") throw new AiProviderError("REFUSAL", "AI_OUTPUT_INVALID");
    if (scenario === "EMPTY_OUTPUT") throw new AiProviderError("EMPTY_OUTPUT", "AI_OUTPUT_INVALID");
    if (scenario === "MALFORMED_OUTPUT") throw new AiProviderError("MALFORMED_OUTPUT", "AI_OUTPUT_INVALID");

    const output =
      this.options.output ??
      (scenario === "SCHEMA_INVALID"
        ? schemaInvalidOutput
        : scenario === "ADDITIONAL_PROPERTIES"
          ? outputWithAdditionalProperty
          : defaultOutput);
    try {
      return Object.freeze({
        output: request.validateOutput(output),
        usage: Object.freeze({
          inputTokens: this.options.usage?.inputTokens ?? null,
          outputTokens: this.options.usage?.outputTokens ?? null,
          totalTokens: this.options.usage?.totalTokens ?? null
        })
      });
    } catch {
      throw new AiProviderError("SCHEMA_INVALID", "AI_OUTPUT_INVALID");
    }
  }
}
