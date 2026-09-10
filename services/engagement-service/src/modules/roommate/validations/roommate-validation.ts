import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import {
  validateJsonIntegerId,
  validateMonthlyRent
} from "../../../../../shared/src/runtime/shared/validation/primitives.js";
import {
  readScalarQueryValue,
  validateBodyFields,
  validateQueryKeys,
  type PlainJsonObject
} from "../../../../../shared/src/runtime/shared/validation/request.js";
import { matchAreaAlias } from "@rentmate/service-shared/area-domain";

export const roommateProfileEnumValues = Object.freeze({
  sleepSchedule: ["EARLY", "STANDARD", "LATE", "FLEXIBLE"] as const,
  cleanlinessLevel: ["RELAXED", "BALANCED", "TIDY"] as const,
  noisePreference: ["QUIET", "BALANCED", "SOCIAL"] as const,
  smokingEnvironment: ["SMOKE_FREE", "OUTDOOR_ONLY", "NO_PREFERENCE"] as const,
  petEnvironment: ["NO_PETS", "OK_WITH_PETS", "HAS_PET"] as const
});

export type SleepSchedule = (typeof roommateProfileEnumValues.sleepSchedule)[number];
export type CleanlinessLevel = (typeof roommateProfileEnumValues.cleanlinessLevel)[number];
export type NoisePreference = (typeof roommateProfileEnumValues.noisePreference)[number];
export type SmokingEnvironment = (typeof roommateProfileEnumValues.smokingEnvironment)[number];
export type PetEnvironment = (typeof roommateProfileEnumValues.petEnvironment)[number];
export type RoommateRequestStatus = "OPEN" | "MATCHED" | "CANCELLED" | "EXPIRED";
export type ListingMode = "ALL" | "LINKED" | "UNLINKED";

export interface RoommateProfileInput {
  readonly intro: string;
  readonly sleepSchedule: SleepSchedule;
  readonly cleanlinessLevel: CleanlinessLevel;
  readonly noisePreference: NoisePreference;
  readonly smokingEnvironment: SmokingEnvironment;
  readonly petEnvironment: PetEnvironment;
}

export interface RoommateRequestContent {
  readonly listingId: number | null;
  readonly preferredAreaKeys: readonly string[];
  readonly budgetMinPerPerson: number;
  readonly budgetMaxPerPerson: number;
  readonly moveInFrom: string;
  readonly moveInUntil: string;
  readonly note: string | null;
}

export type CreateRoommateRequestInput = RoommateRequestContent;

export interface PatchRoommateRequestInput {
  readonly preferredAreaKeys?: readonly string[];
  readonly budgetMinPerPerson?: number;
  readonly budgetMaxPerPerson?: number;
  readonly moveInFrom?: string;
  readonly moveInUntil?: string;
  readonly note?: string | null;
}

export interface RoommateDiscoveryQuery {
  readonly area: string | null;
  readonly budgetMinPerPerson: number | null;
  readonly budgetMaxPerPerson: number | null;
  readonly moveInFrom: string | null;
  readonly moveInUntil: string | null;
  readonly listingMode: ListingMode;
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

export interface RoommateMineQuery {
  readonly status: RoommateRequestStatus | null;
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

const roommateDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const maximumBudget = 999_999_999_999;
const maximumAreaCodePoints = 120;
const maximumPageSize = 50;
const maximumPage = 2_147_483_647;

function controlCharacter(value: string, allowLineFeed = true): boolean {
  for (const character of value) {
    if ((!allowLineFeed || character !== "\n") && /\p{Cc}/u.test(character)) return true;
  }
  return false;
}

function normalizeMultilineText(value: unknown, field: string, minimum: number, maximum: number): string {
  if (typeof value !== "string") throwValidationIssue(field, "INVALID_TYPE", `${field} must be a string.`);
  const lineNormalized = value.normalize("NFC").replace(/\r\n?/gu, "\n");
  if (controlCharacter(lineNormalized)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must not contain control characters or tabs.`);
  }
  const normalized = lineNormalized.trim();
  if (!normalized) throwValidationIssue(field, "REQUIRED", `${field} must not be blank.`);
  const length = [...normalized].length;
  if (length < minimum) throwValidationIssue(field, "TOO_SHORT", `${field} is shorter than the allowed length.`);
  if (length > maximum) throwValidationIssue(field, "TOO_LONG", `${field} exceeds the allowed length.`);
  return normalized;
}

function normalizeSingleLineText(value: unknown, field: string, minimum: number, maximum: number): string {
  if (typeof value !== "string") throwValidationIssue(field, "INVALID_TYPE", `${field} must be a string.`);
  const nfc = value.normalize("NFC");
  if (controlCharacter(nfc, false)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must not contain control characters.`);
  }
  const normalized = nfc.trim().replace(/\s+/gu, " ");
  if (!normalized) throwValidationIssue(field, "REQUIRED", `${field} must not be blank.`);
  const length = [...normalized].length;
  if (length < minimum) throwValidationIssue(field, "TOO_SHORT", `${field} is shorter than the allowed length.`);
  if (length > maximum) throwValidationIssue(field, "TOO_LONG", `${field} exceeds the allowed length.`);
  return normalized;
}

function nullableMultilineText(value: unknown, field: string, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  return normalizeMultilineText(value, field, 1, maximum);
}

function enumValue<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string") throwValidationIssue(field, "INVALID_TYPE", `${field} must be a string.`);
  const normalized = value.normalize("NFC").trim().toUpperCase();
  if (!allowed.includes(normalized as T)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must be an allowed value.`);
  }
  return normalized as T;
}

function requiredNumber(value: unknown, field: string): number {
  const parsed = validateMonthlyRent(value, field);
  if (parsed > maximumBudget) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} must be at most 999999999999.`);
  }
  return parsed;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return requiredNumber(value, field);
}

