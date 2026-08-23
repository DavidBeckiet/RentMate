import assert from "node:assert/strict";
import test from "node:test";
import { validateAnalyticsQuery } from "../src/modules/analytics/validations/analytics-validation.js";

test("defaults to 30 days and accepts controlled periods", () => {
  assert.deepEqual(validateAnalyticsQuery({}), { period: "30D", days: 30 });
  assert.deepEqual(validateAnalyticsQuery({ period: "7d" }), { period: "7D", days: 7 });
  assert.deepEqual(validateAnalyticsQuery({ period: "90D" }), { period: "90D", days: 90 });
});

test("rejects unsupported periods and unknown query fields", () => {
  assert.throws(() => validateAnalyticsQuery({ period: "365D" }), /invalid data/i);
  assert.throws(() => validateAnalyticsQuery({ period: "30D", tenantId: "1" }), /invalid data/i);
});
