import assert from "node:assert/strict";
import test from "node:test";
import { defaultRoommateRiskConfig, type RoommateRiskConfig } from "../../shared/src/runtime/config/env.js";
import {
  evaluateRoommateRisk,
  hasRoommateSolicitationPattern,
  normalizeRoommateRiskMessage,
  type RoommateRiskActivity
} from "../src/modules/roommate/roommate-risk.js";

const now = new Date("2026-08-28T12:00:00.000Z");
const config: RoommateRiskConfig = Object.freeze({
  ...defaultRoommateRiskConfig,
  repeatedMessageCounterpartThreshold: 3,
  rapidInterestCountThreshold: 3,
  highMessageCountThreshold: 4,
  highMessageThreadThreshold: 2,
  solicitationCounterpartThreshold: 2,
  reportCountThreshold: 2,
  reporterCountThreshold: 2,
  currentBlockerThreshold: 2
});

function activity(overrides: Partial<RoommateRiskActivity> = {}): RoommateRiskActivity {
  return {
    messages: overrides.messages ?? [],
    interests: overrides.interests ?? [],
    reports: overrides.reports ?? [],
    currentBlockers: overrides.currentBlockers ?? []
  };
}

test("normalizes Roommate risk messages with NFC, line endings, whitespace, and case folding", () => {
  assert.equal(normalizeRoommateRiskMessage("  MÌNH\r\n  Cha\u0300o bạn  "), "mình chào bạn");
  assert.equal(normalizeRoommateRiskMessage("A\n\tB"), "a b");
});

test("evaluates every frozen risk flag at configured thresholds", () => {
  const result = evaluateRoommateRisk({
    now,
    config,
    reportCategory: "FRAUD",
    accountCreatedAt: "2026-08-28T11:30:00.000Z",
    activity: activity({
      messages: [
        {
          id: 1,
          interestId: 1,
          counterpartTenantId: 101,
          body: "Cha\u0300o bạn",
          createdAt: "2026-08-28T11:59:00.000Z"
        },
        { id: 2, interestId: 2, counterpartTenantId: 102, body: "  chào bạn  ", createdAt: "2026-08-28T11:58:00.000Z" },
        { id: 3, interestId: 3, counterpartTenantId: 103, body: "CHÀO BẠN", createdAt: "2026-08-28T11:57:00.000Z" },
        {
          id: 4,
          interestId: 4,
          counterpartTenantId: 101,
          body: "Chuyển khoản trước nhé",
          createdAt: "2026-08-28T11:56:00.000Z"
        },
        {
          id: 5,
          interestId: 5,
          counterpartTenantId: 102,
          body: "Đặt cọc hôm nay nhé",
          createdAt: "2026-08-28T11:55:00.000Z"
        },
        { id: 6, interestId: 4, counterpartTenantId: 101, body: "Tin nhắn khác", createdAt: "2026-08-28T11:54:00.000Z" }
      ],
      interests: [
        { id: 10, createdAt: "2026-08-28T11:59:00.000Z" },
        { id: 11, createdAt: "2026-08-28T11:58:00.000Z" },
        { id: 12, createdAt: "2026-08-28T11:57:00.000Z" }
      ],
      reports: [
        { id: 20, reporterTenantId: 201, createdAt: "2026-08-28T11:56:00.000Z" },
        { id: 21, reporterTenantId: 202, createdAt: "2026-08-28T11:55:00.000Z" }
      ],
      currentBlockers: [
        { blockerTenantId: 301, createdAt: "2026-08-28T11:54:00.000Z" },
        { blockerTenantId: 302, createdAt: "2026-08-28T11:53:00.000Z" }
      ]
    })
  });

  assert.deepEqual(
    result.flags.map((flag) => flag.code),
    [
      "REPEATED_MESSAGE_ACROSS_THREADS",
      "RAPID_INTEREST_ACTIVITY",
      "HIGH_MESSAGE_VOLUME",
      "REPEATED_EXTERNAL_CONTACT_SOLICITATION",
      "REPEATED_REPORT_PATTERN",
      "MULTIPLE_CURRENT_BLOCKERS",
      "NEW_ACCOUNT_WITH_UNUSUAL_ACTIVITY"
    ]
  );
  assert.equal(result.reviewPriority, "ELEVATED");
  assert.equal(result.partialEvaluation, false);
  assert.deepEqual(result.flags[0]?.evidenceSummary.messageIds, [1, 2, 3]);
  assert.equal(result.flags[3]?.evidenceSummary.distinctCounterpartCount, 2);
  assert.equal(result.flags[4]?.evidenceSummary.distinctReporterCount, 2);
  assert.equal(result.flags[5]?.evidenceSummary.currentBlockerCount, 2);
  assert.equal(result.flags[6]?.evidenceSummary.accountCreatedAt, "2026-08-28T11:30:00.000Z");
  assert.equal("riskScore" in result, false);
});

