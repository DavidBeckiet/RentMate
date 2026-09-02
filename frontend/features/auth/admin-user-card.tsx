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
    <article className="rm-admin-queue-card rounded-none border-0 border-b border-border shadow-none last:border-b-0">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-subtle font-display text-sm font-bold text-primary-hover">
              {(user.displayName ?? user.email).slice(0, 1).toUpperCase()}
            </div>
            <h2 className="min-w-0 flex-1 truncate font-display text-base font-bold text-foreground">
              {user.displayName ?? "Tài khoản chưa đặt tên"}
            </h2>
            <AccountStatusBadge isActive={user.isActive} />
          </div>
          <dl className="grid min-w-0 gap-3 border-t border-border pt-3 text-ui-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0">
              <dt className="font-semibold text-foreground">Email</dt>
              <dd className="truncate">{user.email}</dd>
            </div>
            <div className="min-w-0">
              <dt className="font-semibold text-foreground">Vai trò</dt>
              <dd>{roleLabels[user.role]}</dd>
            </div>
            <div className="min-w-0">
              <dt className="font-semibold text-foreground">Điện thoại</dt>
              <dd className="truncate">{user.phone ?? "Chưa có số điện thoại"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="font-semibold text-foreground">Tạo lúc</dt>
              <dd>{dateFormatter.format(new Date(user.createdAt))}</dd>
            </div>
          </dl>
        </div>
        {user.role === "ADMIN" ? (
          <p className="max-w-xs text-ui-sm leading-6 text-muted-foreground">
            Không thể thay đổi trạng thái tài khoản quản trị.
          </p>
        ) : (
          <button
            type="button"
            disabled={actionDisabled}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-ui-sm font-semibold text-foreground shadow-surface transition-[background-color,border-color,box-shadow,transform] duration-fast hover:-translate-y-0.5 hover:border-primary hover:bg-primary-subtle hover:shadow-raised focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => onActivationRequest(user)}
          >
            {user.isActive ? "Ngừng hoạt động" : "Kích hoạt lại"}
          </button>
        )}
      </div>
    </article>
  );
}
