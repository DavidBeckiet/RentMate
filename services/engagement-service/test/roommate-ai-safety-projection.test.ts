import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type { RoommateAiSafetyRepository } from "../src/modules/roommate-ai/repositories/roommate-ai-safety-repository.js";
import type { RoommateSafetyRepository } from "../src/modules/roommate/repositories/roommate-safety-repository.js";
import { createRoommateSafetyService } from "../src/modules/roommate/services/roommate-safety-service.js";

const recipient: AuthenticatedPrincipal = Object.freeze({ userId: 2, role: "TENANT" });
const sender: AuthenticatedPrincipal = Object.freeze({ userId: 1, role: "TENANT" });
const message = Object.freeze({
  id: 77,
  interestId: 9,
  senderTenantId: 1,
  body: "Xin gui OTP ngay bay gio.",
  moderationState: "VISIBLE" as const,
  createdAt: "2026-08-31T00:00:00.000Z",
  readAt: null
});
const interest = Object.freeze({
  id: 9,
  requestId: 3,
  requestOwnerTenantId: 1,
  interestedTenantId: 2,
  status: "ACCEPTED" as const,
  request: Object.freeze({ status: "OPEN", moderationState: "VISIBLE", expiresAt: "2027-01-01T00:00:00.000Z" })
});

function service(safetyEnabled: boolean) {
  const roommateRepository = {
    async findInterestById() {
      return interest;
    },
    async lockTenant() {},
    async isPairBlocked() {
      return false;
    }
  } as never;
  const safetyRepository = {
    async listMessages() {
      return [message];
    }
  } as unknown as RoommateSafetyRepository;
  const aiSafetyRepository = {
    async listCompletedProjections(_executor: unknown, ids: readonly number[]) {
      return new Map(
        ids.includes(message.id)
          ? [
              [
                message.id,
                {
                  messageId: message.id,
                  outcome: "HIGH_CAUTION" as const,
                  signalCodes: ["OTP_REQUEST"] as const,
                  analysisVersion: "ROOMMATE_AI_SAFETY_V3_1",
                  promptVersion: "ROOMMATE_AI_SAFETY_PROMPT_V1",
                  modelIdentifier: "configured-model-id",
                  analyzedAt: "2026-08-31T00:00:05.000Z"
                }
              ]
            ]
          : []
      );
    }
  } as unknown as RoommateAiSafetyRepository;
  return createRoommateSafetyService({
    roommateRepository,
    safetyRepository,
    aiSafetyRepository,
    aiCapabilityService: { isSafetyWarningEnabled: () => safetyEnabled },
    identityAccountClient: {
      async loadRoommateTenantProjectionsByIds() {
        return [];
      }
    },
    transactionRunner: { run: (operation) => operation({ query: async () => ({ rows: [], rowCount: 0 }) }) }
  });
}

test("tenant safety projection is recipient-only and suppressed outside the safety capability", async () => {
  const query = { page: 1, pageSize: 100, offset: 0 };
  const recipientVisible = await service(true).listMessages(recipient, 9, query);
  assert.equal(recipientVisible.data[0]?.safetyWarning?.outcome, "HIGH_CAUTION");
  assert.deepEqual(recipientVisible.data[0]?.safetyWarning?.signalCodes, ["OTP_REQUEST"]);

  const senderHidden = await service(true).listMessages(sender, 9, query);
  assert.equal(senderHidden.data[0]?.safetyWarning, null);

  const disabledHidden = await service(false).listMessages(recipient, 9, query);
  assert.equal(disabledHidden.data[0]?.safetyWarning, null);
});
