import type { Express } from "express";
import type { QueryResultRow } from "pg";
import request from "supertest";
import { createSqlExecutor } from "../../src/db/sql-executor.js";
import { withTransaction } from "../../src/db/transaction.js";
import type {
  CloudinaryClient,
  CloudinaryUploadedImage,
  ListingImageMimeType
} from "../../src/integrations/cloudinary.client.js";
import type { TransactionRunner } from "../../src/modules/listings/listing-create-service.js";
import type { ListingStatus } from "../../src/modules/listings/owner-listing-mapper.js";
import { createBackendApp } from "../../src/server-composition.js";
import type { LogContext, Logger } from "../../src/shared/logging/logger.js";
import {
  phase4JwtSecret,
  phase4NowSeconds,
  phase4Origin,
  type Phase4DatabaseFixture
} from "./listings-phase4-fixture.js";

export const rm032Jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
export const rm032BaselineTimestamp = new Date("2000-01-01T00:00:00.000Z");

export interface RecordedWarning {
  readonly message: string;
  readonly context: LogContext | undefined;
}

export interface RecordingLogger extends Logger {
  readonly warnings: RecordedWarning[];
  readonly errors: RecordedWarning[];
}

export interface RecordingCloudinary {
  readonly client: CloudinaryClient;
  readonly events: string[];
  readonly uploads: CloudinaryUploadedImage[];
  readonly removals: string[];
  readonly failNextUpload: () => void;
  readonly setRemoveFailures: (publicIds: readonly string[]) => void;
}

export interface SeedImage {
  readonly id: number;
  readonly publicId: string;
  readonly displayOrder: number;
}

export interface StoredImage extends QueryResultRow {
  readonly id: number;
  readonly cloudinary_public_id: string;
  readonly display_order: number;
  readonly alt_text: string | null;
}

export interface StoredListing extends QueryResultRow {
  readonly status: ListingStatus;
  readonly updated_at: Date;
}

interface RecordingCloudinaryOptions {
  readonly onUpload?: (uploaded: CloudinaryUploadedImage) => Promise<void>;
  readonly onRemove?: (publicId: string) => Promise<void>;
  readonly removeFailureIds?: readonly string[];
}

interface CreateAppOptions {
  readonly provider?: RecordingCloudinary;
  readonly logger?: RecordingLogger;
  readonly transactionRunner?: TransactionRunner;
}

let providerSequence = 0;
let seedSequence = 0;

export function createRecordingLogger(): RecordingLogger {
  const warnings: RecordedWarning[] = [];
  const errors: RecordedWarning[] = [];
  return {
    warnings,
    errors,
    debug: () => undefined,
    info: () => undefined,
    warn(message, context) {
      warnings.push({ message, context: context === undefined ? undefined : { ...context } });
    },
    error(message, context) {
      errors.push({ message, context: context === undefined ? undefined : { ...context } });
    }
  };
}

export function createRecordingCloudinary(options: RecordingCloudinaryOptions = {}): RecordingCloudinary {
  const events: string[] = [];
  const uploads: CloudinaryUploadedImage[] = [];
  const removals: string[] = [];
  const removeFailureIds = new Set(options.removeFailureIds ?? []);
  let failNextUpload = false;

  const client: CloudinaryClient = {
    async uploadImage(file: Readonly<{ buffer: Buffer; mimeType: ListingImageMimeType }>) {
      events.push(`upload:${file.mimeType}`);
      if (failNextUpload) {
        failNextUpload = false;
        throw new Error("raw RM-032 provider upload failure with credential detail");
      }
      providerSequence += 1;
      const uploaded = Object.freeze({
        publicId: `rm032/upload-${providerSequence}`,
        secureUrl: `https://provider.test/rm032/upload-${providerSequence}.jpg`,
        format: "jpg" as const,
        width: 1_200,
        height: 800,
        byteSize: 100_000
      });
      uploads.push(uploaded);
      await options.onUpload?.(uploaded);
      return uploaded;
    },
    async removeImage(publicId: string): Promise<void> {
      events.push(`remove:${publicId}`);
      removals.push(publicId);
      await options.onRemove?.(publicId);
      if (removeFailureIds.has(publicId)) {
        throw new Error(`raw RM-032 provider removal failure for ${publicId} with credential detail`);
      }
    }
  };

  return {
    client,
    events,
    uploads,
    removals,
    failNextUpload() {
      failNextUpload = true;
    },
    setRemoveFailures(publicIds) {
      removeFailureIds.clear();
      for (const publicId of publicIds) removeFailureIds.add(publicId);
    }
  };
}

