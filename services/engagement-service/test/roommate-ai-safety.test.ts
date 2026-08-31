import assert from "node:assert/strict";
import test from "node:test";
import { parseRoommateAiConfiguration } from "../src/modules/roommate-ai/config/roommate-ai-config.js";
import { FakeAiProvider } from "../src/modules/roommate-ai/providers/fake-ai-provider.js";
import { createRoommateAiSafetyWorker } from "../src/modules/roommate-ai/services/roommate-ai-safety-worker.js";
import { roommateAiSafetyWorkerPolicy } from "../src/modules/roommate-ai/services/roommate-ai-safety-worker.js";
import { AiProviderError } from "../src/modules/roommate-ai/providers/ai-provider-error.js";
import {
  buildRoommateAiSafetyContext,
  deriveRoommateAiSafetyOutcome,
  hasRoommateAiSafetyPrefilterSignal,
  redactRoommateAiSafetyText,
  validateRoommateAiSafetyOutput,
  roommateAiSafetySignalCodes
} from "../src/modules/roommate-ai/safety-analysis.js";
import type { AiGenerationRequest, AiGenerationResult } from "../src/modules/roommate-ai/providers/ai-provider.js";
import type { RoommateAiSafetyRepository } from "../src/modules/roommate-ai/repositories/roommate-ai-safety-repository.js";

const source = (id: number, senderTenantId: number, body: string, createdAt = `2026-08-30T00:00:0${id}.000Z`) =>
  ({ id, senderTenantId, body, createdAt }) as const;

test("safety context is same-thread, chronological, opaque, bounded, and redacted", () => {
  const context = buildRoommateAiSafetyContext({
    target: source(9, 2, "Gửi mã OTP 123456 qua https://example.test cho a@example.test"),
    previous: [
      source(1, 1, "0901234567"),
      source(2, 2, "before"),
      source(3, 1, "account 123456789012"),
      source(4, 1, "ignored by prefilter selection"),
      source(5, 1, "latest previous")
    ]
  });
  assert.equal(context.length, 6);
  assert.deepEqual(
    context.map((message) => message.token),
    ["M0", "M1", "M2", "M3", "M4", "M5"]
  );
  assert.deepEqual(
    context.map((message) => message.role),
    ["COUNTERPART", "SENDER", "COUNTERPART", "COUNTERPART", "COUNTERPART", "SENDER"]
  );
  assert.equal(JSON.stringify(context).includes("123456"), false);
  assert.equal(JSON.stringify(context).includes("example.test"), false);
  assert.equal(JSON.stringify(context).includes("a@example.test"), false);
  assert.equal(JSON.stringify(context).includes("9"), false);
  assert.equal(context.at(-1)?.text.includes("<OTP>"), true);
  assert.equal(context.at(-1)?.text.includes("<URL>"), true);
  assert.equal(context.at(-1)?.text.includes("<EMAIL>"), true);
  assert.equal(redactRoommateAiSafetyText("Tiền phòng 4 triệu/tháng").includes("<"), false);
});

test("safety schema grounds seven signals only and outcome remains application-owned", () => {
  const messages = buildRoommateAiSafetyContext({ target: source(2, 1, "hello"), previous: [source(1, 2, "before")] });
  const valid = validateRoommateAiSafetyOutput(
    { signals: [{ code: "OTP_REQUEST", evidenceMessageTokens: ["M1"] }] },
    messages
  );
  assert.deepEqual(valid.signals[0]?.evidenceMessageTokens, ["M1"]);
  assert.throws(() =>
    validateRoommateAiSafetyOutput({ signals: [{ code: "UNKNOWN", evidenceMessageTokens: ["M1"] }] }, messages)
  );
  assert.throws(() =>
    validateRoommateAiSafetyOutput({ signals: [{ code: "OTP_REQUEST", evidenceMessageTokens: ["M5"] }] }, messages)
  );
  assert.equal(deriveRoommateAiSafetyOutcome([]), "NO_WARNING");
  assert.equal(deriveRoommateAiSafetyOutcome(["OTP_REQUEST"]), "HIGH_CAUTION");
  assert.equal(deriveRoommateAiSafetyOutcome(["CREDENTIAL_REQUEST"]), "HIGH_CAUTION");
  assert.equal(deriveRoommateAiSafetyOutcome(["SENSITIVE_FINANCIAL_INFO_REQUEST"]), "HIGH_CAUTION");
  assert.equal(deriveRoommateAiSafetyOutcome(["ADVANCE_PAYMENT_REQUEST"]), "CAUTION");
  assert.equal(deriveRoommateAiSafetyOutcome(["OFF_PLATFORM_REDIRECTION"]), "CAUTION");
  assert.equal(deriveRoommateAiSafetyOutcome(["URGENCY_PRESSURE"]), "CAUTION");
  assert.equal(deriveRoommateAiSafetyOutcome(["EXTERNAL_PAYMENT_REQUEST", "URGENCY_PRESSURE"]), "HIGH_CAUTION");
  assert.equal(deriveRoommateAiSafetyOutcome(["ADVANCE_PAYMENT_REQUEST", "OFF_PLATFORM_REDIRECTION"]), "HIGH_CAUTION");
  for (const code of [
    "ADVANCE_PAYMENT_REQUEST",
    "OFF_PLATFORM_REDIRECTION",
    "EXTERNAL_PAYMENT_REQUEST",
    "URGENCY_PRESSURE"
  ] as const) {
    assert.equal(deriveRoommateAiSafetyOutcome([code]), "CAUTION");
  }
  assert.equal(deriveRoommateAiSafetyOutcome(["ADVANCE_PAYMENT_REQUEST", "URGENCY_PRESSURE"]), "HIGH_CAUTION");
  assert.equal(deriveRoommateAiSafetyOutcome(["EXTERNAL_PAYMENT_REQUEST", "OFF_PLATFORM_REDIRECTION"]), "HIGH_CAUTION");
});

