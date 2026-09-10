import assert from "node:assert/strict";
import test from "node:test";
import { createBrevoClient } from "../src/brevo-client.mjs";
import { AdapterConfigurationError, loadAdapterConfig } from "../src/config.mjs";
import { createDevPreviewClient } from "../src/dev-preview-client.mjs";
import { createEmailContent } from "../src/email-content.mjs";
import { createSpeedSmsClient } from "../src/speedsms-client.mjs";
import { createSmtpClient } from "../src/smtp-client.mjs";
import {
  createVerificationDeliveryServer,
  healthPath,
  previewPath,
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
  emailDeliveryProvider: "BREVO",
  nodeEnvironment: "test",
  phoneDeliveryProvider: "SPEEDSMS",
  phoneDevPreviewEnabled: false,
  speedSmsAccessToken: "speed-access-token-for-tests",
  speedSmsApiBaseUrl: "https://api.speedsms.test/index.php",
  speedSmsTimeoutMs: 250,
  smtpHost: "smtp.gmail.test",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "sender@rentmate.test",
  smtpPassword: "smtp-password-for-tests",
  smtpFrom: "sender@rentmate.test",
  smtpTimeoutMs: 250
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
    smtpCreateTransport,
    logger = createLogger(),
    serverConfig = config
  },
  callback
) {
  const brevoClient = createBrevoClient(serverConfig, { fetcher: brevoFetcher });
  const speedSmsClient = createSpeedSmsClient(serverConfig, { fetcher: speedSmsFetcher });
  const smtpClient =
    serverConfig.emailDeliveryProvider === "GMAIL_SMTP"
      ? createSmtpClient(serverConfig, { createTransport: smtpCreateTransport })
      : null;
  const devPreviewClient =
    serverConfig.phoneDeliveryProvider === "DEV_PREVIEW" ? createDevPreviewClient(serverConfig) : null;
  const server = createVerificationDeliveryServer({
    config: serverConfig,
    brevoClient,
    smtpClient,
    speedSmsClient,
    devPreviewClient,
    logger
  });
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
    subject: "Mã xác minh email RentMate",
    textContent:
      "RentMate\n\nMã xác minh email của bạn:\n\n123456\n\nKhông chia sẻ mã này với người khác.\nNếu bạn không yêu cầu xác minh, hãy bỏ qua email này.",
    htmlContent:
      "<p>RentMate</p><p>Mã xác minh email của bạn:</p><p><strong>123456</strong></p><p>Không chia sẻ mã này với người khác.</p><p>Nếu bạn không yêu cầu xác minh, hãy bỏ qua email này.</p>"
  });
});

test("uses the shared password-reset template for Brevo without an expiry claim", async () => {
  let brevoPayload;
  await withServer(
    {
      brevoFetcher: async (_url, init) => {
        brevoPayload = JSON.parse(init.body);
        return new Response(null, { status: 201 });
      }
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({
          eventType: "PASSWORD_RESET",
          channel: "EMAIL",
          destination: "tenant@example.com",
          secret: "482731"
        })
      });
      assert.equal(response.status, 202);
    }
  );

  assert.equal(brevoPayload.subject, "Mã đặt lại mật khẩu RentMate");
  assert.match(brevoPayload.textContent, /482731/);
  assert.equal(brevoPayload.textContent.includes("phút"), false);
});