export function validateRoommateCalendarDate(value: unknown, field: string): string {
  if (typeof value !== "string") throwValidationIssue(field, "INVALID_TYPE", `${field} must be an ISO date.`);
  if (!roommateDatePattern.test(value)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  const roundTrip = parsed.toISOString().slice(0, 10);
  if (roundTrip !== value) throwValidationIssue(field, "INVALID_VALUE", `${field} is not a valid calendar date.`);
  return value;
}

function dateToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatBusinessDate(now: Date): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("Roommate clock is invalid.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Roommate business date could not be determined.");
  return `${year}-${month}-${day}`;
}

export function roommateBusinessDate(now = new Date()): string {
  return formatBusinessDate(now);
}

function addDays(value: string, days: number): string {
  const result = dateToUtc(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function normalizeAreaKeys(value: unknown, field = "preferredAreaKeys"): readonly string[] {
  if (!Array.isArray(value)) throwValidationIssue(field, "INVALID_TYPE", `${field} must be an array.`);
  const normalized = value.map((item) => {
    const safeText = normalizeSingleLineText(item, `${field}`, 1, maximumAreaCodePoints);
    return safeText;
  });
  const byComparison = new Map<string, string>();
  for (const item of normalized) {
    const comparison = item.toLocaleLowerCase("vi-VN");
    if (!byComparison.has(comparison)) byComparison.set(comparison, item);
  }
  if (byComparison.size > 5) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} must contain at most 5 different values.`);
  }
  return Object.freeze(
    [...byComparison.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "vi", { sensitivity: "base" }))
      .map(([, value]) => value)
  );
}

export function validateRoommateProfileBody(value: unknown): RoommateProfileInput {
  const body = validateBodyFields(value, [
    "intro",
    "sleepSchedule",
    "cleanlinessLevel",
    "noisePreference",
    "smokingEnvironment",
    "petEnvironment"
  ]);
  const requiredFields = [
    "intro",
    "sleepSchedule",
    "cleanlinessLevel",
    "noisePreference",
    "smokingEnvironment",
    "petEnvironment"
  ] as const;
  for (const field of requiredFields) {
    if (!(field in body)) throwValidationIssue(field, "REQUIRED", `${field} is required.`);
  }
  return Object.freeze({
    intro: normalizeMultilineText(body.intro, "intro", 20, 500),
    sleepSchedule: enumValue(body.sleepSchedule, "sleepSchedule", roommateProfileEnumValues.sleepSchedule),
    cleanlinessLevel: enumValue(body.cleanlinessLevel, "cleanlinessLevel", roommateProfileEnumValues.cleanlinessLevel),
    noisePreference: enumValue(body.noisePreference, "noisePreference", roommateProfileEnumValues.noisePreference),
    smokingEnvironment: enumValue(
      body.smokingEnvironment,
      "smokingEnvironment",
      roommateProfileEnumValues.smokingEnvironment
    ),
    petEnvironment: enumValue(body.petEnvironment, "petEnvironment", roommateProfileEnumValues.petEnvironment)
  });
}

function requestContentFromBody(body: PlainJsonObject, today: string): RoommateRequestContent {
  const requiredFields = [
    "listingId",
    "preferredAreaKeys",
    "budgetMinPerPerson",
    "budgetMaxPerPerson",
    "moveInFrom",
    "moveInUntil"
  ] as const;
  for (const field of requiredFields) {
    if (!(field in body)) throwValidationIssue(field, "REQUIRED", `${field} is required.`);
  }
  const listingId = body.listingId === null ? null : validateJsonIntegerId(body.listingId, "listingId");
  const preferredAreaKeys = normalizeAreaKeys(body.preferredAreaKeys);
  const budgetMinPerPerson = requiredNumber(body.budgetMinPerPerson, "budgetMinPerPerson");
  const budgetMaxPerPerson = requiredNumber(body.budgetMaxPerPerson, "budgetMaxPerPerson");
  const moveInFrom = validateRoommateCalendarDate(body.moveInFrom, "moveInFrom");
  const moveInUntil = validateRoommateCalendarDate(body.moveInUntil, "moveInUntil");
  const note = nullableMultilineText(body.note, "note", 500);
  const content = Object.freeze({
    listingId,
    preferredAreaKeys,
    budgetMinPerPerson,
    budgetMaxPerPerson,
    moveInFrom,
    moveInUntil,
    note
  });
  validateRoommateRequestContent(content, today);
  return content;
}

export function validateRoommateRequestContent(content: RoommateRequestContent, today = roommateBusinessDate()): void {
  if (content.budgetMaxPerPerson < content.budgetMinPerPerson) {
    throwValidationIssue(
      "budgetMaxPerPerson",
      "INVALID_VALUE",
      "budgetMaxPerPerson must be at least budgetMinPerPerson."
    );
  }
  if (content.moveInUntil < content.moveInFrom) {
    throwValidationIssue("moveInUntil", "INVALID_VALUE", "moveInUntil must be on or after moveInFrom.");
  }
  const latestMoveIn = addDays(today, 365);
  if (content.moveInFrom < today || content.moveInFrom > latestMoveIn) {
    throwValidationIssue("moveInFrom", "OUT_OF_RANGE", "moveInFrom must be within the next 365 business days.");
  }
  if (
    content.moveInUntil > latestMoveIn ||
    dateToUtc(content.moveInUntil).getTime() - dateToUtc(content.moveInFrom).getTime() > 90 * 86_400_000
  ) {
    throwValidationIssue("moveInUntil", "OUT_OF_RANGE", "moveInUntil must be within a 90-day window and 365 days.");
  }
  if (content.listingId === null && (content.preferredAreaKeys.length < 1 || content.preferredAreaKeys.length > 5)) {
    throwValidationIssue("preferredAreaKeys", "REQUIRED", "Unlinked requests require one to five preferred areas.");
  }
  if (content.listingId !== null && content.preferredAreaKeys.length > 5) {
    throwValidationIssue("preferredAreaKeys", "OUT_OF_RANGE", "preferredAreaKeys must contain at most 5 values.");
  }
}

export function validateCreateRoommateRequestBody(
  value: unknown,
  today = roommateBusinessDate()
): CreateRoommateRequestInput {
  const body = validateBodyFields(value, [
    "listingId",
    "preferredAreaKeys",
    "budgetMinPerPerson",
    "budgetMaxPerPerson",
    "moveInFrom",
    "moveInUntil",
    "note"
  ]);
  return requestContentFromBody(body, today);
}

export function validatePatchRoommateRequestBody(value: unknown): PatchRoommateRequestInput {
  const body = validateBodyFields(value, [
    "preferredAreaKeys",
    "budgetMinPerPerson",
    "budgetMaxPerPerson",
    "moveInFrom",
    "moveInUntil",
    "note"
  ]);
  if (Object.keys(body).length === 0) throwValidationIssue("body", "REQUIRED", "body must contain a field to update.");
  return Object.freeze({
    ...(Object.prototype.hasOwnProperty.call(body, "preferredAreaKeys")
      ? { preferredAreaKeys: normalizeAreaKeys(body.preferredAreaKeys) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "budgetMinPerPerson")
      ? { budgetMinPerPerson: requiredNumber(body.budgetMinPerPerson, "budgetMinPerPerson") }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "budgetMaxPerPerson")
      ? { budgetMaxPerPerson: requiredNumber(body.budgetMaxPerPerson, "budgetMaxPerPerson") }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "moveInFrom")
      ? { moveInFrom: validateRoommateCalendarDate(body.moveInFrom, "moveInFrom") }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "moveInUntil")
      ? { moveInUntil: validateRoommateCalendarDate(body.moveInUntil, "moveInUntil") }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "note")
      ? { note: nullableMultilineText(body.note, "note", 500) }
      : {})
  });
}

function parseQueryInteger(value: unknown, field: string, maximum: number): number | undefined {
  const scalar = readScalarQueryValue(value, field);
  if (scalar === undefined) return undefined;
  if (!/^\d+$/u.test(scalar)) throwValidationIssue(field, "INVALID_VALUE", `${field} must be a decimal integer.`);
  const parsed = Number(scalar);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} is outside the allowed range.`);
  }
  return parsed;
}