test("redaction covers Vietnamese and international sensitive values without false-positive rent numbers", () => {
  const text = [
    "Email a@example.test",
    "số điện thoại 0901234567",
    "+84 901 234 567",
    "https://example.test/path",
    "mã xác thực 123456",
    "số tài khoản 123456789012",
    "mật khẩu: secret-value"
  ].join(" ");
  const redacted = redactRoommateAiSafetyText(text);
  assert.equal(redacted.includes("a@example.test"), false);
  assert.equal(redacted.includes("0901234567"), false);
  assert.equal(redacted.includes("901 234 567"), false);
  assert.equal(redacted.includes("https://example.test"), false);
  assert.equal(redacted.includes("123456"), false);
  assert.equal(redacted.includes("123456789012"), false);
  assert.equal(redacted.includes("<EMAIL>"), true);
  assert.equal(redacted.includes("<PHONE>"), true);
  assert.equal(redacted.includes("<URL>"), true);
  assert.equal(redacted.includes("<OTP>"), true);
  assert.equal(redacted.includes("<ACCOUNT>"), true);
  assert.equal(redacted.includes("<SECRET>"), true);
  assert.equal(redactRoommateAiSafetyText("Tiền phòng 4 triệu/tháng").includes("<"), false);
  for (const benign of [
    "Tiền phòng 4 triệu/tháng.",
    "Tiền cọc một tháng.",
    "Điện nước chia đôi.",
    "Ngân sách của bạn khoảng bao nhiêu?",
    "Bạn chuyển vào ngày nào?"
  ])
    assert.equal(hasRoommateAiSafetyPrefilterSignal(benign), false);
  assert.equal(hasRoommateAiSafetyPrefilterSignal("Gửi mã xác thực 123456"), true);
});

test("context keeps the target, selects the deterministic pre-filter window, and uses Unicode code points", () => {
  const ordinary = buildRoommateAiSafetyContext({
    target: source(20, 2, "ordinary"),
    previous: [source(10, 1, "one"), source(11, 1, "two"), source(12, 1, "three")]
  });
  assert.deepEqual(
    ordinary.map((message) => message.token),
    ["M0", "M1"]
  );

  const targetBody = `OTP 123456 ${"😀".repeat(4_000)}`;
  const bounded = buildRoommateAiSafetyContext({
    target: source(99, 2, targetBody),
    previous: Array.from({ length: 6 }, (_, index) => source(index + 1, 1, "x".repeat(2_000)))
  });
  assert.equal(bounded.at(-1)?.text.includes("<OTP>"), true);
  assert.equal(bounded.at(-1)?.token, "M5");
  assert.equal(bounded.reduce((total, message) => total + Array.from(message.text).length, 0) <= 6_000, true);
  assert.equal(Array.from(bounded.at(-1)?.text ?? "").length <= 2_000, true);
  assert.equal(
    bounded.some((message) => message.text.includes("😀")),
    true
  );
});