test("escapes shared email HTML content", () => {
  const verification = createEmailContent({ secret: "<unsafe>&token" });
  const reset = createEmailContent({
    eventType: "PASSWORD_RESET",
    secret: "<unsafe>&token"
  });

  assert.match(verification.html, /&lt;unsafe&gt;&amp;token/);
  assert.match(reset.html, /&lt;unsafe&gt;&amp;token/);
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
  assert.equal(loaded.emailDeliveryProvider, "BREVO");
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

function gmailEnvironment(overrides = {}) {
  return {
    NODE_ENV: "development",
    VERIFICATION_DELIVERY_TOKEN: "delivery-token",
    EMAIL_DELIVERY_PROVIDER: "GMAIL_SMTP",
    SMTP_HOST: "smtp.gmail.test",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "sender@rentmate.test",
    SMTP_PASSWORD: "smtp-password-for-tests",
    SMTP_FROM: "sender@rentmate.test",
    SMTP_TIMEOUT_MS: "5000",
    ...overrides
  };
}

test("validates explicit email and phone provider selection without leaking secrets", () => {
  const loaded = loadAdapterConfig(gmailEnvironment());
  assert.equal(loaded.emailDeliveryProvider, "GMAIL_SMTP");
  assert.equal(loaded.phoneDeliveryProvider, "SPEEDSMS");
  assert.equal(loaded.smtpPort, 465);
  assert.equal(loaded.smtpSecure, true);

  for (const [name, overrides] of [
    ["SMTP_USER", { SMTP_USER: "" }],
    ["SMTP_PASSWORD", { SMTP_PASSWORD: "" }],
    ["SMTP_PORT", { SMTP_PORT: "not-a-port" }],
    ["SMTP_SECURE", { SMTP_SECURE: "sometimes" }],
    ["SMTP_TIMEOUT_MS", { SMTP_TIMEOUT_MS: "12" }],
    ["SMTP_FROM", { SMTP_FROM: "sender@rentmate.test\r\nBcc: attacker@example.test" }],
    ["EMAIL_DELIVERY_PROVIDER", { EMAIL_DELIVERY_PROVIDER: "UNKNOWN" }]
  ]) {
    assert.throws(
      () => loadAdapterConfig(gmailEnvironment(overrides)),
      (error) =>
        error instanceof AdapterConfigurationError &&
        error.issues.includes(name) &&
        !error.message.includes("smtp-password-for-tests")
    );
  }
});

test("rejects DEV_PREVIEW phone delivery in production and without an explicit development flag", () => {
  assert.throws(
    () =>
      loadAdapterConfig({
        NODE_ENV: "production",
        VERIFICATION_DELIVERY_TOKEN: "delivery-token",
        EMAIL_DELIVERY_PROVIDER: "GMAIL_SMTP",
        SMTP_HOST: "smtp.gmail.test",
        SMTP_PORT: "465",
        SMTP_SECURE: "true",
        SMTP_USER: "sender@rentmate.test",
        SMTP_PASSWORD: "smtp-password-for-tests",
        SMTP_FROM: "sender@rentmate.test",
        PHONE_DELIVERY_PROVIDER: "DEV_PREVIEW",
        PHONE_DEV_PREVIEW_ENABLED: "true"
      }),
    (error) => error instanceof AdapterConfigurationError && error.issues.includes("PHONE_DELIVERY_PROVIDER")
  );
  assert.throws(
    () => loadAdapterConfig(gmailEnvironment({ PHONE_DELIVERY_PROVIDER: "DEV_PREVIEW" })),
    (error) => error instanceof AdapterConfigurationError && error.issues.includes("PHONE_DELIVERY_PROVIDER")
  );
});

test("routes Gmail SMTP verification and password reset messages through one mock transport", async () => {
  const messages = [];
  let transportOptions;
  const serverConfig = {
    ...config,
    emailDeliveryProvider: "GMAIL_SMTP",
    speedSmsAccessToken: ""
  };
  await withServer(
    {
      serverConfig,
      smtpCreateTransport: (options) => {
        transportOptions = options;
        return { sendMail: async (message) => messages.push(message) };
      },
      brevoFetcher: async () => {
        throw new Error("Brevo must not receive Gmail SMTP delivery");
      }
    },
    async (baseUrl) => {
      const verification = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({ channel: "EMAIL", destination: "tenant@example.com", secret: "123456" })
      });
      assert.equal(verification.status, 202);

      const reset = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({
          eventType: "PASSWORD_RESET",
          channel: "EMAIL",
          destination: "tenant@example.com",
          secret: "654321"
        })
      });
      assert.equal(reset.status, 202);
    }
  );

  assert.deepEqual(transportOptions, {
    host: "smtp.gmail.test",
    port: 465,
    secure: true,
    auth: { user: "sender@rentmate.test", pass: "smtp-password-for-tests" },
    connectionTimeout: 250,
    greetingTimeout: 250,
    socketTimeout: 250
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].from, "sender@rentmate.test");
  assert.equal(messages[0].to, "tenant@example.com");
  assert.equal(messages[0].subject, "Mã xác minh email RentMate");
  assert.match(messages[0].text, /123456/);
  assert.match(messages[0].html, /123456/);
  assert.equal(messages[1].subject, "Mã đặt lại mật khẩu RentMate");
  assert.match(messages[1].text, /654321/);
});

