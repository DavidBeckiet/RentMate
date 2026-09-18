import type { AdminUserQuery, UserRole } from "../../types/api";

export const adminUserRoles = ["TENANT", "LANDLORD", "ADMIN"] as const;

const maximumSearchLength = 320;
const controlCharacterPattern = /\p{Cc}/u;
const nonScalarPattern = /[\uD800-\uDFFF]/u;

export interface AdminUserQueryState {
  readonly q?: string;
  readonly role?: UserRole;
  readonly isActive?: boolean;
  readonly page: number;
  readonly pageSize?: number;
}

export type ParsedAdminUserQuery =
  | { readonly ok: true; readonly state: AdminUserQueryState }
  | { readonly ok: false; readonly message: string };

function scalar(parameters: URLSearchParams, key: string): string | undefined {
  const values = parameters.getAll(key);
  if (values.length > 1) throw new Error("duplicate");
  return values[0];
}

function positiveInteger(value: string | undefined, maximum?: number): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("invalid");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (maximum !== undefined && parsed > maximum)) throw new Error("invalid");
  return parsed;
}

function roleValue(value: string | undefined): UserRole | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toUpperCase();
  if (!adminUserRoles.includes(normalized as UserRole)) throw new Error("invalid");
  return normalized as UserRole;
}

function activityValue(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("invalid");
}

export function normalizeAdminUserSearch(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (nonScalarPattern.test(value)) throw new Error("invalid");
  const normalized = value.normalize("NFC").trim();
  if (!normalized) return undefined;
  if (controlCharacterPattern.test(normalized) || [...normalized].length > maximumSearchLength) {
    throw new Error("invalid");
  }
  return normalized;
}

export function parseAdminUserQuery(parameters: URLSearchParams): ParsedAdminUserQuery {
  try {
    const q = normalizeAdminUserSearch(scalar(parameters, "q"));
    const role = roleValue(scalar(parameters, "role"));
    const isActive = activityValue(scalar(parameters, "isActive"));
    const pageSize = positiveInteger(scalar(parameters, "pageSize"), 100);
    return {
      ok: true,
      state: {
        ...(q === undefined ? {} : { q }),
        ...(role === undefined ? {} : { role }),
        ...(isActive === undefined ? {} : { isActive }),
        page: positiveInteger(scalar(parameters, "page")) ?? 1,
        ...(pageSize === undefined ? {} : { pageSize })
      }
    };
  } catch {
    return { ok: false, message: "Liên kết quản lý người dùng không hợp lệ." };
  }
}

export function serializeAdminUserQuery(state: AdminUserQueryState): URLSearchParams {
  const parameters = new URLSearchParams();
  if (state.q !== undefined) parameters.set("q", state.q);
  if (state.role !== undefined) parameters.set("role", state.role);
  if (state.isActive !== undefined) parameters.set("isActive", String(state.isActive));
  if (state.page > 1) parameters.set("page", String(state.page));
  if (state.pageSize !== undefined) parameters.set("pageSize", String(state.pageSize));
  return parameters;
}

export function adminUsersUrl(state: AdminUserQueryState): string {
  const query = serializeAdminUserQuery(state).toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

export function adminUserDetailUrl(userId: number, state: AdminUserQueryState): string {
  const query = serializeAdminUserQuery(state).toString();
  return query ? `/admin/users/${userId}?${query}` : `/admin/users/${userId}`;
}

export function adminUserReturnUrl(parameters: URLSearchParams): string {
  const parsed = parseAdminUserQuery(parameters);
  return parsed.ok ? adminUsersUrl(parsed.state) : "/admin/users";
}

export function withAdminUserSearch(state: AdminUserQueryState, q: string | undefined): AdminUserQueryState {
  const normalized = normalizeAdminUserSearch(q);
  return {
    ...(normalized === undefined ? {} : { q: normalized }),
    ...(state.role === undefined ? {} : { role: state.role }),
    ...(state.isActive === undefined ? {} : { isActive: state.isActive }),
    page: 1,
    ...(state.pageSize === undefined ? {} : { pageSize: state.pageSize })
  };
}

export function withAdminUserFilters(
  state: AdminUserQueryState,
  filters: Pick<AdminUserQueryState, "role" | "isActive">
): AdminUserQueryState {
  return {
    ...(state.q === undefined ? {} : { q: state.q }),
    ...(filters.role === undefined ? {} : { role: filters.role }),
    ...(filters.isActive === undefined ? {} : { isActive: filters.isActive }),
    page: 1,
    ...(state.pageSize === undefined ? {} : { pageSize: state.pageSize })
  };
}

export function withAdminUserPage(state: AdminUserQueryState, page: number): AdminUserQueryState {
  return { ...state, page };
}

export function toAdminUserQuery(state: AdminUserQueryState): AdminUserQuery {
  return {
    ...(state.q === undefined ? {} : { q: state.q }),
    ...(state.role === undefined ? {} : { role: state.role }),
    ...(state.isActive === undefined ? {} : { isActive: state.isActive }),
    page: state.page,
    ...(state.pageSize === undefined ? {} : { pageSize: state.pageSize })
  };
}
