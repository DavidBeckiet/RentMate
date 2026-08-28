import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import { isRoommateAiFeatureEnabled, type RoommateAiConfiguration } from "../config/roommate-ai-config.js";
import { roommateAiPreferenceParserPrompt } from "../prompts/preference-parser-prompt.js";
import { roommateAiApplicationVersions, roommateAiParserPromptVersion } from "../prompts/versions.js";
import type { AiProvider } from "../providers/ai-provider.js";
import {
  roommateAiPreferencePreviewJsonSchema,
  roommateAiPreferencePreviewSchemaVersion,
  validateRoommateAiPreferencePreviewOutput,
  type RoommateAiPreferenceProposal,
  type RoommateAiUnresolved
} from "../schemas/preference-preview-schema.js";
import type { RoommateAiPreferencePreviewInput } from "../validations/preference-preview-validation.js";

export interface RoommateAiPreferencePreview {
  readonly target: RoommateAiPreferencePreviewInput["target"];
  readonly normalizedText: string;
  readonly proposal: RoommateAiPreferenceProposal;
  readonly unresolved: readonly RoommateAiUnresolved[];
  readonly requiresConfirmation: true;
  readonly parserVersion: typeof roommateAiApplicationVersions.parserVersion;
  readonly promptVersion: typeof roommateAiParserPromptVersion;
}

const unavailableMessage = "Roommate AI preference parsing is currently unavailable.";

export class RoommateAiPreferencePreviewService {
  constructor(
    private readonly configuration: RoommateAiConfiguration,
    private readonly provider: AiProvider | null
  ) {}

  async preview(
    _principal: AuthenticatedPrincipal,
    input: RoommateAiPreferencePreviewInput,
    signal?: AbortSignal
  ): Promise<RoommateAiPreferencePreview> {
    if (!isRoommateAiFeatureEnabled(this.configuration, "PARSER") || !this.provider) {
      throw new ApplicationError("AI_FEATURE_UNAVAILABLE", unavailableMessage);
    }
    const result = await this.provider.generate({
      task: "ROOMMATE_AI_PREFERENCE_PREVIEW",
      instructions: roommateAiPreferenceParserPrompt.instructions,
      input: Object.freeze({ target: input.target, locale: input.locale, text: input.text }),
      responseJsonSchema: roommateAiPreferencePreviewJsonSchema(input.target),
      model: this.configuration.models.parser,
      maxOutputTokens: 500,
      timeoutMs: this.configuration.timeoutsMs.parser,
      signal,
      versions: Object.freeze({
        promptVersion: roommateAiParserPromptVersion,
        schemaVersion: roommateAiPreferencePreviewSchemaVersion
      }),
      validateOutput: (value) => validateRoommateAiPreferencePreviewOutput(value, input.target, input.text)
    });
    return Object.freeze({
      target: input.target,
      normalizedText: input.text,
      proposal: result.output.proposal,
      unresolved: result.output.unresolved,
      requiresConfirmation: true,
      parserVersion: roommateAiApplicationVersions.parserVersion,
      promptVersion: roommateAiParserPromptVersion
    });
  }
}
