import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryExactlyOne,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";
import type {
  CleanlinessLevel,
  CreateRoommateRequestInput,
  NoisePreference,
  PetEnvironment,
  PatchRoommateRequestInput,
  RoommateProfileInput,
  RoommateRequestStatus,
  SleepSchedule,
  SmokingEnvironment
} from "../validations/roommate-validation.js";

export interface RoommateProfileRecord extends RoommateProfileInput {
  readonly tenantId: number;
  readonly moderationState: "VISIBLE" | "HIDDEN";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RoommateRequestRecord extends CreateRoommateRequestInput {
  readonly id: number;
  readonly ownerTenantId: number;
  readonly status: RoommateRequestStatus;
  readonly expiresAt: string;
  readonly listingLinkedAt: string | null;
  readonly moderationState: "VISIBLE" | "HIDDEN";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RoommateDiscoveryCandidate extends RoommateRequestRecord {
  readonly profile: RoommateProfileRecord;
}

interface ProfileRow extends QueryResultRow {
  tenant_id: unknown;
  intro: unknown;
  sleep_schedule: unknown;
  cleanliness_level: unknown;
  noise_preference: unknown;
  smoking_environment: unknown;
  pet_environment: unknown;
  moderation_state: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface RequestRow extends QueryResultRow {
  id: unknown;
  owner_tenant_id: unknown;
  listing_id: unknown;
  preferred_area_keys: unknown;
  budget_min_per_person: unknown;
  budget_max_per_person: unknown;
  move_in_from: unknown;
  move_in_until: unknown;
  note: unknown;
  status: unknown;
  expires_at: unknown;
  listing_linked_at: unknown;
  moderation_state: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface CandidateRow extends RequestRow {
  profile_tenant_id: unknown;
  profile_intro: unknown;
  profile_sleep_schedule: unknown;
  profile_cleanliness_level: unknown;
  profile_noise_preference: unknown;
  profile_smoking_environment: unknown;
  profile_pet_environment: unknown;
  profile_moderation_state: unknown;
  profile_created_at: unknown;
  profile_updated_at: unknown;
}

interface ExpiredRequestRow extends QueryResultRow {
  id: unknown;
  owner_tenant_id: unknown;
  expires_at: unknown;
}

interface PendingInterestRow extends QueryResultRow {
  id: unknown;
  interested_tenant_id: unknown;
}

const profileColumns = `
  tenant_id, intro, sleep_schedule, cleanliness_level, noise_preference,
  smoking_environment, pet_environment, moderation_state, created_at, updated_at
`;

const requestColumns = `
  id, owner_tenant_id, listing_id, preferred_area_keys, budget_min_per_person,
  budget_max_per_person, move_in_from, move_in_until, note, status, expires_at,
  listing_linked_at, moderation_state, created_at, updated_at
`;

function positiveId(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return parsed;
}

function nullableId(value: unknown, field: string): number | null {
  return value === null ? null : positiveId(value, field);
}

function timestamp(value: unknown, field: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  try {
    return formatApiTimestamp(date);
  } catch {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
}

function nullableTimestamp(value: unknown, field: string): string | null {
  return value === null ? null : timestamp(value, field);
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new RepositoryInvariantError(`${field} is invalid.`);
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== "string") throw new RepositoryInvariantError(`${field} is invalid.`);
  return value as string | null;
}

function enumText<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return value as T;
}

function budget(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 999_999_999_999) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return parsed;
}

function areaKeys(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new RepositoryInvariantError("roommateRequest.preferredAreaKeys is invalid.");
  }
  return Object.freeze([...(value as string[])]);
}

function dateValue(value: unknown, field: string): string {
  const result = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(result)) throw new RepositoryInvariantError(`${field} is invalid.`);
  return result;
}

