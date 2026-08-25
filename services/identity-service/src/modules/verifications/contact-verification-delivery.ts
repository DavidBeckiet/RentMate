export type ContactVerificationDeliveryChannel = "EMAIL" | "PHONE";

export interface ContactVerificationDeliveryInput {
  readonly channel: ContactVerificationDeliveryChannel;
  readonly destination: string;
  readonly secret: string;
}

export interface ContactVerificationDeliveryPreview extends ContactVerificationDeliveryInput {
  readonly createdAt: string;
}

export interface ContactVerificationDelivery {
  readonly deliver: (input: ContactVerificationDeliveryInput) => Promise<void>;
  readonly latestPreview?: (channel?: ContactVerificationDeliveryChannel) => ContactVerificationDeliveryPreview | null;
}

interface ContactVerificationDeliveryOptions {
  readonly nodeEnvironment: "development" | "test" | "production";
  readonly deliveryUrl: string;
  readonly deliveryToken: string;
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function createMemoryDelivery(): ContactVerificationDelivery {
  const previews = new Map<ContactVerificationDeliveryChannel, ContactVerificationDeliveryPreview>();

  return Object.freeze({
    async deliver(input: ContactVerificationDeliveryInput): Promise<void> {
      previews.set(
        input.channel,
        Object.freeze({
          ...input,
          createdAt: new Date().toISOString()
        })
      );
    },
    latestPreview(channel?: ContactVerificationDeliveryChannel) {
      if (channel) return previews.get(channel) ?? null;
      return previews.values().next().value ?? null;
    }
  });
}

function createWebhookDelivery(options: ContactVerificationDeliveryOptions): ContactVerificationDelivery {
  const fetcher: typeof fetch = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const deliveryUrl = normalizeUrl(options.deliveryUrl);
  const timeoutMs = options.timeoutMs ?? 5_000;

  return Object.freeze({
    async deliver(input: ContactVerificationDeliveryInput): Promise<void> {
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
          body: JSON.stringify(input),
          signal: controller.signal
        });
      } catch {
        throw new Error("Verification delivery provider is unavailable.");
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) throw new Error("Verification delivery provider rejected the request.");
    }
  });
}

export function createContactVerificationDelivery(
  options: ContactVerificationDeliveryOptions
): ContactVerificationDelivery {
  if (options.deliveryUrl) return createWebhookDelivery(options);
  if (options.nodeEnvironment !== "production") return createMemoryDelivery();
  throw new Error("Verification delivery provider is required in production.");
}
