export interface PasswordResetDeliveryInput {
  readonly destination: string;
  readonly secret: string;
}

export interface PasswordResetDeliveryPreview extends PasswordResetDeliveryInput {
  readonly createdAt: string;
}

export interface PasswordResetDelivery {
  readonly deliver: (input: PasswordResetDeliveryInput) => Promise<void>;
  readonly latestPreview?: () => PasswordResetDeliveryPreview | null;
}

interface PasswordResetDeliveryOptions {
  readonly nodeEnvironment: "development" | "test" | "production";
  readonly deliveryUrl: string;
  readonly deliveryToken: string;
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function createMemoryDelivery(): PasswordResetDelivery {
  let latest: PasswordResetDeliveryPreview | null = null;
  const delivery: PasswordResetDelivery = {
    async deliver(input) {
      latest = Object.freeze({ ...input, createdAt: new Date().toISOString() });
    },
    latestPreview: () => latest
  };
  return Object.freeze(delivery);
}

function createWebhookDelivery(options: PasswordResetDeliveryOptions): PasswordResetDelivery {
  const fetcher: typeof fetch = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const deliveryUrl = normalizeUrl(options.deliveryUrl);
  const timeoutMs = options.timeoutMs ?? 5_000;

  const delivery: PasswordResetDelivery = {
    async deliver(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetcher(deliveryUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-rentmate-verification-token": options.deliveryToken
          },
          body: JSON.stringify({
            eventType: "PASSWORD_RESET",
            channel: "EMAIL",
            destination: input.destination,
            secret: input.secret
          }),
          signal: controller.signal
        });
      } catch {
        throw new Error("Password reset delivery provider is unavailable.");
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) throw new Error("Password reset delivery provider rejected the request.");
    }
  };
  return Object.freeze(delivery);
}

export function createPasswordResetDelivery(options: PasswordResetDeliveryOptions): PasswordResetDelivery {
  if (options.deliveryUrl) return createWebhookDelivery(options);
  if (options.nodeEnvironment !== "production") return createMemoryDelivery();
  throw new Error("Password reset delivery provider is required in production.");
}