test("all seven signals are accepted exactly once and opaque grounding rejects unknown or duplicate tokens", () => {
  const messages = buildRoommateAiSafetyContext({ target: source(2, 1, "target"), previous: [] });
  for (const code of roommateAiSafetySignalCodes) {
    const output = validateRoommateAiSafetyOutput({ signals: [{ code, evidenceMessageTokens: ["M0"] }] }, messages);
    assert.equal(output.signals[0]?.code, code);
  }
  assert.throws(() =>
    validateRoommateAiSafetyOutput({ signals: [{ code: "NOT_A_SIGNAL", evidenceMessageTokens: ["M0"] }] }, messages)
  );
  assert.throws(() =>
    validateRoommateAiSafetyOutput({ signals: [{ code: "OTP_REQUEST", evidenceMessageTokens: ["M9"] }] }, messages)
  );
  assert.throws(() =>
    validateRoommateAiSafetyOutput(
      { signals: [{ code: "OTP_REQUEST", evidenceMessageTokens: ["M0", "M0"] }] },
      messages
    )
  );
});

test("retryable safety failures use the finite two-attempt lifecycle and invalid output is terminal", async () => {
  const failures: Array<{ readonly attempt: number; readonly retryAt: Date | null; readonly errorCode: string }> = [];
  let claimCount = 0;
  const repository: RoommateAiSafetyRepository = {
    discover: async () => 1,
    terminalizeStale: async () => 0,
    claim: async () => {
      claimCount += 1;
      return claimCount <= 2 ? [{ id: 1, messageId: 1, attemptCount: claimCount }] : [];
    },
    loadContext: async () => ({ target: source(1, 2, "send OTP 123456"), previous: [] }),
    complete: async () => false,
    fail: async (_executor, input) => {
      failures.push({ attempt: claimCount, retryAt: input.retryAt, errorCode: input.errorCode });
      return true;
    },
    cleanup: async () => 0
  };
  const provider = new FakeAiProvider({ scenario: "TIMEOUT" });
  const now = new Date("2026-08-31T00:00:00.000Z");
  const worker = createRoommateAiSafetyWorker({
    configuration: parseRoommateAiConfiguration({
      ROOMMATE_AI_PROVIDER: "GEMINI",
      ROOMMATE_AI_ENABLED: "true",
      ROOMMATE_AI_SAFETY_MODE: "SHADOW",
      GEMINI_API_KEY: "synthetic-server-key",
      ROOMMATE_AI_SAFETY_MODEL: "gemini-safety"
    }),
    provider,
    repository,
    transactionRunner: { run: (operation) => operation({ query: async () => ({ rows: [], rowCount: 0 }) }) },
    logger: { info() {}, error() {} },
    now: () => now
  });
  const first = await worker.runOnce();
  const second = await worker.runOnce();
  assert.equal(first.failed, 0);
  assert.equal(second.failed, 1);
  assert.equal(failures.length, 2);
  assert.equal(failures[0]!.errorCode, "TIMEOUT");
  assert.equal(failures[0]!.retryAt?.getTime(), now.getTime() + roommateAiSafetyWorkerPolicy.retryDelaysMs[0]!);
  assert.equal(failures[1]!.retryAt, null);
  assert.equal(provider.requests.length, 2);

  const terminalFailures: string[] = [];
  const invalidProvider = new FakeAiProvider({ scenario: "SCHEMA_INVALID" });
  const invalidWorker = createRoommateAiSafetyWorker({
    configuration: parseRoommateAiConfiguration({
      ROOMMATE_AI_PROVIDER: "GEMINI",
      ROOMMATE_AI_ENABLED: "true",
      ROOMMATE_AI_SAFETY_MODE: "SHADOW",
      GEMINI_API_KEY: "synthetic-server-key",
      ROOMMATE_AI_SAFETY_MODEL: "gemini-safety"
    }),
    provider: invalidProvider,
    repository: {
      ...repository,
      claim: async () => [{ id: 2, messageId: 2, attemptCount: 1 }],
      fail: async (_executor, input) => {
        terminalFailures.push(input.errorCode);
        return true;
      }
    },
    transactionRunner: { run: (operation) => operation({ query: async () => ({ rows: [], rowCount: 0 }) }) },
    logger: { info() {}, error() {} },
    now: () => now
  });
  const invalidResult = await invalidWorker.runOnce();
  assert.equal(invalidResult.failed, 1);
  assert.deepEqual(terminalFailures, ["SCHEMA_INVALID"]);
});

