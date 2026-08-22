import { normalizeControlledCode } from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { textMaximumLengths, validateJsonText } from "../../../../../shared/src/runtime/shared/validation/primitives.js";
import { validateBodyFields } from "../../../../../shared/src/runtime/shared/validation/request.js";

export const moderationActions = ["APPROVE", "REJECT", "HIDE", "RESTORE"] as const;

export type ModerationAction = (typeof moderationActions)[number];

export interface ModerationActionInput {
  readonly action: ModerationAction;
  readonly reason: string | null;
}

function parseAction(value: unknown): ModerationAction {
  return normalizeControlledCode(value, "action", moderationActions) as ModerationAction;
}

function parseReason(body: Readonly<Record<string, unknown>>, action: ModerationAction): string | null {
  const reasonRequired = action === "REJECT" || action === "HIDE";
  if (!("reason" in body)) {
    if (reasonRequired) {
      throwValidationIssue("reason", "REQUIRED", "reason is required for this action.");
    }
    return null;
  }

  if (body.reason === null && !reasonRequired) return null;
  return validateJsonText(body.reason, "reason", {
    maximumLength: textMaximumLengths.moderationReason,
    nullable: !reasonRequired,
    nonblank: true,
    blankAsNull: false,
    trim: true
  });
}

export function validateModerationActionBody(value: unknown): ModerationActionInput {
  const body = validateBodyFields(value, ["action", "reason"]);
  if (!("action" in body)) {
    throwValidationIssue("action", "REQUIRED", "action is required.");
  }
  const action = parseAction(body.action);
  return Object.freeze({ action, reason: parseReason(body, action) });
}
