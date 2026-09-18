"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, UserProfile, UserRole } from "../../types/api";
import { AdminUserCard } from "./admin-user-card";
import {
  adminUserDetailUrl,
  adminUserRoles,
  adminUsersUrl,
  parseAdminUserQuery,
  toAdminUserQuery,
  withAdminUserFilters,
  withAdminUserPage,
  withAdminUserSearch
} from "./admin-user-query";
import styles from "./admin-users.module.css";

const roleLabels: Record<UserRole, string> = {
  TENANT: "Người thuê",
  LANDLORD: "Người cho thuê",
  ADMIN: "Quản trị viên"
};

type LoadState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "success"; readonly result: ApiPage<UserProfile> }
  | { readonly status: "error"; readonly error: ApiError | null };

export function AdminUsersPage() {
  const router = useRouter();
  const push = router.push;
  const replace = router.replace;
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const { status: authStatus, user: currentUser, error: authError, refresh } = useAuth();
  const parsed = useMemo(() => parseAdminUserQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const [mounted, setMounted] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestId = useRef(0);
  const adminReady = authStatus === "authenticated" && currentUser?.role === "ADMIN";

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (parsed.ok) setSearchValue(parsed.state.q ?? "");
  }, [rawQuery, parsed]);

  useEffect(() => {
    if (!mounted || !parsed.ok) return;
    let nextState;
    try {
      nextState = withAdminUserSearch(parsed.state, searchValue);
      setSearchError(null);
    } catch {
      setSearchError("Từ khóa tìm kiếm không hợp lệ hoặc dài quá 320 ký tự.");
      return;
    }
    if ((nextState.q ?? "") === (parsed.state.q ?? "")) return;
    const timer = window.setTimeout(() => replace(adminUsersUrl(nextState)), 300);
    return () => window.clearTimeout(timer);
  }, [mounted, parsed, replace, searchValue]);

  useEffect(() => {
    if (!adminReady || !parsed.ok) return;
    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    setLoadState({ status: "loading" });
    void api.admin
      .listUsers(toAdminUserQuery(parsed.state), controller.signal)
      .then((result) => {
        if (controller.signal.aborted || currentRequest !== requestId.current) return;
        if (result.data.length === 0 && parsed.state.page > 1) {
          replace(adminUsersUrl(withAdminUserPage(parsed.state, parsed.state.page - 1)));
          return;
        }
        setLoadState({ status: "success", result });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || currentRequest !== requestId.current) return;
        const apiError = error instanceof ApiError ? error : null;
        setLoadState({ status: "error", error: apiError });
        if (apiError?.status === 401) void refresh();
      });
    return () => controller.abort();
  }, [adminReady, parsed, rawQuery, refresh, reloadVersion, replace]);

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous") {
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên để tiếp tục."
        action={
          <Link href="/admin/login" className="font-semibold text-primary-hover underline">
            Đăng nhập quản trị
          </Link>
        }
      />
    );
  }
  if (authStatus === "error") {
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  if (!currentUser || currentUser.role !== "ADMIN") return <ErrorState message="Trang này dành cho quản trị viên." />;
  if (!parsed.ok) return <ErrorState message={parsed.message} />;
  if (!mounted) return <LoadingState message="Đang mở danh bạ tài khoản…" />;

  const updateFilters = (role: UserRole | undefined, isActive: boolean | undefined) =>
    push(adminUsersUrl(withAdminUserFilters(parsed.state, { role, isActive })));
  const selectedRole = parsed.state.role ?? "";
  const selectedActivity = parsed.state.isActive === undefined ? "" : String(parsed.state.isActive);
  const hasDirectoryContext =
    parsed.state.q !== undefined || parsed.state.role !== undefined || parsed.state.isActive !== undefined;

  return (
    <section aria-labelledby="admin-users-heading" className={styles.page}>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>Quản trị tài khoản</p>
        <h1 id="admin-users-heading">Người dùng</h1>
        <p>Tìm đúng tài khoản, kiểm tra trạng thái và mở không gian xử lý riêng.</p>
      </header>

      <section aria-label="Tìm kiếm và lọc tài khoản" className={styles.controlBar}>
        <label className={styles.searchField} htmlFor="admin-user-search">
          <span>Tìm tài khoản</span>
          <span className={styles.searchControl}>
            <Icon name="search" className={styles.searchIcon} />
            <input
              id="admin-user-search"
              name="q"
              type="search"
              autoComplete="off"
              value={searchValue}
              aria-invalid={searchError ? true : undefined}
              aria-describedby={searchError ? "admin-user-search-error" : undefined}
              placeholder="Tên, email hoặc ID người dùng"
              onChange={(event) => setSearchValue(event.currentTarget.value)}
            />
          </span>
          {searchError ? (
            <span id="admin-user-search-error" role="alert" className={styles.fieldError}>
              {searchError}
            </span>
          ) : null}
        </label>

        <label className={styles.filterField} htmlFor="admin-user-role">
          <span>Vai trò</span>
          <select
            id="admin-user-role"
            name="role"
            value={selectedRole}
            onChange={(event) =>
              updateFilters((event.currentTarget.value || undefined) as UserRole | undefined, parsed.state.isActive)
            }
          >
            <option value="">Mọi vai trò</option>
            {adminUserRoles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterField} htmlFor="admin-user-active">
          <span>Trạng thái</span>
          <select
            id="admin-user-active"
            name="isActive"
            value={selectedActivity}
            onChange={(event) =>
              updateFilters(
                parsed.state.role,
                event.currentTarget.value === "" ? undefined : event.currentTarget.value === "true"
              )
            }
          >
            <option value="">Mọi trạng thái</option>
            <option value="true">Đang hoạt động</option>
            <option value="false">Ngừng hoạt động</option>
          </select>
        </label>

        {hasDirectoryContext ? (
          <Button variant="ghost" size="sm" className={styles.resetButton} onClick={() => push("/admin/users")}>
            Xóa bộ lọc
          </Button>
        ) : null}
      </section>

      {loadState.status === "idle" || loadState.status === "loading" ? (
        <LoadingState message="Đang tải danh bạ tài khoản…" className={styles.feedback} />
      ) : null}

      {loadState.status === "error" ? (
        <ErrorState
          title="Không thể tải danh bạ"
          message={
            loadState.error?.status === 401
              ? "Phiên đăng nhập không còn hợp lệ."
              : "Danh sách người dùng chưa thể tải lúc này."
          }
          requestId={loadState.error?.requestId}
          action={<Button onClick={() => setReloadVersion((value) => value + 1)}>Thử lại</Button>}
          className={styles.feedback}
        />
      ) : null}

      {loadState.status === "success" && loadState.result.data.length === 0 ? (
        hasDirectoryContext ? (
          <EmptyState
            title="Không tìm thấy tài khoản phù hợp"
            description="Thử từ khóa khác hoặc xóa các điều kiện lọc hiện tại."
            action={<Button onClick={() => push("/admin/users")}>Xóa tìm kiếm và bộ lọc</Button>}
            className={styles.feedback}
          />
        ) : (
          <EmptyState
            title="Chưa có tài khoản"
            description="Danh bạ sẽ hiển thị khi hệ thống có tài khoản người dùng."
            className={styles.feedback}
          />
        )
      ) : null}

      {loadState.status === "success" && loadState.result.data.length > 0 ? (
        <section aria-labelledby="directory-results-heading" className={styles.directory}>
          <header className={styles.directoryHeader}>
            <div>
              <p className={styles.resultKicker}>Kết quả hiện tại</p>
              <h2 id="directory-results-heading">Danh bạ tài khoản</h2>
            </div>
            <p aria-live="polite">
              Trang {loadState.result.pagination.page} · {loadState.result.data.length} tài khoản đang hiển thị
            </p>
          </header>
          <div className={styles.directoryList}>
            {loadState.result.data.map((listedUser) => (
              <AdminUserCard
                key={listedUser.id}
                user={listedUser}
                href={adminUserDetailUrl(listedUser.id, parsed.state)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {loadState.status === "success" ? (
        <Pagination
          ariaLabel="Phân trang người dùng"
          page={loadState.result.pagination.page}
          hasNextPage={loadState.result.pagination.hasNextPage}
          variant="moderation"
          onPrevious={() => push(adminUsersUrl(withAdminUserPage(parsed.state, loadState.result.pagination.page - 1)))}
          onNext={() => push(adminUsersUrl(withAdminUserPage(parsed.state, loadState.result.pagination.page + 1)))}
        />
      ) : null}
    </section>
  );
}
