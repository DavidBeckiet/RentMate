import assert from "node:assert/strict";
import test from "node:test";
import {
  createContactVerificationDelivery,
  type ContactVerificationDeliveryInput
} from "../src/modules/verifications/contact-verification-delivery.js";

const input: ContactVerificationDeliveryInput = Object.freeze({
  channel: "EMAIL",
  destination: "owner@example.com",
  secret: "one-time-secret"
});

test("sends the minimal verification webhook contract with a timeout signal", async () => {
  let request: { readonly url: string; readonly init: RequestInit } | null = null;
  const delivery = createContactVerificationDelivery({
    nodeEnvironment: "production",
    deliveryUrl: "https://delivery.example.test/verify/",
    deliveryToken: "staging-token",
    timeoutMs: 50,
    fetcher: async (url, init) => {
      request = { url: String(url), init: init ?? {} };
      return new Response(null, { status: 204 });
    }
  });

  await delivery.deliver(input);

  assert.equal(request?.url, "https://delivery.example.test/verify");
  assert.equal(request?.init.method, "POST");
  assert.equal(new Headers(request?.init.headers).get("content-type"), "application/json");
  assert.equal(new Headers(request?.init.headers).get("x-rentmate-verification-token"), "staging-token");
  assert.deepEqual(JSON.parse(String(request?.init.body)), input);
  assert.ok(request?.init.signal instanceof AbortSignal);
});

test("maps provider rejection and timeout to safe delivery errors", async () => {
  const rejected = createContactVerificationDelivery({
    nodeEnvironment: "production",
    deliveryUrl: "https://delivery.example.test/verify",
    deliveryToken: "staging-token",
    fetcher: async () => new Response("provider secret", { status: 503 })
  });
  await assert.rejects(() => rejected.deliver(input), /provider rejected/);

  const timedOut = createContactVerificationDelivery({
    nodeEnvironment: "production",
    deliveryUrl: "https://delivery.example.test/verify",
    deliveryToken: "staging-token",
    timeoutMs: 5,
    fetcher: async (_url, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      })
  });
  await assert.rejects(() => timedOut.deliver(input), /provider is unavailable/);
});

test("reports independent channel availability without sending to an unavailable provider", async () => {
  const delivery = createContactVerificationDelivery({
    nodeEnvironment: "test",
    deliveryUrl: "",
    deliveryToken: "",
    emailAvailable: true,
    phoneAvailable: false
  });

  assert.equal(delivery.isAvailable("EMAIL"), true);
  assert.equal(delivery.isAvailable("PHONE"), false);
  await assert.rejects(
    () => delivery.deliver({ ...input, channel: "PHONE", destination: "+84901234567" }),
    /provider is unavailable/
  );
});
