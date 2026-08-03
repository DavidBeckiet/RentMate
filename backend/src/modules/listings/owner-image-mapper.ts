import type { QueryResultRow } from "pg";
import { mapPgTimestamptz } from "../../db/value-mappers.js";
import { formatApiTimestamp } from "../../shared/mapping/api-values.js";

const maximumInteger = 2_147_483_647;
const maximumImageBytes = 5 * 1024 * 1024;

export interface OwnerImageRow extends QueryResultRow {
  readonly id: unknown;
  readonly secure_url: unknown;
  readonly format: unknown;
  readonly width: unknown;
  readonly height: unknown;
  readonly byte_size: unknown;
  readonly display_order: unknown;
  readonly alt_text: unknown;
  readonly created_at: unknown;
}

export interface OwnerImage {
  readonly id: number;
  readonly url: string;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly displayOrder: number;
  readonly altText: string | null;
  readonly createdAt: Date;
}

export interface OwnerImageDto {
  readonly id: number;
  readonly url: string;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly displayOrder: number;
  readonly altText: string | null;
  readonly createdAt: string;
}

export class OwnerImageMappingError extends Error {
  constructor() {
    super("Owner image representation is invalid.");
    this.name = "OwnerImageMappingError";
  }
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= maximumInteger;
}

function assertOwnerImage(value: Readonly<OwnerImage>): void {
  if (
    !isPositiveInteger(value.id) ||
    typeof value.url !== "string" ||
    !value.url.startsWith("https://") ||
    typeof value.format !== "string" ||
    value.format.length === 0 ||
    value.format !== value.format.trim().toLowerCase() ||
    !isPositiveInteger(value.width) ||
    !isPositiveInteger(value.height) ||
    !Number.isInteger(value.byteSize) ||
    value.byteSize < 1 ||
    value.byteSize > maximumImageBytes ||
    !Number.isInteger(value.displayOrder) ||
    value.displayOrder < 1 ||
    value.displayOrder > 8 ||
    (value.altText !== null && (typeof value.altText !== "string" || value.altText.trim().length === 0)) ||
    !(value.createdAt instanceof Date) ||
    Number.isNaN(value.createdAt.getTime())
  ) {
    throw new OwnerImageMappingError();
  }
}

export function mapOwnerImageRow(row: Readonly<OwnerImageRow>): OwnerImage {
  try {
    const image: OwnerImage = {
      id: row.id as number,
      url: row.secure_url as string,
      format: row.format as string,
      width: row.width as number,
      height: row.height as number,
      byteSize: row.byte_size as number,
      displayOrder: row.display_order as number,
      altText: row.alt_text as string | null,
      createdAt: mapPgTimestamptz(row.created_at, "created_at")
    };
    assertOwnerImage(image);
    return Object.freeze(image);
  } catch {
    throw new OwnerImageMappingError();
  }
}

export function copyOwnerImage(image: Readonly<OwnerImage>): OwnerImage {
  assertOwnerImage(image);
  return Object.freeze({
    id: image.id,
    url: image.url,
    format: image.format,
    width: image.width,
    height: image.height,
    byteSize: image.byteSize,
    displayOrder: image.displayOrder,
    altText: image.altText,
    createdAt: new Date(image.createdAt.getTime())
  });
}

export function mapOwnerImageToDto(image: Readonly<OwnerImage>): OwnerImageDto {
  assertOwnerImage(image);
  return Object.freeze({
    id: image.id,
    url: image.url,
    format: image.format,
    width: image.width,
    height: image.height,
    byteSize: image.byteSize,
    displayOrder: image.displayOrder,
    altText: image.altText,
    createdAt: formatApiTimestamp(image.createdAt)
  });
}
