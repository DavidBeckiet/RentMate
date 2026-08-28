import type {
  AuthenticationAccount,
  LoadAuthenticationAccount,
  UserRole
} from "./src/runtime/shared/types/authentication.js";

interface IdentityAccountClientOptions {
  readonly baseUrl: string;
  readonly internalToken: string;
  readonly fetcher?: typeof fetch;
}

export interface IdentityAccountClient {
  readonly loadAuthenticationAccount: LoadAuthenticationAccount;
  readonly loadActiveLandlordIds: () => Promise<readonly number[]>;
  readonly loadProfilesByIds: (userIds: readonly number[]) => Promise<readonly IdentityUserProfile[]>;
  readonly loadRoommateTenantProjectionsByIds: (
    userIds: readonly number[]
  ) => Promise<readonly IdentityRoommateTenantProjection[]>;
  readonly loadRoommateRiskProjectionsByIds: (
    userIds: readonly number[]
  ) => Promise<readonly IdentityRoommateRiskProjection[]>;
  readonly loadVerifiedLandlordIds: (userIds: readonly number[]) => Promise<readonly number[]>;
}

export interface IdentityUserProfile {
  readonly id: number;
  readonly role: UserRole;
  readonly email: string;
  readonly phone: string | null;
  readonly isActive: boolean;
}

export interface IdentityRoommateTenantProjection {
  readonly tenantId: number;
  readonly role: UserRole;
  readonly displayName: string | null;
  readonly isActive: boolean;
  readonly memberSince: string;
  readonly emailVerified: boolean;
  readonly phoneVerified: boolean;
}

export interface IdentityRoommateRiskProjection {
  readonly tenantId: number;
  readonly createdAt: string;
}

function isAccount(value: unknown): value is AuthenticationAccount {
  if (typeof value !== "object" || value === null) return false;
  const account = value as Partial<AuthenticationAccount>;
  return (
    Number.isInteger(account.id) &&
    (account.id ?? 0) > 0 &&
    typeof account.role === "string" &&
    (["TENANT", "LANDLORD", "ADMIN"] as readonly UserRole[]).includes(account.role as UserRole) &&
    typeof account.isActive === "boolean"
  );
}

function isUserProfile(value: unknown): value is IdentityUserProfile {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Partial<IdentityUserProfile>;
  return (
    Number.isSafeInteger(profile.id) &&
    (profile.id ?? 0) > 0 &&
    typeof profile.role === "string" &&
    (["TENANT", "LANDLORD", "ADMIN"] as readonly UserRole[]).includes(profile.role as UserRole) &&
    typeof profile.email === "string" &&
    (profile.phone === null || typeof profile.phone === "string") &&
    typeof profile.isActive === "boolean"
  );
}

function isRoommateTenantProjection(value: unknown): value is IdentityRoommateTenantProjection {
  if (typeof value !== "object" || value === null) return false;
  const projection = value as Partial<IdentityRoommateTenantProjection>;
  return (
    Number.isSafeInteger(projection.tenantId) &&
    (projection.tenantId ?? 0) >= 1 &&
    (projection.tenantId ?? 0) <= 2_147_483_647 &&
    typeof projection.role === "string" &&
    (["TENANT", "LANDLORD", "ADMIN"] as readonly UserRole[]).includes(projection.role as UserRole) &&
    (projection.displayName === null || typeof projection.displayName === "string") &&
    typeof projection.isActive === "boolean" &&
    typeof projection.memberSince === "string" &&
    /^(?:[0-9]{4})-(?:0[1-9]|1[0-2])$/u.test(projection.memberSince) &&
    typeof projection.emailVerified === "boolean" &&
    typeof projection.phoneVerified === "boolean"
  );
}