test("transport, provider-unavailable, rate-limit, and server failures retry once and then stop", async () => {
  for (const [scenario, expectedCode] of [
    ["TRANSPORT_FAILURE", "TRANSPORT"],
    ["RATE_LIMITED", "RATE_LIMITED"],
    ["SERVER_ERROR", "SERVER_ERROR"]
  ] as const) {
    let claimCount = 0;
    const failures: Array<{ readonly retryAt: Date | null; readonly errorCode: string }> = [];
    const repository: RoommateAiSafetyRepository = {
      discover: async () => 1,
      terminalizeStale: async () => 0,
      claim: async () => {
        claimCount += 1;
        return claimCount <= 2 ? [{ id: claimCount, messageId: claimCount, attemptCount: claimCount }] : [];
      },
      loadContext: async (_executor, messageId) => ({ target: source(messageId, 2, "message"), previous: [] }),
      complete: async () => false,
      fail: async (_executor, input) => {
        failures.push({ retryAt: input.retryAt, errorCode: input.errorCode });
        return true;
      },
      cleanup: async () => 0
    };
    const worker = createRoommateAiSafetyWorker({
      configuration: parseRoommateAiConfiguration({
        ROOMMATE_AI_PROVIDER: "GEMINI",
        ROOMMATE_AI_ENABLED: "true",
        ROOMMATE_AI_SAFETY_MODE: "SHADOW",
        GEMINI_API_KEY: "synthetic-server-key",
        ROOMMATE_AI_SAFETY_MODEL: "gemini-safety"
      }),
      provider: new FakeAiProvider({ scenario }),
      repository,
      transactionRunner: { run: (operation) => operation({ query: async () => ({ rows: [], rowCount: 0 }) }) },
      logger: { info() {}, error() {} },
      now: () => new Date("2026-08-31T00:00:00.000Z")
    });
    const first = await worker.runOnce();
    const second = await worker.runOnce();
    assert.equal(first.failed, 0);
    assert.equal(second.failed, 1);
    assert.equal(failures.length, 2);
    assert.equal(failures[0]?.retryAt !== null, true);
    assert.equal(failures[1]?.retryAt, null);
    assert.equal(failures[0]?.errorCode, expectedCode);
  }
});

test("malformed output, invalid signals, invalid evidence, and permanent provider failures are terminal", async () => {
  const cases = [
    { options: { scenario: "MALFORMED_OUTPUT" as const }, expectedCode: "MALFORMED_OUTPUT" },
    { options: { scenario: "AUTH_OR_PERMISSION" as const }, expectedCode: "AUTH_OR_PERMISSION" },
    { options: { scenario: "SAFETY_BLOCK" as const }, expectedCode: "SAFETY_BLOCK" },
    { options: { scenario: "REFUSAL" as const }, expectedCode: "REFUSAL" },
    { options: { scenario: "EMPTY_OUTPUT" as const }, expectedCode: "EMPTY_OUTPUT" },
    {
      options: { output: { signals: [{ code: "NOT_A_SIGNAL", evidenceMessageTokens: ["M0"] }] } },
      expectedCode: "SCHEMA_INVALID"
    },
    {
      options: { output: { signals: [{ code: "OTP_REQUEST", evidenceMessageTokens: ["M9"] }] } },
      expectedCode: "SCHEMA_INVALID"
    }
  ];
  for (const { options, expectedCode } of cases) {
    const failures: Array<{ readonly retryAt: Date | null; readonly errorCode: string }> = [];
    const repository: RoommateAiSafetyRepository = {
      discover: async () => 1,
      terminalizeStale: async () => 0,
      claim: async () => [{ id: 1, messageId: 1, attemptCount: 1 }],
      loadContext: async () => ({ target: source(1, 2, "message"), previous: [] }),
      complete: async () => false,
      fail: async (_executor, input) => {
        failures.push({ retryAt: input.retryAt, errorCode: input.errorCode });
        return true;
      },
      cleanup: async () => 0
    };
    const worker = createRoommateAiSafetyWorker({
      configuration: parseRoommateAiConfiguration({
        ROOMMATE_AI_PROVIDER: "GEMINI",
        ROOMMATE_AI_ENABLED: "true",
        ROOMMATE_AI_SAFETY_MODE: "SHADOW",
        GEMINI_API_KEY: "synthetic-server-key",
        ROOMMATE_AI_SAFETY_MODEL: "gemini-safety"
      }),
      provider: new FakeAiProvider(options),
      repository,
      transactionRunner: { run: (operation) => operation({ query: async () => ({ rows: [], rowCount: 0 }) }) },
      logger: { info() {}, error() {} }
    });
    const result = await worker.runOnce();
    assert.equal(result.failed, 1);
    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.retryAt, null);
    assert.equal(failures[0]?.errorCode, expectedCode);
  }
});