function mapProfile(row: Readonly<ProfileRow>): RoommateProfileRecord {
  return Object.freeze({
    tenantId: positiveId(row.tenant_id, "roommateProfile.tenantId"),
    intro: text(row.intro, "roommateProfile.intro"),
    sleepSchedule: enumText(row.sleep_schedule, "roommateProfile.sleepSchedule", [
      "EARLY",
      "STANDARD",
      "LATE",
      "FLEXIBLE"
    ]),
    cleanlinessLevel: enumText(row.cleanliness_level, "roommateProfile.cleanlinessLevel", [
      "RELAXED",
      "BALANCED",
      "TIDY"
    ]),
    noisePreference: enumText(row.noise_preference, "roommateProfile.noisePreference", ["QUIET", "BALANCED", "SOCIAL"]),
    smokingEnvironment: enumText(row.smoking_environment, "roommateProfile.smokingEnvironment", [
      "SMOKE_FREE",
      "OUTDOOR_ONLY",
      "NO_PREFERENCE"
    ]),
    petEnvironment: enumText(row.pet_environment, "roommateProfile.petEnvironment", [
      "NO_PETS",
      "OK_WITH_PETS",
      "HAS_PET"
    ]),
    moderationState: enumText(row.moderation_state, "roommateProfile.moderationState", ["VISIBLE", "HIDDEN"]),
    createdAt: timestamp(row.created_at, "roommateProfile.createdAt"),
    updatedAt: timestamp(row.updated_at, "roommateProfile.updatedAt")
  });
}

function mapRequest(row: Readonly<RequestRow>): RoommateRequestRecord {
  const status = enumText(row.status, "roommateRequest.status", ["OPEN", "MATCHED", "CANCELLED", "EXPIRED"]);
  const listingId = nullableId(row.listing_id, "roommateRequest.listingId");
  const listingLinkedAt = nullableTimestamp(row.listing_linked_at, "roommateRequest.listingLinkedAt");
  if ((listingId === null) !== (listingLinkedAt === null)) {
    throw new RepositoryInvariantError("roommateRequest listing link representation is invalid.");
  }
  return Object.freeze({
    id: positiveId(row.id, "roommateRequest.id"),
    ownerTenantId: positiveId(row.owner_tenant_id, "roommateRequest.ownerTenantId"),
    listingId,
    preferredAreaKeys: areaKeys(row.preferred_area_keys),
    budgetMinPerPerson: budget(row.budget_min_per_person, "roommateRequest.budgetMinPerPerson"),
    budgetMaxPerPerson: budget(row.budget_max_per_person, "roommateRequest.budgetMaxPerPerson"),
    moveInFrom: dateValue(row.move_in_from, "roommateRequest.moveInFrom"),
    moveInUntil: dateValue(row.move_in_until, "roommateRequest.moveInUntil"),
    note: nullableText(row.note, "roommateRequest.note"),
    status,
    expiresAt: timestamp(row.expires_at, "roommateRequest.expiresAt"),
    listingLinkedAt,
    moderationState: enumText(row.moderation_state, "roommateRequest.moderationState", ["VISIBLE", "HIDDEN"]),
    createdAt: timestamp(row.created_at, "roommateRequest.createdAt"),
    updatedAt: timestamp(row.updated_at, "roommateRequest.updatedAt")
  });
}

function mapCandidate(row: Readonly<CandidateRow>): RoommateDiscoveryCandidate {
  const request = mapRequest(row);
  const profile = mapProfile({
    tenant_id: row.profile_tenant_id,
    intro: row.profile_intro,
    sleep_schedule: row.profile_sleep_schedule,
    cleanliness_level: row.profile_cleanliness_level,
    noise_preference: row.profile_noise_preference,
    smoking_environment: row.profile_smoking_environment,
    pet_environment: row.profile_pet_environment,
    moderation_state: row.profile_moderation_state,
    created_at: row.profile_created_at,
    updated_at: row.profile_updated_at
  });
  if (profile.tenantId !== request.ownerTenantId)
    throw new RepositoryInvariantError("Roommate candidate owner mismatch.");
  return Object.freeze({ ...request, profile });
}

function isoDate(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    throw new RepositoryInvariantError("Roommate time is invalid.");
  return value.toISOString();
}

