import assert from "node:assert/strict";
import test from "node:test";
import {
  createPasswordResetDelivery,
  type PasswordResetDeliveryInput
} from "../src/modules/auth/password-reset-delivery.js";

const input: PasswordResetDeliveryInput = Object.freeze({
  destination: "tenant@example.test",
  secret: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-_0123456789",
  resetUrl: "http://localhost:3000/reset-password?token=0123456789"
});

test("sends password reset webhook payload without exposing it through the API", async () => {
  let request: { readonly url: string; readonly init: RequestInit } | null = null;
  const delivery = createPasswordResetDelivery({
    nodeEnvironment: "production",
    deliveryUrl: "https://delivery.example.test/events/",
    deliveryToken: "staging-token",
    fetcher: async (url, init) => {
      request = { url: String(url), init: init ?? {} };
      return new Response(null, { status: 204 });
    }
  });

  await delivery.deliver(input);

  assert.equal(request?.url, "https://delivery.example.test/events");
  assert.equal(new Headers(request?.init.headers).get("x-rentmate-verification-token"), "staging-token");
  assert.deepEqual(JSON.parse(String(request?.init.body)), {
    eventType: "PASSWORD_RESET",
    channel: "EMAIL",
    ...input
  });
});

test("keeps a development preview and rejects a missing production provider", async () => {
  const previewDelivery = createPasswordResetDelivery({
    nodeEnvironment: "development",
    deliveryUrl: "",
    deliveryToken: ""
  });
  await previewDelivery.deliver(input);
  const preview = previewDelivery.latestPreview?.();
  assert.deepEqual(
    preview && { destination: preview.destination, secret: preview.secret, resetUrl: preview.resetUrl },
    input
  );
  assert.throws(
    () => createPasswordResetDelivery({ nodeEnvironment: "production", deliveryUrl: "", deliveryToken: "" }),
    /required in production/
  );
});