function optionalQueryBudget(value: unknown, field: string): number | null {
  const scalar = readScalarQueryValue(value, field);
  if (scalar === undefined) return null;
  if (!/^\d+$/u.test(scalar)) throwValidationIssue(field, "INVALID_VALUE", `${field} must be a whole VND amount.`);
  return requiredNumber(Number(scalar), field);
}

function optionalQueryDate(value: unknown, field: string): string | null {
  const scalar = readScalarQueryValue(value, field);
  return scalar === undefined ? null : validateRoommateCalendarDate(scalar, field);
}

export function validateRoommateDiscoveryQuery(value: unknown): RoommateDiscoveryQuery {
  const query = validateQueryKeys(value, [
    "area",
    "budgetMinPerPerson",
    "budgetMaxPerPerson",
    "moveInFrom",
    "moveInUntil",
    "listingMode",
    "page",
    "pageSize"
  ]);
  const areaValue = readScalarQueryValue(query.area, "area");
  const rawArea = areaValue === undefined ? null : normalizeSingleLineText(areaValue, "area", 1, maximumAreaCodePoints);
  const area = rawArea === null ? null : (matchAreaAlias(rawArea)?.key ?? rawArea);
  const budgetMinPerPerson = optionalQueryBudget(query.budgetMinPerPerson, "budgetMinPerPerson");
  const budgetMaxPerPerson = optionalQueryBudget(query.budgetMaxPerPerson, "budgetMaxPerPerson");
  if (budgetMinPerPerson !== null && budgetMaxPerPerson !== null && budgetMinPerPerson > budgetMaxPerPerson) {
    throwValidationIssue(
      "budgetMaxPerPerson",
      "INVALID_VALUE",
      "budgetMaxPerPerson must be at least budgetMinPerPerson."
    );
  }
  const moveInFrom = optionalQueryDate(query.moveInFrom, "moveInFrom");
  const moveInUntil = optionalQueryDate(query.moveInUntil, "moveInUntil");
  if (moveInFrom !== null && moveInUntil !== null && moveInFrom > moveInUntil) {
    throwValidationIssue("moveInUntil", "INVALID_VALUE", "moveInUntil must be on or after moveInFrom.");
  }
  const listingModeValue = readScalarQueryValue(query.listingMode, "listingMode") ?? "ALL";
  const listingMode = listingModeValue.toUpperCase();
  if (listingMode !== "ALL" && listingMode !== "LINKED" && listingMode !== "UNLINKED") {
    throwValidationIssue("listingMode", "INVALID_VALUE", "listingMode must be ALL, LINKED, or UNLINKED.");
  }
  const page = parseQueryInteger(query.page, "page", maximumPage) ?? 1;
  const pageSize = parseQueryInteger(query.pageSize, "pageSize", maximumPageSize) ?? 20;
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) throwValidationIssue("page", "OUT_OF_RANGE", "page is too large.");
  return Object.freeze({
    area,
    budgetMinPerPerson,
    budgetMaxPerPerson,
    moveInFrom,
    moveInUntil,
    listingMode: listingMode as ListingMode,
    page,
    pageSize,
    offset
  });
}