test("a persistence error for one poisoned item does not abort the remaining worker batch", async () => {
  let providerCalls = 0;
  let completed = 0;
  let failed = 0;
  const repository: RoommateAiSafetyRepository = {
    discover: async () => 2,
    terminalizeStale: async () => 0,
    claim: async () => [
      { id: 1, messageId: 1, attemptCount: 1 },
      { id: 2, messageId: 2, attemptCount: 1 }
    ],
    loadContext: async (_executor, messageId) => ({ target: source(messageId, 2, "message"), previous: [] }),
    complete: async () => {
      completed += 1;
      return true;
    },
    fail: async () => {
      failed += 1;
      if (failed === 1) throw new Error("synthetic persistence failure");
      return true;
    },
    cleanup: async () => 0
  };
  const valid = new FakeAiProvider({ output: { signals: [] } });
  const provider = {
    async generate<Output>(request: AiGenerationRequest<Output>): Promise<AiGenerationResult<Output>> {
      providerCalls += 1;
      if (providerCalls === 1) throw new AiProviderError("TRANSPORT", "AI_PROVIDER_UNAVAILABLE");
      return valid.generate(request);
    }
  };
  const worker = createRoommateAiSafetyWorker({
    configuration: parseRoommateAiConfiguration({
      ROOMMATE_AI_PROVIDER: "GEMINI",
      ROOMMATE_AI_ENABLED: "true",
      ROOMMATE_AI_SAFETY_MODE: "SHADOW",
      GEMINI_API_KEY: "synthetic-server-key",
      ROOMMATE_AI_SAFETY_MODEL: "gemini-safety"
    }),
    provider,
    repository,
    transactionRunner: { run: (operation) => operation({ query: async () => ({ rows: [], rowCount: 0 }) }) },
    logger: { info() {}, error() {} }
  });
  const result = await worker.runOnce();
  assert.equal(providerCalls, 2);
  assert.equal(completed, 1);
  assert.equal(result.completed, 1);
});

test("shadow worker calls the provider only after its claim transaction and persists no public projection", async () => {
  let insideTransaction = false;
  let completed = 0;
  const repository: RoommateAiSafetyRepository = {
    discover: async () => 0,
    terminalizeStale: async () => 0,
    claim: async () => [{ id: 1, messageId: 44, attemptCount: 1 }],
    loadContext: async () => ({ target: source(44, 2, "send OTP 123456"), previous: [source(43, 1, "hello")] }),
    complete: async () => {
      completed += 1;
      return true;
    },
    fail: async () => false,
    cleanup: async () => 0
  };
  const provider = new FakeAiProvider({
    output: { signals: [{ code: "OTP_REQUEST", evidenceMessageTokens: ["M1"] }] }
  });
  const worker = createRoommateAiSafetyWorker({
    configuration: parseRoommateAiConfiguration({
      ROOMMATE_AI_PROVIDER: "GEMINI",
      ROOMMATE_AI_ENABLED: "true",
      ROOMMATE_AI_SAFETY_MODE: "SHADOW",
      GEMINI_API_KEY: "synthetic-server-key",
      ROOMMATE_AI_SAFETY_MODEL: "gemini-safety"
    }),
    provider: {
      async generate(request) {
        assert.equal(insideTransaction, false);
        return provider.generate(request);
      }
    },
    repository,
    transactionRunner: {
      async run(operation) {
        insideTransaction = true;
        try {
          return await operation({ query: async () => ({ rows: [], rowCount: 0 }) });
        } finally {
          insideTransaction = false;
        }
      }
    },
    logger: { info() {}, error() {} }
  });
  const result = await worker.runOnce();
  assert.equal(result.completed, 1);
  assert.equal(completed, 1);
  assert.equal(provider.requests.length, 1);
  assert.equal(JSON.stringify(provider.requests[0]?.input).includes("44"), false);
});

test("OFF mode does not discover work or call a provider", async () => {
  let calls = 0;
  const worker = createRoommateAiSafetyWorker({
    configuration: parseRoommateAiConfiguration({ ROOMMATE_AI_PROVIDER: "DISABLED" }),
    provider: null,
    repository: {} as RoommateAiSafetyRepository,
    transactionRunner: {
      run: async () => {
        calls += 1;
        throw new Error("must not run");
      }
    },
    logger: { info() {}, error() {} }
  });
  assert.deepEqual(await worker.runOnce(), { discovered: 0, claimed: 0, completed: 0, failed: 0 });
  assert.equal(calls, 0);
});