function isRoommateRiskProjection(value: unknown): value is IdentityRoommateRiskProjection {
  if (typeof value !== "object" || value === null) return false;
  const projection = value as Partial<IdentityRoommateRiskProjection>;
  if (
    !Number.isSafeInteger(projection.tenantId) ||
    (projection.tenantId ?? 0) < 1 ||
    (projection.tenantId ?? 0) > 2_147_483_647 ||
    typeof projection.createdAt !== "string"
  ) {
    return false;
  }
  const parsed = new Date(projection.createdAt);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === projection.createdAt;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function createIdentityAccountClient(options: IdentityAccountClientOptions): IdentityAccountClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));

  const loadAuthenticationAccount: LoadAuthenticationAccount = async (userId) => {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}/internal/v1/accounts/${userId}`, {
        method: "GET",
        headers: { "x-rentmate-internal-token": options.internalToken }
      });
    } catch {
      throw new Error("Identity service account lookup failed.");
    }

    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Identity service account lookup failed.");

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Identity service account response is invalid.");
    }

    if (typeof payload !== "object" || payload === null || !("data" in payload)) {
      throw new Error("Identity service account response is invalid.");
    }

    const account = (payload as { readonly data: unknown }).data;
    if (!isAccount(account)) throw new Error("Identity service account response is invalid.");
    return account;
  };

  const loadActiveLandlordIds = async (): Promise<readonly number[]> => {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}/internal/v1/landlords/active-ids`, {
        method: "GET",
        headers: { "x-rentmate-internal-token": options.internalToken }
      });
    } catch {
      throw new Error("Identity service landlord lookup failed.");
    }

    if (!response.ok) throw new Error("Identity service landlord lookup failed.");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Identity service landlord response is invalid.");
    }

    if (typeof payload !== "object" || payload === null || !("data" in payload)) {
      throw new Error("Identity service landlord response is invalid.");
    }
    const ids = (payload as { readonly data: unknown }).data;
    if (!Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
      throw new Error("Identity service landlord response is invalid.");
    }
    return Object.freeze([...ids] as number[]);
  };

  const loadProfilesByIds = async (userIds: readonly number[]): Promise<readonly IdentityUserProfile[]> => {
    if (userIds.length === 0) return Object.freeze([]);
    let response: Response;
    try {
      const query = new URLSearchParams({ ids: [...userIds].join(",") });
      response = await fetcher(`${baseUrl}/internal/v1/profiles?${query.toString()}`, {
        method: "GET",
        headers: { "x-rentmate-internal-token": options.internalToken }
      });
    } catch {
      throw new Error("Identity service profile lookup failed.");
    }

    if (!response.ok) throw new Error("Identity service profile lookup failed.");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Identity service profile response is invalid.");
    }

    if (typeof payload !== "object" || payload === null || !("data" in payload)) {
      throw new Error("Identity service profile response is invalid.");
    }
    const profiles = (payload as { readonly data: unknown }).data;
    if (!Array.isArray(profiles) || profiles.some((profile) => !isUserProfile(profile))) {
      throw new Error("Identity service profile response is invalid.");
    }
    return Object.freeze([...profiles]);
  };

  const loadRoommateTenantProjectionsByIds = async (
    userIds: readonly number[]
  ): Promise<readonly IdentityRoommateTenantProjection[]> => {
    if (userIds.length === 0) return Object.freeze([]);
    let response: Response;
    try {
      const query = new URLSearchParams({ ids: [...userIds].join(",") });
      response = await fetcher(`${baseUrl}/internal/v1/roommate-tenant-projections?${query.toString()}`, {
        method: "GET",
        headers: { "x-rentmate-internal-token": options.internalToken }
      });
    } catch {
      throw new Error("Identity service roommate tenant lookup failed.");
    }

    if (!response.ok) throw new Error("Identity service roommate tenant lookup failed.");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Identity service roommate tenant response is invalid.");
    }

    if (typeof payload !== "object" || payload === null || !("data" in payload)) {
      throw new Error("Identity service roommate tenant response is invalid.");
    }
    const projections = (payload as { readonly data: unknown }).data;
    if (!Array.isArray(projections) || projections.some((projection) => !isRoommateTenantProjection(projection))) {
      throw new Error("Identity service roommate tenant response is invalid.");
    }
    return Object.freeze(
      projections.map((projection) =>
        Object.freeze({
          tenantId: projection.tenantId,
          role: projection.role,
          displayName: projection.displayName,
          isActive: projection.isActive,
          memberSince: projection.memberSince,
          emailVerified: projection.emailVerified,
          phoneVerified: projection.phoneVerified
        })
      )
    );
  };

  const loadRoommateRiskProjectionsByIds = async (
    userIds: readonly number[]
  ): Promise<readonly IdentityRoommateRiskProjection[]> => {
    if (userIds.length === 0) return Object.freeze([]);
    let response: Response;
    try {
      const query = new URLSearchParams({ ids: [...userIds].join(",") });
      response = await fetcher(`${baseUrl}/internal/v1/roommate-risk-projections?${query.toString()}`, {
        method: "GET",
        headers: { "x-rentmate-internal-token": options.internalToken }
      });
    } catch {
      throw new Error("Identity service roommate risk lookup failed.");
    }

    if (!response.ok) throw new Error("Identity service roommate risk lookup failed.");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Identity service roommate risk response is invalid.");
    }

    if (typeof payload !== "object" || payload === null || !("data" in payload)) {
      throw new Error("Identity service roommate risk response is invalid.");
    }
    const projections = (payload as { readonly data: unknown }).data;
    if (!Array.isArray(projections) || projections.some((projection) => !isRoommateRiskProjection(projection))) {
      throw new Error("Identity service roommate risk response is invalid.");
    }
    return Object.freeze(
      projections.map((projection) => Object.freeze({ tenantId: projection.tenantId, createdAt: projection.createdAt }))
    );
  };

  const loadVerifiedLandlordIds = async (userIds: readonly number[]): Promise<readonly number[]> => {
    if (userIds.length === 0) return Object.freeze([]);
    let response: Response;
    try {
      const query = new URLSearchParams({ ids: [...userIds].join(",") });
      response = await fetcher(`${baseUrl}/internal/v1/landlords/verified-ids?${query.toString()}`, {
        method: "GET",
        headers: { "x-rentmate-internal-token": options.internalToken }
      });
    } catch {
      throw new Error("Identity service verification lookup failed.");
    }

    if (!response.ok) throw new Error("Identity service verification lookup failed.");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Identity service verification response is invalid.");
    }

    if (typeof payload !== "object" || payload === null || !("data" in payload)) {
      throw new Error("Identity service verification response is invalid.");
    }
    const ids = (payload as { readonly data: unknown }).data;
    if (!Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
      throw new Error("Identity service verification response is invalid.");
    }
    return Object.freeze([...ids] as number[]);
  };

  return Object.freeze({
    loadAuthenticationAccount,
    loadActiveLandlordIds,
    loadProfilesByIds,
    loadRoommateTenantProjectionsByIds,
    loadRoommateRiskProjectionsByIds,
    loadVerifiedLandlordIds
  });
}