export interface RoommateDiscoveryCandidateQuery {
  readonly callerTenantId: number;
  readonly now: Date;
  readonly area: string | null;
  readonly budgetMinPerPerson: number | null;
  readonly budgetMaxPerPerson: number | null;
  readonly moveInFrom: string | null;
  readonly moveInUntil: string | null;
  readonly listingMode: "ALL" | "LINKED" | "UNLINKED";
  readonly limit: number;
  readonly offset: number;
}

export interface RoommateRepository {
  readonly findProfile: (
    executor: SqlExecutor,
    tenantId: number,
    forUpdate?: boolean
  ) => Promise<RoommateProfileRecord | null>;
  readonly upsertProfile: (
    executor: SqlExecutor,
    tenantId: number,
    input: RoommateProfileInput
  ) => Promise<RoommateProfileRecord>;
  readonly lockTenant: (executor: SqlExecutor, tenantId: number) => Promise<void>;
  readonly findRequestById: (
    executor: SqlExecutor,
    requestId: number,
    forUpdate?: boolean
  ) => Promise<RoommateRequestRecord | null>;
  readonly findOwnedRequest: (
    executor: SqlExecutor,
    tenantId: number,
    requestId: number,
    forUpdate?: boolean
  ) => Promise<RoommateRequestRecord | null>;
  readonly findOpenRequestForOwner: (
    executor: SqlExecutor,
    tenantId: number,
    forUpdate?: boolean
  ) => Promise<RoommateRequestRecord | null>;
  readonly createRequest: (
    executor: SqlExecutor,
    ownerTenantId: number,
    input: CreateRoommateRequestInput
  ) => Promise<RoommateRequestRecord>;
  readonly updateRequest: (
    executor: SqlExecutor,
    requestId: number,
    input: PatchRoommateRequestInput & { readonly listingId: number | null }
  ) => Promise<RoommateRequestRecord>;
  readonly cancelRequest: (executor: SqlExecutor, requestId: number) => Promise<RoommateRequestRecord | null>;
  readonly renewRequest: (executor: SqlExecutor, requestId: number) => Promise<RoommateRequestRecord>;
  readonly linkListing: (executor: SqlExecutor, requestId: number, listingId: number) => Promise<RoommateRequestRecord>;
  readonly unlinkListing: (executor: SqlExecutor, requestId: number) => Promise<RoommateRequestRecord>;
  readonly listOwnedRequests: (
    executor: SqlExecutor,
    tenantId: number,
    status: RoommateRequestStatus | null,
    limit: number,
    offset: number
  ) => Promise<readonly RoommateRequestRecord[]>;
  readonly listDiscoveryCandidates: (
    executor: SqlExecutor,
    query: RoommateDiscoveryCandidateQuery
  ) => Promise<readonly RoommateDiscoveryCandidate[]>;
  readonly isPairBlocked: (executor: SqlExecutor, firstTenantId: number, secondTenantId: number) => Promise<boolean>;
  readonly hasAcceptedConnection: (executor: SqlExecutor, tenantId: number) => Promise<boolean>;
  readonly materializeExpired: (executor: SqlExecutor, requestId: number, now: Date) => Promise<boolean>;
  readonly sweepExpired: (executor: SqlExecutor, now: Date, limit: number) => Promise<number>;
  readonly createDueExpiryReminders: (
    executor: SqlExecutor,
    now: Date,
    reminderLeadDays: number,
    limit: number
  ) => Promise<number>;
  readonly rejectPendingInterests: (
    executor: SqlExecutor,
    requestId: number,
    terminalReason: "REQUEST_CANCELLED" | "REQUEST_EXPIRED"
  ) => Promise<number>;
}

function ownerPredicate(tenantId: number, requestId: number): readonly unknown[] {
  return [requestId, tenantId];
}

function notificationDedupe(event: string, requestId: number, suffix: string): string {
  return `roommate:${event}:${requestId}:${suffix}`;
}

