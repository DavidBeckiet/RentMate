import type { AdminUserQuery, UserRole } from "../../types/api";

export const adminUserRoles = ["TENANT", "LANDLORD", "ADMIN"] as const;

export interface AdminUserQueryState {
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

export function parseAdminUserQuery(parameters: URLSearchParams): ParsedAdminUserQuery {
  try {
    const role = roleValue(scalar(parameters, "role"));
    const isActive = activityValue(scalar(parameters, "isActive"));
    const pageSize = positiveInteger(scalar(parameters, "pageSize"), 100);
    return {
      ok: true,
      state: {
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

export function withAdminUserFilters(
  state: AdminUserQueryState,
  filters: Pick<AdminUserQueryState, "role" | "isActive">
): AdminUserQueryState {
  return {
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
    ...(state.role === undefined ? {} : { role: state.role }),
    ...(state.isActive === undefined ? {} : { isActive: state.isActive }),
    page: state.page,
    ...(state.pageSize === undefined ? {} : { pageSize: state.pageSize })
  };
}