export async function createRm032App(
  fixture: Phase4DatabaseFixture,
  options: CreateAppOptions = {}
): Promise<Readonly<{ app: Express; provider: RecordingCloudinary; logger: RecordingLogger }>> {
  const provider = options.provider ?? createRecordingCloudinary();
  const logger = options.logger ?? createRecordingLogger();
  const transactionRunner: TransactionRunner =
    options.transactionRunner ?? ((operation) => withTransaction(fixture.pool, logger, operation));
  const app = await createBackendApp({
    frontendOrigin: phase4Origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: createSqlExecutor(fixture.pool),
    jwtSecret: phase4JwtSecret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => phase4NowSeconds,
    authRateLimitClock: () => 0,
    transactionRunner,
    cloudinaryClient: provider.client
  });
  return { app, provider, logger };
}

export async function insertRm032Listing(
  fixture: Phase4DatabaseFixture,
  landlordId: number,
  status: ListingStatus
): Promise<number> {
  const result = await fixture.pool.query<{ id: number }>({
    text: `
      INSERT INTO listings (
        landlord_id, property_type_id, status, title, description, monthly_rent,
        room_area_sqm, address_text, area_name, latitude, longitude, updated_at
      )
      VALUES (
        $1, (SELECT id FROM property_types WHERE code = 'STUDIO'), $2::listing_status,
        'RM-032 listing', 'Image/provider verification listing', 5000000,
        25.50, 'Private RM-032 address', 'RM-032 area', 10.75, 106.67, $3
      )
      RETURNING id
    `,
    values: [landlordId, status, rm032BaselineTimestamp]
  });
  return result.rows[0]!.id;
}

export async function insertRm032Image(
  fixture: Phase4DatabaseFixture,
  listingId: number,
  displayOrder: number,
  publicId?: string
): Promise<SeedImage> {
  seedSequence += 1;
  const resolvedPublicId = publicId ?? `rm032/seed-${seedSequence}`;
  const result = await fixture.pool.query<{ id: number }>({
    text: `
      INSERT INTO listing_images (
        listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order, alt_text
      ) VALUES ($1, $2, $3, 'jpg', 800, 600, 1234, $4, 'RM-032 seed image')
      RETURNING id
    `,
    values: [listingId, resolvedPublicId, `https://provider.test/rm032/seed-${seedSequence}.jpg`, displayOrder]
  });
  return { id: result.rows[0]!.id, publicId: resolvedPublicId, displayOrder };
}

export async function insertRm032ModerationHistory(
  fixture: Phase4DatabaseFixture,
  listingId: number,
  adminId: number,
  event: "REJECTED" | "HIDDEN"
): Promise<void> {
  const previousStatus = event === "REJECTED" ? "PENDING" : "APPROVED";
  await fixture.pool.query({
    text: `
      INSERT INTO moderation_history (listing_id, admin_id, previous_status, new_status, reason)
      VALUES ($1, $2, $3::listing_status, $4::listing_status, $5)
    `,
    values: [listingId, adminId, previousStatus, event, `RM-032 ${event.toLowerCase()} reason`]
  });
}

export async function storedRm032Listing(
  fixture: Phase4DatabaseFixture,
  listingId: number
): Promise<StoredListing | null> {
  const result = await fixture.pool.query<StoredListing>({
    text: "SELECT status, updated_at FROM listings WHERE id = $1",
    values: [listingId]
  });
  return result.rows[0] ?? null;
}

export async function storedRm032Images(
  fixture: Phase4DatabaseFixture,
  listingId: number
): Promise<readonly StoredImage[]> {
  const result = await fixture.pool.query<StoredImage>({
    text: `
      SELECT id, cloudinary_public_id, display_order, alt_text
      FROM listing_images
      WHERE listing_id = $1
      ORDER BY display_order ASC, id ASC
    `,
    values: [listingId]
  });
  return result.rows;
}

export async function storedRm032History(
  fixture: Phase4DatabaseFixture,
  listingId: number
): Promise<readonly QueryResultRow[]> {
  const result = await fixture.pool.query({
    text: `
      SELECT id, admin_id, previous_status, new_status, reason, created_at
      FROM moderation_history
      WHERE listing_id = $1
      ORDER BY id
    `,
    values: [listingId]
  });
  return result.rows;
}

export function uploadRm032Image(app: Express, token: string, listingId: number, altText = "RM-032 upload") {
  return request(app)
    .post(`/api/v1/landlord/listings/${listingId}/images`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${token}`)
    .field("altText", altText)
    .attach("image", rm032Jpeg, { filename: "rm032.jpg", contentType: "image/jpeg" });
}

export function deleteRm032Image(app: Express, token: string, listingId: number, imageId: number) {
  return request(app)
    .delete(`/api/v1/landlord/listings/${listingId}/images/${imageId}`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${token}`);
}

export function reorderRm032Images(app: Express, token: string, listingId: number, imageIds: readonly number[]) {
  return request(app)
    .put(`/api/v1/landlord/listings/${listingId}/images/order`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${token}`)
    .send({ imageIds });
}

export function hardDeleteRm032Listing(app: Express, token: string, listingId: number) {
  return request(app)
    .delete(`/api/v1/landlord/listings/${listingId}`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${token}`);
}
