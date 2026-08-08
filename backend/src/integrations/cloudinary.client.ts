import { v2 as cloudinary } from "cloudinary";

export const cloudinaryRequestTimeoutMilliseconds = 10_000;
const maximumImageBytes = 5_242_880;
const maximumInteger = 2_147_483_647;

export type ListingImageMimeType = "image/jpeg" | "image/png" | "image/webp";
export type CloudinaryImageFormat = "jpg" | "png" | "webp";

export interface CloudinaryUploadedImage {
  readonly publicId: string;
  readonly secureUrl: string;
  readonly format: CloudinaryImageFormat;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
}

export interface CloudinaryClient {
  readonly uploadImage: (
    file: Readonly<{ buffer: Buffer; mimeType: ListingImageMimeType }>
  ) => Promise<CloudinaryUploadedImage>;
  readonly removeImage: (publicId: string) => Promise<void>;
}

export interface CloudinaryClientConfiguration {
  readonly cloudName: string;
  readonly apiKey: string;
  readonly apiSecret: string;
}

interface UploadStream {
  end(buffer: Buffer): void;
  once(event: "error", listener: (error: unknown) => void): this;
}

interface CloudinarySdk {
  config(configuration: Readonly<Record<string, unknown>>): unknown;
  uploader: {
    upload_stream(
      options: Readonly<Record<string, unknown>>,
      callback: (error?: unknown, result?: unknown) => void
    ): UploadStream;
    destroy(publicId: string, options: Readonly<Record<string, unknown>>): Promise<unknown>;
  };
}

export class CloudinaryClientError extends Error {
  constructor() {
    super("The Cloudinary operation failed.");
    this.name = "CloudinaryClientError";
  }
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= maximumInteger;
}

function normalizeFormat(value: unknown): CloudinaryImageFormat {
  if (typeof value !== "string") throw new CloudinaryClientError();
  switch (value.trim().toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "jpg";
    case "png":
      return "png";
    case "webp":
      return "webp";
    default:
      throw new CloudinaryClientError();
  }
}

function normalizeSecureUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048 || value.trim() !== value) {
    throw new CloudinaryClientError();
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new CloudinaryClientError();
    return url.href;
  } catch {
    throw new CloudinaryClientError();
  }
}

function normalizeUploadResult(value: unknown): CloudinaryUploadedImage {
  if (value === null || typeof value !== "object") throw new CloudinaryClientError();
  const result = value as Record<string, unknown>;
  const publicId = result.public_id;
  if (typeof publicId !== "string" || !publicId.trim() || publicId.trim() !== publicId || publicId.length > 255) {
    throw new CloudinaryClientError();
  }
  if (!isPositiveInteger(result.width) || !isPositiveInteger(result.height)) throw new CloudinaryClientError();
  if (!isPositiveInteger(result.bytes) || result.bytes > maximumImageBytes) throw new CloudinaryClientError();

  return Object.freeze({
    publicId,
    secureUrl: normalizeSecureUrl(result.secure_url),
    format: normalizeFormat(result.format),
    width: result.width,
    height: result.height,
    byteSize: result.bytes
  });
}

function hasCompleteConfiguration(configuration: CloudinaryClientConfiguration): boolean {
  return [configuration.cloudName, configuration.apiKey, configuration.apiSecret].every(
    (value) => value.trim().length > 0
  );
}

export const unavailableCloudinaryClient = Object.freeze<CloudinaryClient>({
  async uploadImage(): Promise<CloudinaryUploadedImage> {
    throw new CloudinaryClientError();
  },
  async removeImage(): Promise<void> {
    throw new CloudinaryClientError();
  }
});

export function createCloudinaryClient(
  configuration: CloudinaryClientConfiguration,
  sdk: CloudinarySdk = cloudinary as unknown as CloudinarySdk
): CloudinaryClient {
  if (!hasCompleteConfiguration(configuration)) return unavailableCloudinaryClient;

  sdk.config({
    cloud_name: configuration.cloudName,
    api_key: configuration.apiKey,
    api_secret: configuration.apiSecret,
    secure: true
  });

  return Object.freeze({
    async uploadImage(
      file: Readonly<{ buffer: Buffer; mimeType: ListingImageMimeType }>
    ): Promise<CloudinaryUploadedImage> {
      try {
        const rawResult = await new Promise<unknown>((resolve, reject) => {
          let settled = false;
          const succeed = (value: unknown): void => {
            if (!settled) {
              settled = true;
              resolve(value);
            }
          };
          const fail = (): void => {
            if (!settled) {
              settled = true;
              reject(new CloudinaryClientError());
            }
          };
          const stream = sdk.uploader.upload_stream(
            {
              resource_type: "image",
              overwrite: false,
              timeout: cloudinaryRequestTimeoutMilliseconds
            },
            (error, result) => {
              if (error !== undefined || result === undefined) fail();
              else succeed(result);
            }
          );
          stream.once("error", fail);
          stream.end(file.buffer);
        });
        return normalizeUploadResult(rawResult);
      } catch {
        throw new CloudinaryClientError();
      }
    },

    async removeImage(publicId: string): Promise<void> {
      if (!publicId.trim() || publicId.trim() !== publicId) throw new CloudinaryClientError();
      try {
        const response = await sdk.uploader.destroy(publicId, {
          resource_type: "image",
          type: "upload",
          invalidate: true,
          timeout: cloudinaryRequestTimeoutMilliseconds
        });
        if (response === null || typeof response !== "object") throw new CloudinaryClientError();
        const result = (response as Record<string, unknown>).result;
        if (result !== "ok" && result !== "not found") throw new CloudinaryClientError();
      } catch {
        throw new CloudinaryClientError();
      }
    }
  });
}