test("uses inclusive time boundaries and does not flag a single solicitation or ordinary numbers", () => {
  const boundary = new Date(now.getTime() - config.rapidInterestWindowMs).toISOString();
  const outside = new Date(now.getTime() - config.rapidInterestWindowMs - 1).toISOString();
  const result = evaluateRoommateRisk({
    now,
    config,
    activity: activity({
      interests: [
        { id: 1, createdAt: boundary },
        { id: 2, createdAt: "2026-08-28T11:59:00.000Z" },
        { id: 3, createdAt: "2026-08-28T11:58:00.000Z" },
        { id: 4, createdAt: outside }
      ],
      messages: [
        {
          id: 9,
          interestId: 9,
          counterpartTenantId: 999,
          body: "Ngân sách 5.000.000, phòng 12.",
          createdAt: "2026-08-28T11:59:00.000Z"
        }
      ]
    })
  });
  assert.equal(result.flags.find((flag) => flag.code === "RAPID_INTEREST_ACTIVITY")?.observedCount, 3);
  assert.equal(
    result.flags.some((flag) => flag.code === "REPEATED_EXTERNAL_CONTACT_SOLICITATION"),
    false
  );
  assert.equal(hasRoommateSolicitationPattern("Ngân sách 5.000.000, phòng 12.", "V1"), false);
  assert.equal(hasRoommateSolicitationPattern("Mã OTP của bạn là 123456", "V1"), true);
});

test("partial Identity evaluation never fabricates the new-account flag and preserves Engagement flags", () => {
  const result = evaluateRoommateRisk({
    now,
    config,
    activity: activity({
      reports: [
        { id: 1, reporterTenantId: 10, createdAt: "2026-08-28T11:00:00.000Z" },
        { id: 2, reporterTenantId: 11, createdAt: "2026-08-28T10:59:00.000Z" }
      ]
    })
  });
  assert.equal(result.partialEvaluation, true);
  assert.deepEqual(
    result.flags.map((flag) => flag.code),
    ["REPEATED_REPORT_PATTERN"]
  );
  assert.equal(
    result.flags.some((flag) => flag.code === "NEW_ACCOUNT_WITH_UNUSUAL_ACTIVITY"),
    false
  );
});

test("a single solicitation flag is Standard unless the report category rule elevates it", () => {
  const base = activity({
    messages: [
      {
        id: 1,
        interestId: 1,
        counterpartTenantId: 101,
        body: "Chuyển khoản trước",
        createdAt: "2026-08-28T11:59:00.000Z"
      },
      { id: 2, interestId: 2, counterpartTenantId: 102, body: "Đặt cọc trước", createdAt: "2026-08-28T11:58:00.000Z" }
    ]
  });
  assert.equal(evaluateRoommateRisk({ now, config, activity: base }).reviewPriority, "STANDARD");
  assert.equal(
    evaluateRoommateRisk({ now, config, reportCategory: "PAYMENT_SCAM", activity: base }).reviewPriority,
    "ELEVATED"
  );
});

test("bounds evidence IDs and keeps the newest deterministic ordering", () => {
  const messages = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
    interestId: index + 1,
    counterpartTenantId: index < 2 ? 100 + index : 100,
    body: "same body",
    createdAt: new Date(now.getTime() - index * 1_000).toISOString()
  }));
  const result = evaluateRoommateRisk({
    now,
    config: { ...config, repeatedMessageCounterpartThreshold: 2 },
    activity: activity({ messages })
  });
  const repeated = result.flags.find((flag) => flag.code === "REPEATED_MESSAGE_ACROSS_THREADS");
  assert.deepEqual(
    repeated?.evidenceSummary.messageIds,
    Array.from({ length: 20 }, (_, index) => index + 1)
  );
  assert.deepEqual(
    repeated?.evidenceSummary.interestIds,
    Array.from({ length: 20 }, (_, index) => index + 1)
  );
});
