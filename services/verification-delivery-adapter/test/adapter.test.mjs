import assert from "node:assert/strict";
import test from "node:test";
import { createBrevoClient } from "../src/brevo-client.mjs";
import { AdapterConfigurationError, loadAdapterConfig } from "../src/config.mjs";
import { createSpeedSmsClient } from "../src/speedsms-client.mjs";
import {
  createVerificationDeliveryServer,
  healthPath,
  readinessPath,
  verificationDeliveryPath
} from "../src/server.mjs";

const config = Object.freeze({
  deliveryToken: "delivery-token-for-tests",
  brevoApiKey: "brevo-api-key-for-tests",
  emailSender: "no-reply@rentmate.test",
  emailSenderName: "RentMate",
  brevoApiBaseUrl: "https://api.brevo.test",
  timeoutMs: 25,
  nodeEnvironment: "test",
  speedSmsAccessToken: "speed-access-token-for-tests",
  speedSmsApiBaseUrl: "https://api.speedsms.test/index.php",
  speedSmsTimeoutMs: 250
});

function createLogger() {
  const entries = [];
  return {
    entries,
    info(message, context) {
      entries.push({ level: "info", message, context });
    },
    warn(message, context) {
      entries.push({ level: "warn", message, context });
    },
    error(message, context) {
      entries.push({ level: "error", message, context });
    }
  };
}

async function withServer(
  {
    brevoFetcher = async () => new Response(null, { status: 201 }),
    speedSmsFetcher = async () => new Response(null, { status: 201 }),
    logger = createLogger(),
    serverConfig = config
  },
  callback
) {
  const brevoClient = createBrevoClient(serverConfig, { fetcher: brevoFetcher });
  const speedSmsClient = createSpeedSmsClient(serverConfig, { fetcher: speedSmsFetcher });
  const server = createVerificationDeliveryServer({ config: serverConfig, brevoClient, speedSmsClient, logger });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await callback(baseUrl, logger);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function requestHeaders(token = config.deliveryToken) {
  return {
    "content-type": "application/json",
    "x-rentmate-verification-token": token
  };
}

test("accepts a valid token and routes EMAIL to Brevo transactional email", async () => {
  let brevoRequest;
  await withServer(
    {
      brevoFetcher: async (url, init) => {
        brevoRequest = { url, init };
        return new Response(JSON.stringify({ messageId: "accepted" }), { status: 201 });
      }
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({ channel: "EMAIL", destination: "owner@example.com", secret: "123456" })
      });
      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { accepted: true });
    }
  );

  assert.equal(brevoRequest.url, "https://api.brevo.test/v3/smtp/email");
  assert.equal(new Headers(brevoRequest.init.headers).get("api-key"), config.brevoApiKey);
  assert.deepEqual(JSON.parse(brevoRequest.init.body), {
    sender: { email: config.emailSender, name: config.emailSenderName },
    to: [{ email: "owner@example.com" }],
    subject: "Mã xác minh RentMate",
    textContent: "Mã xác minh RentMate của bạn là: 123456\n\nNếu bạn không yêu cầu mã này, hãy bỏ qua email.",
    htmlContent:
      "<p>Mã xác minh RentMate của bạn là:</p><p><strong>123456</strong></p><p>Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>"
  });
});

test("allows EMAIL startup and delivery without SpeedSMS configuration", async () => {
  const environment = {
    NODE_ENV: "production",
    VERIFICATION_DELIVERY_TOKEN: "delivery-token",
    BREVO_API_KEY: "brevo-api-key",
    BREVO_EMAIL_SENDER: "no-reply@rentmate.test",
    BREVO_EMAIL_SENDER_NAME: "RentMate",
    BREVO_API_BASE_URL: "https://api.brevo.test"
  };
  const loaded = loadAdapterConfig(environment);
  assert.equal(loaded.speedSmsAccessToken, "");

  await withServer(
    {
      serverConfig: { ...config, speedSmsAccessToken: "" },
      brevoFetcher: async () => new Response(null, { status: 201 })
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({ channel: "EMAIL", destination: "owner@example.com", secret: "123456" })
      });
      assert.equal(response.status, 202);
    }
  );
});

test("keeps EMAIL sender validation mandatory at startup", () => {
  assert.throws(
    () =>
      loadAdapterConfig({
        NODE_ENV: "production",
        VERIFICATION_DELIVERY_TOKEN: "delivery-token",
        BREVO_API_KEY: "brevo-api-key",
        BREVO_EMAIL_SENDER: "",
        BREVO_EMAIL_SENDER_NAME: "RentMate",
        BREVO_API_BASE_URL: "https://api.brevo.test"
      }),
    (error) => error instanceof AdapterConfigurationError && error.issues.includes("BREVO_EMAIL_SENDER")
  );
});

test("rejects an invalid webhook token before contacting Brevo", async () => {
  let brevoCalls = 0;
  await withServer(
    {
      brevoFetcher: async () => {
        brevoCalls += 1;
        return new Response(null, { status: 201 });
      }
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
        method: "POST",
        headers: requestHeaders("wrong-token"),
        body: JSON.stringify({ channel: "EMAIL", destination: "owner@example.com", secret: "123456" })
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "Forbidden." });
    }
  );
  assert.equal(brevoCalls, 0);
});

