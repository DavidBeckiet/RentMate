"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPage, AdminSection, AdminSummaryCard, AdminSummaryGrid } from "../../components/ui/admin-workspace";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { SelectField } from "../../components/ui/form-controls";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, UserProfile, UserRole } from "../../types/api";
import { AdminUserCard } from "./admin-user-card";
import {
  adminUserRoles,
  adminUsersUrl,
  parseAdminUserQuery,
  toAdminUserQuery,
  withAdminUserFilters,
  withAdminUserPage
} from "./admin-user-query";

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
  const replace = router.replace;
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const { status: authStatus, user: currentUser, error: authError, refresh } = useAuth();
  const parsed = useMemo(() => parseAdminUserQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const [mounted, setMounted] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [reloadVersion, setReloadVersion] = useState(0);
  const [candidate, setCandidate] = useState<UserProfile | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const requestId = useRef(0);
  const mutationInFlight = useRef(false);
  const adminReady = authStatus === "authenticated" && currentUser?.role === "ADMIN";
  const queryIdentity = parsed.ok ? JSON.stringify(parsed.state) : "invalid";

  const requestReload = useCallback(() => setReloadVersion((value) => value + 1), []);

  useEffect(() => setMounted(true), []);

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
        setRecoveryRequired(false);
        setMutationMessage(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || currentRequest !== requestId.current) return;
        const apiError = error instanceof ApiError ? error : null;
        setLoadState({ status: "error", error: apiError });
        if (apiError?.status === 401) void refresh();
      });
    return () => controller.abort();
  }, [adminReady, parsed, queryIdentity, refresh, reloadVersion, replace]);

  const confirmActivation = async () => {
    if (!candidate || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setMutationPending(true);
    setMutationMessage(null);
    try {
      await api.admin.setActivation(candidate.id, { isActive: !candidate.isActive });
      setCandidate(null);
      setMutationMessage(
        candidate.isActive
          ? "Đã ngừng hoạt động tài khoản. Danh sách đang được tải lại."
          : "Đã kích hoạt lại tài khoản. Danh sách đang được tải lại."
      );
      requestReload();
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      if (apiError?.code === "NETWORK_ERROR") {
        setRecoveryRequired(true);
        setMutationMessage(
          "Không xác định được yêu cầu đã được áp dụng hay chưa. Hãy tải lại danh sách trước khi thao tác tiếp."
        );
      } else {
        setMutationMessage(
          apiError?.status === 403
            ? "Bạn không được phép thay đổi tài khoản này."
            : apiError?.status === 404
              ? "Không tìm thấy tài khoản cần thay đổi."
              : "Không thể thay đổi trạng thái tài khoản."
        );
      }
    } finally {
      mutationInFlight.current = false;
      setMutationPending(false);
    }
  };

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous")
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên để tiếp tục."
        action={
          <Link href="/admin/login" className="font-semibold text-teal-800 underline">
            Đăng nhập quản trị
          </Link>
        }
      />
    );
  if (authStatus === "error")
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  if (!currentUser || currentUser.role !== "ADMIN") return <ErrorState message="Trang này dành cho quản trị viên." />;
  if (!parsed.ok) return <ErrorState message={parsed.message} />;
  if (!mounted) return <LoadingState message="Đang kiểm tra tài khoản…" />;

  const updateFilters = (role: UserRole | undefined, isActive: boolean | undefined) =>
    router.push(adminUsersUrl(withAdminUserFilters(parsed.state, { role, isActive })));
  const selectedRole = parsed.state.role ?? "";
  const selectedActivity = parsed.state.isActive === undefined ? "" : String(parsed.state.isActive);
  const visibleUsers = loadState.status === "success" ? loadState.result.data : [];
  const activeUsers = visibleUsers.filter((listedUser) => listedUser.isActive).length;
  const landlordUsers = visibleUsers.filter((listedUser) => listedUser.role === "LANDLORD").length;

  return (
    <AdminPage labelledBy="admin-users-heading">
      <header className="rm-admin-hero">
        <p className="text-sm font-semibold text-teal-700">QUẢN TRỊ</p>
        <h1 id="admin-users-heading" className="rm-admin-title mt-2 text-3xl sm:text-4xl">
          Quản lý người dùng
        </h1>
        <p className="mt-3 max-w-2xl text-rent-secondary">Lọc tài khoản theo vai trò và trạng thái hoạt động.</p>
      </header>
      <div className="rm-admin-toolbar">
        <div className="rm-admin-toolbar-controls">
          <SelectField
            id="admin-user-role"
            name="role"
            label="Vai trò"
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
          </SelectField>
          <SelectField
            id="admin-user-active"
            name="isActive"
            label="Trạng thái tài khoản"
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
          </SelectField>
        </div>
      </div>

      {loadState.status === "success" ? (
        <AdminSummaryGrid>
          <AdminSummaryCard
            label="Tài khoản trong trang"
            value={visibleUsers.length}
            note={`Trang ${loadState.result.pagination.page} · không phải tổng hệ thống`}
            icon="users"
          />
          <AdminSummaryCard
            label="Đang hoạt động"
            value={activeUsers}
            note="Trạng thái hiện tại"
            tone={activeUsers > 0 ? "success" : "muted"}
            icon="check"
          />
          <AdminSummaryCard label="Chủ trọ" value={landlordUsers} note="Trong dữ liệu đang hiển thị" icon="building" />
          <AdminSummaryCard
            label="Tài khoản cần xem"
            value={visibleUsers.filter((listedUser) => !listedUser.isActive).length}
            note="Đang ngừng hoạt động"
            tone={visibleUsers.some((listedUser) => !listedUser.isActive) ? "attention" : "muted"}
            icon="shield"
          />
        </AdminSummaryGrid>
      ) : null}

      {mutationMessage ? (
        <div
          role="status"
          className={`rounded-control border p-4 text-sm ${recoveryRequired ? "border-amber-300 bg-amber-50 text-amber-950" : "border-teal-200 bg-teal-50 text-teal-950"}`}
        >
          <p>{mutationMessage}</p>
          {recoveryRequired ? (
            <Button className="mt-3" onClick={requestReload}>
              Tải lại danh sách
            </Button>
          ) : null}
        </div>
      ) : null}
      {candidate ? (
        <section aria-label="Xác nhận thay đổi trạng thái tài khoản" className="rm-admin-decision-panel">
          <h2 className="font-semibold">Xác nhận thay đổi</h2>
          <p className="mt-2 text-sm">
            {candidate.role === "LANDLORD" && candidate.isActive
              ? "Ngừng hoạt động người cho thuê sẽ làm các tin đã duyệt của họ biến mất khỏi kết quả công khai, nhưng không đổi trạng thái của các tin đó."
              : `${candidate.isActive ? "Ngừng hoạt động" : "Kích hoạt lại"} tài khoản ${candidate.email}?`}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant={candidate.isActive ? "danger" : "primary"}
              pending={mutationPending}
              onClick={() => void confirmActivation()}
            >
              Xác nhận
            </Button>
            <Button variant="secondary" disabled={mutationPending} onClick={() => setCandidate(null)}>
              Hủy
            </Button>
          </div>
        </section>
      ) : null}

      {loadState.status === "idle" || loadState.status === "loading" ? (
        <LoadingState message="Đang tải danh sách người dùng…" />
      ) : null}
      {loadState.status === "error" ? (
        <ErrorState
          message={
            loadState.error?.status === 401
              ? "Phiên đăng nhập không còn hợp lệ."
              : "Không thể tải danh sách người dùng."
          }
          requestId={loadState.error?.requestId}
          action={<Button onClick={requestReload}>Thử lại</Button>}
        />
      ) : null}
      {loadState.status === "success" && loadState.result.data.length === 0 ? (
        <EmptyState title="Không có người dùng phù hợp" description="Hãy thay đổi bộ lọc hoặc quay lại sau." />
      ) : null}
      {loadState.status === "success" && loadState.result.data.length > 0 ? (
        <AdminSection
          title="Tài khoản trong trang"
          description="Chỉ hiển thị các trường cần thiết cho quản trị; hành động thay đổi trạng thái luôn cần xác nhận."
        >
          <div className="divide-y divide-border">
            {loadState.result.data.map((listedUser) => (
              <AdminUserCard
                key={listedUser.id}
                user={listedUser}
                actionDisabled={mutationPending || recoveryRequired}
                onActivationRequest={(next) => {
                  setMutationMessage(null);
                  setCandidate(next);
                }}
              />
            ))}
          </div>
        </AdminSection>
      ) : null}
      {loadState.status === "success" ? (
        <Pagination
          ariaLabel="Phân trang người dùng"
          page={loadState.result.pagination.page}
          hasNextPage={loadState.result.pagination.hasNextPage}
          onPrevious={() =>
            router.push(adminUsersUrl(withAdminUserPage(parsed.state, loadState.result.pagination.page - 1)))
          }
          onNext={() =>
            router.push(adminUsersUrl(withAdminUserPage(parsed.state, loadState.result.pagination.page + 1)))
          }
        />
      ) : null}
    </AdminPage>
  );
}