export function validateRoommateMineQuery(value: unknown): RoommateMineQuery {
  const query = validateQueryKeys(value, ["status", "page", "pageSize"]);
  const statusValue = readScalarQueryValue(query.status, "status");
  if (
    statusValue !== undefined &&
    !(["OPEN", "MATCHED", "CANCELLED", "EXPIRED"] as readonly string[]).includes(statusValue.toUpperCase())
  ) {
    throwValidationIssue("status", "INVALID_VALUE", "status is not valid.");
  }
  const page = parseQueryInteger(query.page, "page", maximumPage) ?? 1;
  const pageSize = parseQueryInteger(query.pageSize, "pageSize", maximumPageSize) ?? 20;
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) throwValidationIssue("page", "OUT_OF_RANGE", "page is too large.");
  return Object.freeze({
    status: statusValue === undefined ? null : (statusValue.toUpperCase() as RoommateRequestStatus),
    page,
    pageSize,
    offset
  });
}

export function parseRoommateRequestId(value: string | string[]): number {
  if (typeof value !== "string") throwValidationIssue("requestId", "INVALID_TYPE", "requestId must be provided once.");
  return parsePathId(value, "requestId");
}

export function parseRoommateListingId(value: unknown): number {
  return validateJsonIntegerId(value, "listingId");
}
