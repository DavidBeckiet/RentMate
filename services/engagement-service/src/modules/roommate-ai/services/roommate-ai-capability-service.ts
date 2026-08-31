import { createHash } from "node:crypto";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import { isRoommateAiFeatureEnabled, type RoommateAiConfiguration } from "../config/roommate-ai-config.js";

export interface RoommateAiCapabilities {
  readonly preferenceParsing: boolean;
  readonly semanticRecommendations: boolean;
  readonly compatibilityExplanations: boolean;
  readonly safetyWarnings: boolean;
}

function isInStableRollout(tenantId: number, percentage: number): boolean {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;
  const hash = createHash("sha256").update(`roommate-ai-rollout:${tenantId}`).digest();
  return hash.readUInt32BE(0) % 100 < percentage;
}

export class RoommateAiCapabilityService {
  constructor(private readonly config: RoommateAiConfiguration) {}

  isSafetyWarningEnabled(principal: AuthenticatedPrincipal): boolean {
    return (
      isInStableRollout(principal.userId, this.config.rolloutPercentage) &&
      this.config.safetyMode === "TENANT" &&
      isRoommateAiFeatureEnabled(this.config, "SAFETY")
    );
  }

  getCapabilities(principal: AuthenticatedPrincipal): RoommateAiCapabilities {
    const inRollout = isInStableRollout(principal.userId, this.config.rolloutPercentage);
    return Object.freeze({
      preferenceParsing: inRollout && isRoommateAiFeatureEnabled(this.config, "PARSER"),
      semanticRecommendations: inRollout && isRoommateAiFeatureEnabled(this.config, "RECOMMENDATION"),
      compatibilityExplanations: inRollout && isRoommateAiFeatureEnabled(this.config, "EXPLANATION"),
      safetyWarnings: this.isSafetyWarningEnabled(principal)
    });
  }
}
