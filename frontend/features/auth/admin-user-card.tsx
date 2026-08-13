import { AccountStatusBadge } from "../../components/ui/status-badge";
import type { UserProfile } from "../../types/api";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });
const roleLabels = { TENANT: "Người thuê", LANDLORD: "Người cho thuê", ADMIN: "Quản trị viên" } as const;

export interface AdminUserCardProps {
  readonly user: UserProfile;
  readonly onActivationRequest: (user: UserProfile) => void;
  readonly actionDisabled?: boolean;
}

export function AdminUserCard({ user, onActivationRequest, actionDisabled = false }: AdminUserCardProps) {
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="break-all text-lg font-semibold text-slate-950">{user.email}</h2>
            <AccountStatusBadge isActive={user.isActive} />
          </div>
          <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-900">Vai trò</dt>
              <dd>{roleLabels[user.role]}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Điện thoại</dt>
              <dd>{user.phone ?? "Chưa có số điện thoại"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Tạo lúc</dt>
              <dd>{dateFormatter.format(new Date(user.createdAt))}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Cập nhật</dt>
              <dd>{dateFormatter.format(new Date(user.updatedAt))}</dd>
            </div>
          </dl>
        </div>
        {user.role === "ADMIN" ? (
          <p className="max-w-xs text-sm text-slate-600">Không thể thay đổi trạng thái tài khoản quản trị.</p>
        ) : (
          <button
            type="button"
            disabled={actionDisabled}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => onActivationRequest(user)}
          >
            {user.isActive ? "Ngừng hoạt động" : "Kích hoạt lại"}
          </button>
        )}
      </div>
    </article>
  );
}
