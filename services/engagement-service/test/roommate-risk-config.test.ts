import assert from "node:assert/strict";
import test from "node:test";
import { defaultRoommateRiskConfig, parseEnvironment } from "../../shared/src/runtime/config/env.js";

const developmentEnvironment = {
  NODE_ENV: "development",
  FRONTEND_ORIGIN: "http://localhost:3000"
} as const;

test("Roommate risk defaults are versioned, positive, bounded, and documented", () => {
  const config = parseEnvironment(developmentEnvironment).roommateRisk;
  assert.deepEqual(config, defaultRoommateRiskConfig);
  assert.equal(config.rulesVersion, "ROOMMATE_RISK_V2_1");
  assert.equal(config.solicitationPatternVersion, "V1");
  for (const value of [
    config.repeatedMessageWindowMs,
    config.repeatedMessageCounterpartThreshold,
    config.rapidInterestWindowMs,
    config.rapidInterestCountThreshold,
    config.highMessageWindowMs,
    config.highMessageCountThreshold,
    config.highMessageThreadThreshold,
    config.solicitationWindowMs,
    config.solicitationCounterpartThreshold,
    config.reportWindowMs,
    config.reportCountThreshold,
    config.reporterCountThreshold,
    config.currentBlockWindowMs,
    config.currentBlockerThreshold,
    config.newAccountWindowMs,
    config.activityRowLimit,
    config.reportBatchSize
  ]) {
    assert.equal(Number.isInteger(value), true);
    assert.equal(value > 0, true);
  }
});

test("Roommate risk configuration rejects values outside each bounded family", () => {
  const boundaries = [
    ["ROOMMATE_RISK_REPEATED_MESSAGE_WINDOW_MS", "999"],
    ["ROOMMATE_RISK_REPEATED_MESSAGE_COUNTERPART_THRESHOLD", "1"],
    ["ROOMMATE_RISK_RAPID_INTEREST_WINDOW_MS", "31536000001"],
    ["ROOMMATE_RISK_RAPID_INTEREST_COUNT_THRESHOLD", "1001"],
    ["ROOMMATE_RISK_HIGH_MESSAGE_WINDOW_MS", "0"],
    ["ROOMMATE_RISK_HIGH_MESSAGE_COUNT_THRESHOLD", "10001"],
    ["ROOMMATE_RISK_HIGH_MESSAGE_THREAD_THRESHOLD", "1"],
    ["ROOMMATE_RISK_SOLICITATION_WINDOW_MS", "31536000001"],
    ["ROOMMATE_RISK_SOLICITATION_COUNTERPART_THRESHOLD", "101"],
    ["ROOMMATE_RISK_SOLICITATION_PATTERN_VERSION", "V2"],
    ["ROOMMATE_RISK_REPORT_WINDOW_MS", "999"],
    ["ROOMMATE_RISK_REPORT_COUNT_THRESHOLD", "1"],
    ["ROOMMATE_RISK_REPORTER_COUNT_THRESHOLD", "1001"],
    ["ROOMMATE_RISK_CURRENT_BLOCK_WINDOW_MS", "31536000001"],
    ["ROOMMATE_RISK_CURRENT_BLOCKER_THRESHOLD", "1"],
    ["ROOMMATE_RISK_NEW_ACCOUNT_WINDOW_MS", "0"],
    ["ROOMMATE_RISK_ACTIVITY_ROW_LIMIT", "99"],
    ["ROOMMATE_RISK_REPORT_BATCH_SIZE", "101"]
  ] as const;

  for (const [key, value] of boundaries) {
    assert.throws(
      () => parseEnvironment({ ...developmentEnvironment, [key]: value }),
      new RegExp(key.replaceAll("_", "_"), "u")
    );
  }
});