async function insertExpiryNotification(
  executor: SqlExecutor,
  recipientId: number,
  requestId: number,
  eventType: "ROOMMATE_REQUEST_EXPIRED" | "ROOMMATE_INTEREST_REJECTED",
  interestId: number | null,
  expiresAt: string
): Promise<void> {
  const interestEvent = eventType === "ROOMMATE_INTEREST_REJECTED";
  await executeCommand(executor, {
    text: `
      INSERT INTO notifications (
        recipient_id, event_type, roommate_request_id, roommate_interest_id, resource_path, dedupe_key
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING
    `,
    values: [
      recipientId,
      eventType,
      interestEvent ? null : requestId,
      interestId,
      interestId === null ? `/roommate-requests/${requestId}` : `/roommate-interests/${interestId}`,
      notificationDedupe(eventType, requestId, interestId === null ? expiresAt : String(interestId))
    ]
  });
}

export function createRoommateRepository(): RoommateRepository {
  const repository: RoommateRepository = {
    findProfile(executor, tenantId, forUpdate = false) {
      return queryOptional<ProfileRow, RoommateProfileRecord>(
        executor,
        {
          text: `SELECT ${profileColumns} FROM roommate_profiles WHERE tenant_id = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
          values: [tenantId]
        },
        mapProfile
      );
    },

    upsertProfile(executor, tenantId, input) {
      return queryExactlyOne<ProfileRow, RoommateProfileRecord>(
        executor,
        {
          text: `
            INSERT INTO roommate_profiles (
              tenant_id, intro, sleep_schedule, cleanliness_level, noise_preference,
              smoking_environment, pet_environment
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (tenant_id) DO UPDATE SET
              intro = EXCLUDED.intro,
              sleep_schedule = EXCLUDED.sleep_schedule,
              cleanliness_level = EXCLUDED.cleanliness_level,
              noise_preference = EXCLUDED.noise_preference,
              smoking_environment = EXCLUDED.smoking_environment,
              pet_environment = EXCLUDED.pet_environment,
              updated_at = CASE
                WHEN roommate_profiles.intro IS DISTINCT FROM EXCLUDED.intro
                  OR roommate_profiles.sleep_schedule IS DISTINCT FROM EXCLUDED.sleep_schedule
                  OR roommate_profiles.cleanliness_level IS DISTINCT FROM EXCLUDED.cleanliness_level
                  OR roommate_profiles.noise_preference IS DISTINCT FROM EXCLUDED.noise_preference
                  OR roommate_profiles.smoking_environment IS DISTINCT FROM EXCLUDED.smoking_environment
                  OR roommate_profiles.pet_environment IS DISTINCT FROM EXCLUDED.pet_environment
                THEN CURRENT_TIMESTAMP ELSE roommate_profiles.updated_at END
            RETURNING ${profileColumns}
          `,
          values: [
            tenantId,
            input.intro,
            input.sleepSchedule,
            input.cleanlinessLevel,
            input.noisePreference,
            input.smokingEnvironment,
            input.petEnvironment
          ]
        },
        mapProfile
      );
    },

    async lockTenant(executor, tenantId) {
      await executor.query({
        text: "SELECT pg_advisory_xact_lock(hashtextextended('rentmate:roommate:' || $1::text, 0))",
        values: [tenantId]
      });
    },

    findRequestById(executor, requestId, forUpdate = false) {
      return queryOptional<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `SELECT ${requestColumns} FROM roommate_requests WHERE id = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
          values: [requestId]
        },
        mapRequest
      );
    },

    findOwnedRequest(executor, tenantId, requestId, forUpdate = false) {
      return queryOptional<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `SELECT ${requestColumns} FROM roommate_requests WHERE id = $1 AND owner_tenant_id = $2 ${forUpdate ? "FOR UPDATE" : ""}`,
          values: ownerPredicate(tenantId, requestId)
        },
        mapRequest
      );
    },

    findOpenRequestForOwner(executor, tenantId, forUpdate = false) {
      return queryOptional<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            SELECT ${requestColumns}
            FROM roommate_requests
            WHERE owner_tenant_id = $1 AND status = 'OPEN'
            ORDER BY id ASC
            LIMIT 1
            ${forUpdate ? "FOR UPDATE" : ""}
          `,
          values: [tenantId]
        },
        mapRequest
      );
    },

    createRequest(executor, ownerTenantId, input) {
      return queryExactlyOne<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            INSERT INTO roommate_requests (
              owner_tenant_id, listing_id, preferred_area_keys, budget_min_per_person,
              budget_max_per_person, move_in_from, move_in_until, note, expires_at, listing_linked_at
            ) VALUES ($1, $2, $3::text[], $4, $5, $6::date, $7::date, $8,
                      CURRENT_TIMESTAMP + INTERVAL '30 days',
                      CASE WHEN $2::integer IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END)
            RETURNING ${requestColumns}
          `,
          values: [
            ownerTenantId,
            input.listingId,
            [...input.preferredAreaKeys],
            input.budgetMinPerPerson,
            input.budgetMaxPerPerson,
            input.moveInFrom,
            input.moveInUntil,
            input.note
          ]
        },
        mapRequest
      );
    },

    updateRequest(executor, requestId, input) {
      return queryExactlyOne<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            UPDATE roommate_requests
            SET preferred_area_keys = $2::text[],
                budget_min_per_person = $3,
                budget_max_per_person = $4,
                move_in_from = $5::date,
                move_in_until = $6::date,
                note = $7,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'OPEN'
            RETURNING ${requestColumns}
          `,
          values: [
            requestId,
            [...(input.preferredAreaKeys ?? [])],
            input.budgetMinPerPerson,
            input.budgetMaxPerPerson,
            input.moveInFrom,
            input.moveInUntil,
            input.note
          ]
        },
        mapRequest
      );
    },

    cancelRequest(executor, requestId) {
      return queryOptional<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            UPDATE roommate_requests
            SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'OPEN'
            RETURNING ${requestColumns}
          `,
          values: [requestId]
        },
        mapRequest
      );
    },

    renewRequest(executor, requestId) {
      return queryExactlyOne<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            UPDATE roommate_requests
            SET status = 'OPEN', expires_at = CURRENT_TIMESTAMP + INTERVAL '30 days', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'EXPIRED'
            RETURNING ${requestColumns}
          `,
          values: [requestId]
        },
        mapRequest
      );
    },

    linkListing(executor, requestId, listingId) {
      return queryExactlyOne<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            UPDATE roommate_requests
            SET listing_id = $2, listing_linked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'OPEN'
            RETURNING ${requestColumns}
          `,
          values: [requestId, listingId]
        },
        mapRequest
      );
    },

    unlinkListing(executor, requestId) {
      return queryExactlyOne<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            UPDATE roommate_requests
            SET listing_id = NULL, listing_linked_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'OPEN'
            RETURNING ${requestColumns}
          `,
          values: [requestId]
        },
        mapRequest
      );
    },

    listOwnedRequests(executor, tenantId, status, limit, offset) {
      const values: unknown[] = [tenantId];
      const statusClause = status === null ? "" : ` AND status = $${values.push(status)}`;
      const limitIndex = values.push(limit + 1);
      const offsetIndex = values.push(offset);
      return queryMany<RequestRow, RoommateRequestRecord>(
        executor,
        {
          text: `
            SELECT ${requestColumns}
            FROM roommate_requests
            WHERE owner_tenant_id = $1${statusClause}
            ORDER BY created_at DESC, id DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex}
          `,
          values
        },
        mapRequest
      );
    },

    listDiscoveryCandidates(executor, query) {
      const values: unknown[] = [query.callerTenantId, isoDate(query.now)];
      const conditions = [
        "r.owner_tenant_id <> $1",
        "r.status = 'OPEN'",
        "r.moderation_state = 'VISIBLE'",
        "r.expires_at > $2::timestamptz",
        "p.moderation_state = 'VISIBLE'",
        "NOT EXISTS (SELECT 1 FROM contact_blocks b WHERE (b.blocker_id = r.owner_tenant_id AND b.blocked_id = $1) OR (b.blocker_id = $1 AND b.blocked_id = r.owner_tenant_id))"
      ];
      if (query.listingMode === "LINKED") conditions.push("r.listing_id IS NOT NULL");
      if (query.listingMode === "UNLINKED") conditions.push("r.listing_id IS NULL");
      if (query.area !== null) {
        const index = values.push(query.area);
        conditions.push(
          `(r.listing_id IS NOT NULL OR EXISTS (SELECT 1 FROM unnest(r.preferred_area_keys) AS area_key WHERE position(lower($${index}) in lower(area_key)) > 0))`
        );
      }
      if (query.budgetMinPerPerson !== null) {
        const index = values.push(query.budgetMinPerPerson);
        conditions.push(`r.budget_max_per_person >= $${index}`);
      }
      if (query.budgetMaxPerPerson !== null) {
        const index = values.push(query.budgetMaxPerPerson);
        conditions.push(`r.budget_min_per_person <= $${index}`);
      }
      if (query.moveInFrom !== null) {
        const index = values.push(query.moveInFrom);
        conditions.push(`r.move_in_until >= $${index}::date`);
      }
      if (query.moveInUntil !== null) {
        const index = values.push(query.moveInUntil);
        conditions.push(`r.move_in_from <= $${index}::date`);
      }
      const limitIndex = values.push(query.limit);
      const offsetIndex = values.push(query.offset);
      return queryMany<CandidateRow, RoommateDiscoveryCandidate>(
        executor,
        {
          text: `
            SELECT
              r.id, r.owner_tenant_id, r.listing_id, r.preferred_area_keys,
              r.budget_min_per_person, r.budget_max_per_person, r.move_in_from,
              r.move_in_until, r.note, r.status, r.expires_at, r.listing_linked_at,
              r.moderation_state, r.created_at, r.updated_at,
              p.tenant_id AS profile_tenant_id, p.intro AS profile_intro,
              p.sleep_schedule AS profile_sleep_schedule,
              p.cleanliness_level AS profile_cleanliness_level,
              p.noise_preference AS profile_noise_preference,
              p.smoking_environment AS profile_smoking_environment,
              p.pet_environment AS profile_pet_environment,
              p.moderation_state AS profile_moderation_state,
              p.created_at AS profile_created_at, p.updated_at AS profile_updated_at
            FROM roommate_requests r
            JOIN roommate_profiles p ON p.tenant_id = r.owner_tenant_id
            WHERE ${conditions.join(" AND ")}
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex}
          `,
          values
        },
        mapCandidate
      );
    },

    async isPairBlocked(executor, firstTenantId, secondTenantId) {
      const result = await queryExactlyOne<{ value: unknown }, boolean>(
        executor,
        {
          text: `
            SELECT EXISTS (
              SELECT 1 FROM contact_blocks
              WHERE (blocker_id = $1 AND blocked_id = $2)
                 OR (blocker_id = $2 AND blocked_id = $1)
            ) AS value
          `,
          values: [firstTenantId, secondTenantId]
        },
        (row) => {
          if (typeof row.value !== "boolean") throw new RepositoryInvariantError("Roommate block result is invalid.");
          return row.value;
        }
      );
      return result;
    },

    async hasAcceptedConnection(executor, tenantId) {
      const result = await queryExactlyOne<{ value: unknown }, boolean>(
        executor,
        {
          text: `
            SELECT EXISTS (
              SELECT 1 FROM roommate_interests i
              JOIN roommate_requests r ON r.id = i.request_id
              WHERE i.status = 'ACCEPTED'
                AND (i.interested_tenant_id = $1 OR r.owner_tenant_id = $1)
            ) AS value
          `,
          values: [tenantId]
        },
        (row) => {
          if (typeof row.value !== "boolean")
            throw new RepositoryInvariantError("Roommate connection result is invalid.");
          return row.value;
        }
      );
      return result;
    },

    async materializeExpired(executor, requestId, now) {
      const row = await queryOptional<
        ExpiredRequestRow,
        { readonly id: number; readonly ownerTenantId: number; readonly expiresAt: string }
      >(
        executor,
        {
          text: `
            UPDATE roommate_requests
            SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'OPEN' AND expires_at <= $2::timestamptz
            RETURNING id, owner_tenant_id, expires_at
          `,
          values: [requestId, isoDate(now)]
        },
        (value) =>
          Object.freeze({
            id: positiveId(value.id, "roommateRequest.id"),
            ownerTenantId: positiveId(value.owner_tenant_id, "roommateRequest.ownerTenantId"),
            expiresAt: timestamp(value.expires_at, "roommateRequest.expiresAt")
          })
      );
      if (!row) return false;
      await repository.rejectPendingInterests(executor, row.id, "REQUEST_EXPIRED");
      await insertExpiryNotification(
        executor,
        row.ownerTenantId,
        row.id,
        "ROOMMATE_REQUEST_EXPIRED",
        null,
        row.expiresAt
      );
      return true;
    },

    async sweepExpired(executor, now, limit) {
      const rows = await queryMany<ExpiredRequestRow, { readonly id: number }>(
        executor,
        {
          text: `
            SELECT id
            FROM roommate_requests
            WHERE status = 'OPEN' AND expires_at <= $1::timestamptz
            ORDER BY expires_at ASC, id ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
          `,
          values: [isoDate(now), limit]
        },
        (row) => ({ id: positiveId(row.id, "roommateRequest.id") })
      );
      let count = 0;
      for (const row of rows) {
        if (await repository.materializeExpired(executor, row.id, now)) count += 1;
      }
      return count;
    },

    async createDueExpiryReminders(executor, now, reminderLeadDays, limit) {
      const rows = await queryMany<
        ExpiredRequestRow,
        { readonly id: number; readonly ownerTenantId: number; readonly expiresAt: string }
      >(
        executor,
        {
          text: `
            SELECT id, owner_tenant_id, expires_at
            FROM roommate_requests
            WHERE status = 'OPEN'
              AND expires_at > $1::timestamptz
              AND expires_at <= $1::timestamptz + ($2::integer * INTERVAL '1 day')
            ORDER BY expires_at ASC, id ASC
            LIMIT $3
            FOR UPDATE SKIP LOCKED
          `,
          values: [isoDate(now), reminderLeadDays, limit]
        },
        (row) => ({
          id: positiveId(row.id, "roommateRequest.id"),
          ownerTenantId: positiveId(row.owner_tenant_id, "roommateRequest.ownerTenantId"),
          expiresAt: timestamp(row.expires_at, "roommateRequest.expiresAt")
        })
      );
      let created = 0;
      for (const row of rows) {
        const inserted = await executeCommand(executor, {
          text: `
            INSERT INTO notifications (
              recipient_id, event_type, roommate_request_id, resource_path, dedupe_key
            ) VALUES ($1, 'ROOMMATE_REQUEST_EXPIRING', $2, $3, $4)
            ON CONFLICT DO NOTHING
          `,
          values: [
            row.ownerTenantId,
            row.id,
            `/roommate-requests/${row.id}`,
            notificationDedupe("ROOMMATE_REQUEST_EXPIRING", row.id, row.expiresAt)
          ]
        });
        created += inserted;
      }
      return created;
    },

    async rejectPendingInterests(executor, requestId, terminalReason) {
      const rows = await queryMany<PendingInterestRow, { readonly id: number; readonly interestedTenantId: number }>(
        executor,
        {
          text: `
            UPDATE roommate_interests
            SET status = 'REJECTED', ended_at = CURRENT_TIMESTAMP,
                terminal_reason = $2, updated_at = CURRENT_TIMESTAMP
            WHERE request_id = $1 AND status = 'PENDING'
            RETURNING id, interested_tenant_id
          `,
          values: [requestId, terminalReason]
        },
        (row) => ({
          id: positiveId(row.id, "roommateInterest.id"),
          interestedTenantId: positiveId(row.interested_tenant_id, "roommateInterest.interestedTenantId")
        })
      );
      for (const row of rows) {
        await insertExpiryNotification(
          executor,
          row.interestedTenantId,
          requestId,
          "ROOMMATE_INTEREST_REJECTED",
          row.id,
          terminalReason
        );
      }
      return rows.length;
    }
  };
  return Object.freeze(repository);
}
