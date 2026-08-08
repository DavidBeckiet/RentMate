import { describe, expect, it, vi } from "vitest";
import {
  CloudinaryClientError,
  cloudinaryRequestTimeoutMilliseconds,
  createCloudinaryClient
} from "../src/integrations/cloudinary.client.js";

const configuration = { cloudName: "test-cloud", apiKey: "test-key", apiSecret: "test-secret" };

function validResult(overrides: Record<string, unknown> = {}) {
  return {
    public_id: "provider/generated-id",
    secure_url: "https://res.cloudinary.com/test/image/upload/example.jpg",
    format: "jpg",
    width: 1200,
    height: 800,
    bytes: 100_000,
    ...overrides
  };
}

function setup(uploadResult: unknown = validResult(), uploadError?: unknown, deferUpload = false) {
  let callback!: (error?: unknown, result?: unknown) => void;
  let streamError!: (error: unknown) => void;
  const end = vi.fn(() => {
    if (!deferUpload) callback(uploadError, uploadResult);
  });
  const uploadStream = vi.fn((_options: Readonly<Record<string, unknown>>, receivedCallback: typeof callback) => {
    callback = receivedCallback;
    const stream = {
      once: vi.fn((_event: "error", listener: (error: unknown) => void) => {
        streamError = listener;
        return stream;
      }),
      end
    };
    return stream;
  });
  const destroy = vi.fn<(publicId: string, options: Readonly<Record<string, unknown>>) => Promise<unknown>>(
    async () => ({ result: "ok" })
  );
  const sdk = { config: vi.fn(), uploader: { upload_stream: uploadStream, destroy } };
  return {
    client: createCloudinaryClient(configuration, sdk),
    destroy,
    end,
    sdk,
    streamError: () => streamError,
    uploadStream
  };
}

describe("RM-029 Cloudinary client", () => {
  it.each([
    ["jpg", "jpg"],
    ["jpeg", "jpg"],
    ["png", "png"],
    ["webp", "webp"]
  ] as const)("uploads once and normalizes %s to %s", async (providerFormat, expectedFormat) => {
    const fixture = setup(validResult({ format: providerFormat }));
    const buffer = Buffer.from([0xff, 0xd8, 0xff]);
    await expect(fixture.client.uploadImage({ buffer, mimeType: "image/jpeg" })).resolves.toMatchObject({
      publicId: "provider/generated-id",
      format: expectedFormat,
      width: 1200,
      height: 800,
      byteSize: 100_000
    });
    expect(fixture.uploadStream).toHaveBeenCalledOnce();
    expect(fixture.uploadStream.mock.calls[0]![0]).toStrictEqual({
      resource_type: "image",
      overwrite: false,
      timeout: cloudinaryRequestTimeoutMilliseconds
    });
    expect(fixture.end).toHaveBeenCalledWith(buffer);
  });

  it.each([
    { secure_url: "http://provider.test/image.jpg" },
    { secure_url: "https://user:password@provider.test/image.jpg" },
    { width: 0 },
    { height: 1.5 },
    { bytes: 0 },
    { bytes: 5_242_881 },
    { public_id: " " },
    { format: "gif" },
    null
  ])("rejects malformed provider output without exposing it", async (providerResult) => {
    const fixture = setup(providerResult);
    const operation = fixture.client.uploadImage({ buffer: Buffer.from("x"), mimeType: "image/jpeg" });
    await expect(operation).rejects.toBeInstanceOf(CloudinaryClientError);
    await expect(operation).rejects.not.toThrow(/provider\.test|password|gif/i);
  });

  it("sanitizes callback and stream upload failures", async () => {
    const callbackFailure = setup(undefined, new Error("raw provider credential"));
    await expect(
      callbackFailure.client.uploadImage({ buffer: Buffer.from("x"), mimeType: "image/jpeg" })
    ).rejects.toStrictEqual(new CloudinaryClientError());

    const streamFailure = setup(validResult(), undefined, true);
    const pending = streamFailure.client.uploadImage({ buffer: Buffer.from("x"), mimeType: "image/jpeg" });
    streamFailure.streamError()(new Error("timeout private detail"));
    await expect(pending).rejects.toStrictEqual(new CloudinaryClientError());
  });

  it("accepts ok and not-found removal results with bounded image destroy options", async () => {
    const fixture = setup();
    await fixture.client.removeImage("provider/id");
    fixture.destroy.mockResolvedValueOnce({ result: "not found" });
    await fixture.client.removeImage("provider/missing");
    expect(fixture.destroy).toHaveBeenNthCalledWith(1, "provider/id", {
      resource_type: "image",
      type: "upload",
      invalidate: true,
      timeout: cloudinaryRequestTimeoutMilliseconds
    });
  });

  it.each([new Error("raw removal failure"), { result: "failed" }, null])(
    "sanitizes removal failures and timeouts",
    async (failure) => {
      const fixture = setup();
      if (failure instanceof Error) fixture.destroy.mockRejectedValueOnce(failure);
      else fixture.destroy.mockImplementationOnce(async () => failure);
      const operation = fixture.client.removeImage("private/id");
      await expect(operation).rejects.toBeInstanceOf(CloudinaryClientError);
      await expect(operation).rejects.not.toThrow(/private|raw/i);
    }
  );

  it("uses an unavailable client when configuration is incomplete", async () => {
    const sdk = { config: vi.fn(), uploader: { upload_stream: vi.fn(), destroy: vi.fn() } };
    const client = createCloudinaryClient({ ...configuration, apiSecret: "" }, sdk);
    await expect(client.uploadImage({ buffer: Buffer.from("x"), mimeType: "image/jpeg" })).rejects.toBeInstanceOf(
      CloudinaryClientError
    );
    expect(sdk.config).not.toHaveBeenCalled();
  });
});
