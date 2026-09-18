import Link from "next/link";
import { Badge, type BadgeVariant } from "../../components/ui/badge";
import { Icon } from "../../components/ui/icon";
import { AccountStatusBadge } from "../../components/ui/status-badge";
import type { UserProfile, UserRole } from "../../types/api";
import styles from "./admin-users.module.css";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" });
const rolePresentation: Record<UserRole, { readonly label: string; readonly variant: BadgeVariant }> = {
  TENANT: { label: "Người thuê", variant: "neutral" },
  LANDLORD: { label: "Người cho thuê", variant: "primary" },
  ADMIN: { label: "Quản trị viên", variant: "info" }
};

export interface AdminUserCardProps {
  readonly user: UserProfile;
  readonly href: string;
}

export function AdminUserCard({ user, href }: AdminUserCardProps) {
  const displayName = user.displayName ?? "Tài khoản chưa đặt tên";
  const role = rolePresentation[user.role];

  return (
    <article className={styles.directoryRow}>
      <Link href={href} className={styles.directoryLink} aria-label={`Xem tài khoản ${displayName}`}>
        <span className={styles.avatar} aria-hidden="true">
          {(user.displayName ?? user.email).slice(0, 1).toLocaleUpperCase("vi-VN")}
        </span>
        <span className={styles.identity}>
          <strong>{displayName}</strong>
          <span>{user.email}</span>
        </span>
        <span className={styles.rowMeta}>
          <span className={styles.badges}>
            <Badge variant={role.variant}>{role.label}</Badge>
            <AccountStatusBadge isActive={user.isActive} />
          </span>
          <span className={styles.userId}>ID #{user.id}</span>
        </span>
        <span className={styles.createdAt}>
          <span>Tạo ngày</span>
          <time dateTime={user.createdAt}>{dateFormatter.format(new Date(user.createdAt))}</time>
        </span>
        <span className={styles.openAction}>
          <span>Xem tài khoản</span>
          <Icon name="arrow" className={styles.openIcon} />
        </span>
      </Link>
    </article>
  );
}
