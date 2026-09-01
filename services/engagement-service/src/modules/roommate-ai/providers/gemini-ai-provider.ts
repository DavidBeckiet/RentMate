import { AiProviderError } from "./ai-provider-error.js";
import type { AiGenerationRequest, AiGenerationResult, AiProvider, AiUsageMetadata } from "./ai-provider.js";
import { assertGeminiJsonSchemaCompatible, toGeminiJsonSchema } from "./gemini-schema-adapter.js";

const geminiGenerateContentBaseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiAiProviderOptions {
  readonly apiKey: string;
  readonly fetchImplementation?: typeof fetch;
}

function positiveTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function usageFromResponse(value: unknown): AiUsageMetadata {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return Object.freeze({ inputTokens: null, outputTokens: null, totalTokens: null });
  }
  const usage = (value as Readonly<Record<string, unknown>>).usageMetadata;
  if (usage === null || typeof usage !== "object" || Array.isArray(usage)) {
    return Object.freeze({ inputTokens: null, outputTokens: null, totalTokens: null });
  }
  const metadata = usage as Readonly<Record<string, unknown>>;
  return Object.freeze({
    inputTokens: positiveTokenCount(metadata.promptTokenCount),
    outputTokens: positiveTokenCount(metadata.candidatesTokenCount),
    totalTokens: positiveTokenCount(metadata.totalTokenCount)
  });
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function extractCandidateJson(payload: unknown): unknown {
  const response = asRecord(payload);
  if (!response) throw new AiProviderError("MALFORMED_OUTPUT", "AI_OUTPUT_INVALID");
  if (asRecord(response.promptFeedback)?.blockReason) {
    throw new AiProviderError("SAFETY_BLOCK", "AI_OUTPUT_INVALID");
  }
  if (!Array.isArray(response.candidates) || response.candidates.length !== 1) {
    throw new AiProviderError("EMPTY_OUTPUT", "AI_OUTPUT_INVALID");
  }

  const candidate = asRecord(response.candidates[0]);
  if (!candidate) throw new AiProviderError("MALFORMED_OUTPUT", "AI_OUTPUT_INVALID");
  if (candidate.finishReason !== "STOP") {
    throw new AiProviderError(candidate.finishReason === "SAFETY" ? "SAFETY_BLOCK" : "REFUSAL", "AI_OUTPUT_INVALID");
  }
  const content = asRecord(candidate.content);
  if (!content || !Array.isArray(content.parts) || content.parts.length !== 1) {
    throw new AiProviderError("EMPTY_OUTPUT", "AI_OUTPUT_INVALID");
  }
  const part = asRecord(content.parts[0]);
  if (!part || typeof part.text !== "string" || part.text.trim().length === 0) {
    throw new AiProviderError("EMPTY_OUTPUT", "AI_OUTPUT_INVALID");
  }

  try {
    return JSON.parse(part.text);
  } catch {
    throw new AiProviderError("MALFORMED_OUTPUT", "AI_OUTPUT_INVALID");
  }
}

export class GeminiAiProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: GeminiAiProviderOptions) {
    this.apiKey = options.apiKey;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async generate<Output>(request: AiGenerationRequest<Output>): Promise<AiGenerationResult<Output>> {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    request.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, request.timeoutMs);

    try {
      const responseJsonSchema = toGeminiJsonSchema(request.responseJsonSchema);
      assertGeminiJsonSchemaCompatible(responseJsonSchema);
      const response = await this.fetchImplementation(
        `${geminiGenerateContentBaseUrl}/${encodeURIComponent(request.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.instructions }] },
            contents: [
              {
                role: "user",
                parts: [
                  { text: JSON.stringify({ task: request.task, input: request.input, versions: request.versions }) }
                ]
              }
            ],
            generationConfig: {
              candidateCount: 1,
              maxOutputTokens: request.maxOutputTokens,
              responseMimeType: "application/json",
              responseJsonSchema
            }
          }),
          signal: controller.signal
        }
      );

      if (!response.ok) {
        if (response.status === 429) throw new AiProviderError("RATE_LIMITED", "AI_PROVIDER_UNAVAILABLE");
        if (response.status >= 500) throw new AiProviderError("SERVER_ERROR", "AI_PROVIDER_UNAVAILABLE");
        throw new AiProviderError("AUTH_OR_PERMISSION", "AI_PROVIDER_UNAVAILABLE");
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AiProviderError("MALFORMED_OUTPUT", "AI_OUTPUT_INVALID");
      }
      const candidate = extractCandidateJson(payload);
      try {
        return Object.freeze({ output: request.validateOutput(candidate), usage: usageFromResponse(payload) });
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        throw new AiProviderError("SCHEMA_INVALID", "AI_OUTPUT_INVALID");
      }
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (timedOut || controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new AiProviderError("TIMEOUT", "AI_TIMEOUT");
      }
      throw new AiProviderError("TRANSPORT", "AI_PROVIDER_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}
