import type { QueryResultRow } from "pg";
import type { UserRole } from "../../shared/types/authentication.js";
import type { LookupValue } from "./lookup-mapper.js";
import type { OwnerImage } from "./owner-image-mapper.js";
import {
  createOwnerListingDetail,
  mapOwnerListingToDto,
  mapPersistedOwnerListingRow,
  type OwnerListingDetail,
  type OwnerListingDetailBase,
  type OwnerListingDetailDto,
  type PersistedOwnerListingRow
} from "./owner-listing-mapper.js";

const maximumIntegerId = 2_147_483_647;
const e164Pattern = /^\+[1-9][0-9]{7,14}$/;

export interface AdminListingDetailRow extends PersistedOwnerListingRow, QueryResultRow {
  readonly landlord_id: unknown;
  readonly landlord_role: unknown;
  readonly landlord_email: unknown;
  readonly landlord_phone: unknown;
  readonly landlord_is_active: unknown;
}

export interface AdminListingDetailLandlord {
  readonly id: number;
  readonly role: Extract<UserRole, "LANDLORD">;
  readonly email: string;
  readonly phone: string;
  readonly isActive: boolean;
}

export interface AdminListingDetailBase {
  readonly listing: OwnerListingDetailBase;
  readonly landlord: AdminListingDetailLandlord;
}

export interface AdminListingDetail extends OwnerListingDetail {
  readonly landlord: AdminListingDetailLandlord;
}

export interface AdminListingDetailDto extends OwnerListingDetailDto {
  readonly landlord: AdminListingDetailLandlord;
}

export class AdminListingDetailMappingError extends Error {
  constructor() {
    super("Admin listing detail representation is invalid.");
    this.name = "AdminListingDetailMappingError";
  }
}

function isPositiveIntegerId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= maximumIntegerId;
}

function mapLandlord(row: Readonly<AdminListingDetailRow>): AdminListingDetailLandlord {
  if (
    !isPositiveIntegerId(row.landlord_id) ||
    row.landlord_role !== "LANDLORD" ||
    typeof row.landlord_email !== "string" ||
    row.landlord_email.length === 0 ||
    row.landlord_email !== row.landlord_email.trim().toLowerCase() ||
    typeof row.landlord_phone !== "string" ||
    !e164Pattern.test(row.landlord_phone) ||
    typeof row.landlord_is_active !== "boolean"
  ) {
    throw new AdminListingDetailMappingError();
  }
  return Object.freeze({
    id: row.landlord_id,
    role: row.landlord_role,
    email: row.landlord_email,
    phone: row.landlord_phone,
    isActive: row.landlord_is_active
  });
}

function copyLandlord(landlord: Readonly<AdminListingDetailLandlord>): AdminListingDetailLandlord {
  const row = {
    landlord_id: landlord.id,
    landlord_role: landlord.role,
    landlord_email: landlord.email,
    landlord_phone: landlord.phone,
    landlord_is_active: landlord.isActive
  } as AdminListingDetailRow;
  return mapLandlord(row);
}

export function mapAdminListingDetailRow(row: Readonly<AdminListingDetailRow>): AdminListingDetailBase {
  try {
    return Object.freeze({
      listing: mapPersistedOwnerListingRow(row),
      landlord: mapLandlord(row)
    });
  } catch {
    throw new AdminListingDetailMappingError();
  }
}

export function createAdminListingDetail(
  base: Readonly<AdminListingDetailBase>,
  amenities: readonly Readonly<LookupValue>[],
  images: readonly Readonly<OwnerImage>[],
  currentModerationReason: unknown
): AdminListingDetail {
  try {
    const owner = createOwnerListingDetail(base.listing, amenities, images, currentModerationReason);
    return Object.freeze({ ...owner, landlord: copyLandlord(base.landlord) });
  } catch {
    throw new AdminListingDetailMappingError();
  }
}

export function mapAdminListingDetailToDto(detail: Readonly<AdminListingDetail>): AdminListingDetailDto {
  try {
    return Object.freeze({ ...mapOwnerListingToDto(detail), landlord: copyLandlord(detail.landlord) });
  } catch {
    throw new AdminListingDetailMappingError();
  }
}