for (const [name, error, expectedStatus, expectedReason] of [
  ["auth rejection", Object.assign(new Error("private Gmail auth detail"), { code: "EAUTH" }), 502, "rejected"],
  ["network failure", Object.assign(new Error("private network detail"), { code: "ECONNREFUSED" }), 503, "unavailable"],
  ["timeout", Object.assign(new Error("private timeout detail"), { code: "ETIMEDOUT" }), 503, "timeout"],
  ["unexpected failure", new Error("private unexpected detail"), 503, "unavailable"]
]) {
  test(`sanitizes Gmail SMTP ${name}`, async () => {
    const logger = createLogger();
    await withServer(
      {
        logger,
        serverConfig: { ...config, emailDeliveryProvider: "GMAIL_SMTP" },
        smtpCreateTransport: () => ({ sendMail: async () => Promise.reject(error) })
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
          method: "POST",
          headers: requestHeaders(),
          body: JSON.stringify({ channel: "EMAIL", destination: "tenant@example.com", secret: "112233" })
        });
        assert.equal(response.status, expectedStatus);
        const responseText = await response.text();
        assert.equal(responseText.includes("112233"), false);
        assert.equal(responseText.includes("private"), false);
      }
    );
    const failure = logger.entries.find((entry) => entry.message === "Verification delivery provider failure");
    assert.equal(failure.context.provider, "GMAIL_SMTP");
    assert.equal(failure.context.reason, expectedReason);
    assert.equal(JSON.stringify(logger.entries).includes("112233"), false);
    assert.equal(JSON.stringify(logger.entries).includes("private"), false);
  });
}

test("keeps a DEV_PREVIEW phone OTP internal and protected", async () => {
  const serverConfig = {
    ...config,
    nodeEnvironment: "development",
    phoneDeliveryProvider: "DEV_PREVIEW",
    phoneDevPreviewEnabled: true
  };
  await withServer({ serverConfig }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${verificationDeliveryPath}`, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({ channel: "PHONE", destination: "+84901234567", secret: "654321" })
    });
    assert.equal(response.status, 202);
    assert.equal((await response.text()).includes("654321"), false);

    const forbidden = await fetch(`${baseUrl}${previewPath}?channel=PHONE`);
    assert.equal(forbidden.status, 403);

    const preview = await fetch(`${baseUrl}${previewPath}?channel=PHONE`, {
      headers: { "x-rentmate-verification-token": config.deliveryToken }
    });
    assert.equal(preview.status, 200);
    const body = await preview.json();
    assert.equal(body.data.channel, "PHONE");
    assert.equal(body.data.destination, "+84901234567");
    assert.equal(body.data.secret, "654321");
    assert.equal(typeof body.data.createdAt, "string");
  });
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

test("rejects legacy long secrets before contacting the email provider", async () => {
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
        headers: requestHeaders(),
        body: JSON.stringify({ channel: "EMAIL", destination: "owner@example.com", secret: "a".repeat(43) })
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "Invalid verification delivery request." });
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
        body: JSON.stringify({ channel: "PHONE", destination: "+84901234567", secret: "123456" })
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
        body: JSON.stringify({ channel: "EMAIL", destination: "owner@example.com", secret: "234567" })
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
          body: JSON.stringify({ channel: "EMAIL", destination: "owner@example.com", secret: "345678" })
        });
        assert.equal(response.status, 502);
        const responseText = await response.text();
        assert.equal(responseText.includes("otp-secret"), false);
        assert.equal(responseText.includes("345678"), false);
        assert.equal(responseText.includes("owner@example.com"), false);
      }
    );

    const logText = JSON.stringify(logger.entries);
    assert.equal(logText.includes("otp-secret"), false);
    assert.equal(logText.includes("345678"), false);
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
          body: JSON.stringify({ channel: "PHONE", destination: "+84901234567", secret: "456789" })
        });
        assert.equal(response.status, 502);
        const responseText = await response.text();
        assert.equal(responseText.includes("speed-access-token-for-tests"), false);
        assert.equal(responseText.includes("otp-secret"), false);
        assert.equal(responseText.includes("456789"), false);
        assert.equal(responseText.includes("+84901234567"), false);
      }
    );

    const logText = JSON.stringify(logger.entries);
    assert.equal(logText.includes("speed-access-token-for-tests"), false);
    assert.equal(logText.includes("otp-secret"), false);
    assert.equal(logText.includes("456789"), false);
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
