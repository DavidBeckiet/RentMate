import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import type { RoommateCompatibilityResult } from "../../roommate/roommate-compatibility.js";
import type { RoommateService } from "../../roommate/services/roommate-service.js";
import { isRoommateAiFeatureEnabled, type RoommateAiConfiguration } from "../config/roommate-ai-config.js";
import { roommateAiExplanationPrompt } from "../prompts/explanation-prompt.js";
import { roommateAiApplicationVersions } from "../prompts/versions.js";
import type { AiProvider } from "../providers/ai-provider.js";
import {
  roommateAiExplanationJsonSchema,
  validateRoommateAiExplanationOutput,
  type RoommateAiExplanationCaution,
  type RoommateAiExplanationEvidenceRef
} from "../schemas/explanation-schema.js";
import type { RoommateAiExplanationInput } from "../validations/explanation-validation.js";

export interface RoommateAiExplanation {
  readonly summary: string;
  readonly evidenceRefs: readonly RoommateAiExplanationEvidenceRef[];
  readonly cautions: readonly RoommateAiExplanationCaution[];
  readonly rulesVersion: RoommateCompatibilityResult["rulesVersion"];
  readonly explanationVersion: typeof roommateAiApplicationVersions.explanationVersion;
  readonly promptVersion: typeof roommateAiExplanationPrompt.version;
  readonly generatedAt: string;
}

function providerInput(compatibility: RoommateCompatibilityResult, locale: RoommateAiExplanationInput["locale"]) {
  return Object.freeze({
    rulesVersion: compatibility.rulesVersion,
    category: compatibility.category,
    evaluatedCount: compatibility.evaluatedCount,
    dimensions: Object.freeze(
      compatibility.dimensions.map((item) =>
        Object.freeze({ dimension: item.dimension, outcome: item.outcome, explanationCode: item.explanationCode })
      )
    ),
    locale
  });
}

export class RoommateAiCompatibilityExplanationService {
  constructor(
    private readonly configuration: RoommateAiConfiguration,
    private readonly provider: AiProvider | null,
    private readonly roommateService: RoommateService,
    private readonly now: () => Date = () => new Date()
  ) {}

  async explain(
    principal: AuthenticatedPrincipal,
    requestId: number,
    input: RoommateAiExplanationInput,
    signal?: AbortSignal
  ): Promise<RoommateAiExplanation | null> {
    if (!isRoommateAiFeatureEnabled(this.configuration, "EXPLANATION") || !this.provider) {
      throw new ApplicationError(
        "AI_FEATURE_UNAVAILABLE",
        "Roommate AI compatibility explanations are currently unavailable."
      );
    }
    const request = await this.roommateService.getRequest(principal, requestId);
    const compatibility = request.compatibility ?? null;
    if (compatibility === null) return null;
    const output = await this.provider.generate({
      task: "ROOMMATE_AI_COMPATIBILITY_EXPLANATION",
      instructions: roommateAiExplanationPrompt.instructions,
      input: providerInput(compatibility, input.locale),
      responseJsonSchema: roommateAiExplanationJsonSchema,
      model: this.configuration.models.explanation,
      maxOutputTokens: 500,
      timeoutMs: this.configuration.timeoutsMs.explanation,
      signal,
      versions: Object.freeze({
        promptVersion: roommateAiExplanationPrompt.version,
        schemaVersion: "ROOMMATE_AI_EXPLANATION_SCHEMA_V1"
      }),
      validateOutput: (value) => validateRoommateAiExplanationOutput(value, compatibility.dimensions)
    });
    return Object.freeze({
      summary: output.output.summary,
      evidenceRefs: output.output.evidenceRefs,
      cautions: output.output.cautions,
      rulesVersion: compatibility.rulesVersion,
      explanationVersion: roommateAiApplicationVersions.explanationVersion,
      promptVersion: roommateAiExplanationPrompt.version,
      generatedAt: this.now().toISOString()
    });
  }
}
