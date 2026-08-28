import {
  ApplicationError,
  type ApplicationErrorCode
} from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import type { AiProviderErrorCategory } from "./ai-provider.js";

const messages: Readonly<
  Record<Extract<ApplicationErrorCode, "AI_PROVIDER_UNAVAILABLE" | "AI_TIMEOUT" | "AI_OUTPUT_INVALID">, string>
> = Object.freeze({
  AI_PROVIDER_UNAVAILABLE: "The AI provider is currently unavailable.",
  AI_TIMEOUT: "The AI provider did not respond in time.",
  AI_OUTPUT_INVALID: "The AI provider returned an unusable response."
});

export class AiProviderError extends ApplicationError {
  constructor(
    readonly category: AiProviderErrorCategory,
    code: Extract<ApplicationErrorCode, "AI_PROVIDER_UNAVAILABLE" | "AI_TIMEOUT" | "AI_OUTPUT_INVALID">
  ) {
    super(code, messages[code]);
    this.name = "AiProviderError";
  }
}
