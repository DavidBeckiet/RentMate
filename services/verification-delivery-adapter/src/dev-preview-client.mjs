export class DevPreviewConfigurationError extends Error {
  constructor() {
    super("Development phone preview delivery is not available.");
    this.name = "DevPreviewConfigurationError";
  }
}

export function createDevPreviewClient(config, options = {}) {
  if (config.nodeEnvironment === "production" || !config.phoneDevPreviewEnabled) {
    throw new DevPreviewConfigurationError();
  }

  const now = options.now ?? (() => new Date());
  let latest = null;

  return Object.freeze({
    async deliver(input) {
      latest = Object.freeze({
        channel: input.channel,
        destination: input.destination,
        secret: input.secret,
        createdAt: now().toISOString()
      });
    },
    latestPreview() {
      return latest;
    }
  });
}