test("routes PHONE to SpeedSMS and not Brevo", async () => {
  let speedSmsRequest;
  let brevoCalls = 0;
  await withServer(
    {
      brevoFetcher: async () => {
        brevoCalls += 1;
        return new Response(null, { status: 201 });
      },
      speedSmsFetcher: async (url, init) => {
        speedSmsRequest = { url, init };
        return new Response(
          JSON.stringify({
            status: "success",
            code: "00",
            data: { tranId: 123456, totalSMS: 1, totalPrice: 500, invalidPhone: [] }
          }),
          { status: 200 }
        );
      }
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({ channel: "PHONE", destination: "+84901234567", secret: "654321" })
      });
      assert.equal(response.status, 202);
    }
  );

  assert.equal(brevoCalls, 0);
  assert.equal(speedSmsRequest.url, "https://api.speedsms.test/index.php/sms/send");
  assert.equal(
    new Headers(speedSmsRequest.init.headers).get("authorization"),
    `Basic ${Buffer.from("speed-access-token-for-tests:x", "utf8").toString("base64")}`
  );
  assert.deepEqual(JSON.parse(speedSmsRequest.init.body), {
    to: ["+84901234567"],
    content: "Ma xac minh RentMate cua ban la 654321. Khong chia se ma nay.",
    sms_type: 4
  });
});

test("rejects PHONE delivery when SpeedSMS configuration is not configured", async () => {
  let brevoCalls = 0;
  const logger = createLogger();
  await withServer(
    {
      logger,
      serverConfig: { ...config, speedSmsAccessToken: "" },
      brevoFetcher: async () => {
        brevoCalls += 1;
        return new Response(null, { status: 201 });
      },
      speedSmsFetcher: async () => {
        throw new Error("SpeedSMS must not be contacted without configuration");
      }
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({ channel: "PHONE", destination: "+84901234567", secret: "654321" })
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "Delivery provider unavailable." });
    }
  );

  assert.equal(brevoCalls, 0);
  const providerFailure = logger.entries.find((entry) => entry.message === "Verification delivery provider failure");
  assert.equal(providerFailure.context.reason, "configuration");
});

test("returns unavailable for a SpeedSMS timeout", async () => {
  const logger = createLogger();
  await withServer(
    {
      logger,
      speedSmsFetcher: async (_url, init) =>
        await new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("provider timeout")), { once: true });
        })
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({ channel: "PHONE", destination: "+84901234567", secret: "timeout-secret" })
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "Delivery provider unavailable." });
    }
  );
  const providerFailure = logger.entries.find((entry) => entry.message === "Verification delivery provider failure");
  assert.equal(providerFailure.context.reason, "timeout");
});

test("returns unavailable for a Brevo timeout", async () => {
  const logger = createLogger();
  await withServer(
    {
      logger,
      brevoFetcher: async (_url, init) =>
        await new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("provider timeout")), { once: true });
        })
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({ channel: "EMAIL", destination: "owner@example.com", secret: "timeout-secret" })
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "Delivery provider unavailable." });
    }
  );
  const providerFailure = logger.entries.find((entry) => entry.message === "Verification delivery provider failure");
  assert.equal(providerFailure.context.reason, "timeout");
});

for (const providerStatus of [400, 500]) {
  test(`returns a sanitized rejection for Brevo HTTP ${providerStatus}`, async () => {
    const logger = createLogger();
    await withServer(
      {
        logger,
        brevoFetcher: async () =>
          new Response("provider body contains otp-secret and owner@example.com", { status: providerStatus })
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
          method: "POST",
          headers: requestHeaders(),
          body: JSON.stringify({ channel: "EMAIL", destination: "owner@example.com", secret: "otp-secret" })
        });
        assert.equal(response.status, 502);
        const responseText = await response.text();
        assert.equal(responseText.includes("otp-secret"), false);
        assert.equal(responseText.includes("owner@example.com"), false);
      }
    );

    const logText = JSON.stringify(logger.entries);
    assert.equal(logText.includes("otp-secret"), false);
    assert.equal(logText.includes("owner@example.com"), false);
    assert.equal(logText.includes("provider body contains"), false);
  });
}

for (const providerStatus of [400, 500]) {
  test(`returns a sanitized rejection for SpeedSMS HTTP ${providerStatus}`, async () => {
    const logger = createLogger();
    await withServer(
      {
        logger,
        speedSmsFetcher: async () =>
          new Response("provider body contains speed-access-token-for-tests, otp-secret and +84901234567", {
            status: providerStatus
          })
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
          method: "POST",
          headers: requestHeaders(),
          body: JSON.stringify({ channel: "PHONE", destination: "+84901234567", secret: "otp-secret" })
        });
        assert.equal(response.status, 502);
        const responseText = await response.text();
        assert.equal(responseText.includes("speed-access-token-for-tests"), false);
        assert.equal(responseText.includes("otp-secret"), false);
        assert.equal(responseText.includes("+84901234567"), false);
      }
    );

    const logText = JSON.stringify(logger.entries);
    assert.equal(logText.includes("speed-access-token-for-tests"), false);
    assert.equal(logText.includes("otp-secret"), false);
    assert.equal(logText.includes("+84901234567"), false);
  });
}

test("rejects a malformed SpeedSMS success response", async () => {
  const logger = createLogger();
  await withServer(
    {
      logger,
      speedSmsFetcher: async () => new Response(JSON.stringify({ status: "success", code: "00" }), { status: 200 })
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({ channel: "PHONE", destination: "+84901234567", secret: "654321" })
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "Delivery provider unavailable." });
    }
  );

  const providerFailure = logger.entries.find((entry) => entry.message === "Verification delivery provider failure");
  assert.equal(providerFailure.context.reason, "malformed");
});

test("exposes liveness and configuration readiness without provider secrets", async () => {
  await withServer({ brevoFetcher: async () => new Response(null, { status: 201 }) }, async (baseUrl) => {
    const health = await fetch(`${baseUrl}${healthPath}`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", service: "verification-delivery-adapter" });

    const ready = await fetch(`${baseUrl}${readinessPath}`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: "ready", service: "verification-delivery-adapter" });
  });
});
