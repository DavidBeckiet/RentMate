"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { api } from "../../lib/api/client";
import { formatAreaLabel } from "../../lib/area";
import { useAuth } from "../../lib/auth/auth-provider";
import type {
  RoommateProfile,
  RoommateReportCategory,
  RoommateReportTargetType,
  RoommateRequest
} from "../../types/api";
import {
  formatRoommateDate,
  formatRoommateMoney,
  roommateCleanlinessLabels,
  roommateErrorMessage,
  roommateNoiseLabels,
  roommatePetLabels,
  roommateReportCategoryLabels,
  roommateRequestStatusLabels,
  roommateSafetyCopy,
  roommateSleepScheduleLabels,
  roommateSmokingLabels
} from "./roommate-content";
import { RoommateVerificationBadges } from "./roommate-v2";

export { RoommateWorkspaceNav as RoommateSubnav } from "./roommate-workspace";

export function RoommateTenantBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const { status, user, error, refresh } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || status === "loading") {
    return <LoadingState message="Đang kiểm tra quyền truy cập ở ghép…" className="rm-roommate-card-static" />;
  }
  if (status === "anonymous") {
    return (
      <EmptyState
        title="Đăng nhập để dùng tính năng ở ghép"
        description="Bạn cần đăng nhập bằng tài khoản người thuê để tạo hồ sơ, tìm người ở ghép và quản lý cuộc trò chuyện."
        action={
          <Link className="font-bold underline decoration-2 underline-offset-4" href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={error?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  if (user?.role !== "TENANT" || !user.isActive) {
    return <ErrorState message="Tính năng ở ghép dành cho tài khoản người thuê đang hoạt động." />;
  }
  return <>{children}</>;
}

export function RoommatePageHeader({
  eyebrow = "Ở GHÉP",
  title,
  description,
  action
}: Readonly<{
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}>) {
  return (
    <header className="rm-roommate-hero">
      <div className="rm-roommate-hero-content">
        <p className="rm-roommate-eyebrow">
          <Icon name="users" className="h-4 w-4" /> {eyebrow}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <h1 className="rm-roommate-hero-title">{title}</h1>
            <p className="rm-roommate-hero-description">{description}</p>
          </div>
          {action ? <div className="w-full sm:w-auto sm:shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{action}</div> : null}
        </div>
      </div>
    </header>
  );
}

export function RoommateSafetyNotice({
  kind,
  className = ""
}: Readonly<{ kind: "long" | "short" | "checklist"; className?: string }>) {
  const checklistHeadingId = useId();

  if (kind === "checklist") {
    return (
      <section className={`rm-roommate-callout ${className}`} aria-labelledby={checklistHeadingId}>
        <h2
          id={checklistHeadingId}
          className="flex items-center gap-2 font-display text-ui-base font-bold text-foreground"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-subtle text-primary-hover">
            <Icon name="shield" className="h-4 w-4" />
          </span>
          Checklist an toàn
        </h2>
        <ul className="mt-4 grid gap-2 text-ui-sm leading-6 text-muted-foreground sm:grid-cols-2">
          {roommateSafetyCopy.checklist.map((item) => (
            <li key={item} className="flex gap-2 rounded-control bg-surface/70 px-3 py-2">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const copy = kind === "long" ? roommateSafetyCopy.long : roommateSafetyCopy.short;
  return (
    <aside
      aria-label={kind === "long" ? "Lưu ý an toàn về ở ghép" : "Nhắc nhở an toàn về ở ghép"}
      className={`rm-roommate-safety ${className}`}
    >
      <span className="flex gap-3 text-ui-sm font-semibold leading-6 text-foreground">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-warning/15 text-warning-foreground">
          <Icon name="shield" className="h-4 w-4" />
        </span>
        <span>{copy}</span>
      </span>
    </aside>
  );
}

function roommateInitials(displayName: string | null): string {
  const parts = (displayName ?? "RentMate").trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "RM";
  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toUpperCase();
}

export function RoommateAvatar({
  displayName,
  size = "md"
}: Readonly<{ displayName: string | null; size?: "sm" | "md" | "lg" }>) {
  return (
    <span className="rm-roommate-avatar" data-size={size === "md" ? undefined : size} aria-hidden="true">
      {roommateInitials(displayName)}
    </span>
  );
}

export function RoommateStatusPill({ status, label }: Readonly<{ status: string; label: string }>) {
  return (
    <span className="rm-roommate-status" data-status={status}>
      {label}
    </span>
  );
}

export function RoommateProfileSummary({
  profile,
  heading = "Hồ sơ ở ghép",
  showDisplayName = true,
  showAvatar = true,
  compact = false
}: Readonly<{
  profile: RoommateProfile | null;
  heading?: string;
  showDisplayName?: boolean;
  showAvatar?: boolean;
  compact?: boolean;
}>) {
  if (!profile) {
    return (
      <Card subtle className="rm-roommate-card-static text-ui-sm text-muted-foreground">
        Chưa có hồ sơ ở ghép công khai trong ngữ cảnh này.
      </Card>
    );
  }

  const preferences = [
    ["Nhịp sinh hoạt", roommateSleepScheduleLabels[profile.sleepSchedule]],
    ["Mức độ gọn gàng", roommateCleanlinessLabels[profile.cleanlinessLevel]],
    ["Không gian", roommateNoiseLabels[profile.noisePreference]],
    ["Thuốc lá", roommateSmokingLabels[profile.smokingEnvironment]],
    ["Thú cưng", roommatePetLabels[profile.petEnvironment]]
  ] as const;

  return (
    <Card className={`rm-roommate-card-static ${compact ? "space-y-3" : "space-y-4"}`}>
      <div className="flex items-start gap-3">
        {showAvatar ? <RoommateAvatar displayName={profile.displayName} /> : null}
        <div className="min-w-0">
          <h2 className="font-display text-heading-sm font-bold text-foreground">{heading}</h2>
          {showDisplayName ? (
            <p className="mt-1 truncate text-ui-base font-bold text-foreground">
              {profile.displayName ?? "Thành viên RentMate"}
            </p>
          ) : null}
        </div>
      </div>
      <RoommateVerificationBadges profile={profile} />
      <p className="whitespace-pre-wrap text-ui-sm leading-6 text-muted-foreground">{profile.intro}</p>
      <dl className="rm-roommate-facts">
        {preferences.map(([label, value]) => (
          <div key={label} className="rm-roommate-fact">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {profile.profileCompleted ? (
        <p className="inline-flex items-center gap-2 text-ui-xs font-bold text-success-foreground">
          <Icon name="check" className="h-4 w-4" /> Hồ sơ ở ghép đã hoàn thành
        </p>
      ) : null}
    </Card>
  );
}

export function RoommateListingContext({ request }: Readonly<{ request: RoommateRequest }>) {
  if (request.listingMode === "UNLINKED") {
    return (
      <Card subtle className="rm-roommate-card-static">
        <h2 className="font-display text-ui-base font-bold text-foreground">Chưa chọn phòng cụ thể</h2>
        <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
          Yêu cầu này tìm người để cùng tiếp tục tìm phòng phù hợp trên RentMate.
        </p>
      </Card>
    );
  }

  if (!request.listing || request.signals.listingCurrentlyAvailable === false) {
    return (
      <Card className="rm-roommate-card-static" data-tone="danger">
        <div className="rm-roommate-callout" data-tone="danger">
          <h2 className="font-display text-ui-base font-bold text-foreground">Phòng không còn khả dụng</h2>
          <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
            {request.status === "MATCHED"
              ? "Phòng này chỉ còn là thông tin tham khảo; kết nối ở ghép không tự làm thay đổi tin đăng."
              : "Không thể xác nhận phòng này cho tương tác mới. Nếu đây là yêu cầu của bạn, hãy gỡ liên kết hoặc hủy yêu cầu."}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rm-roommate-card-static space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rm-roommate-section-label">Phòng đang cân nhắc</p>
          <h2 className="mt-1 font-display text-ui-base font-bold text-foreground">{request.listing.title}</h2>
          <p className="mt-1 text-ui-sm text-muted-foreground">{formatAreaLabel(request.listing.areaName)}</p>
        </div>
        <Link
          href={`/listings/${request.listing.id}`}
          className="min-h-11 inline-flex items-center text-ui-sm font-bold text-primary-hover underline decoration-2 underline-offset-4"
        >
          Xem tin đăng
        </Link>
      </div>
      <p className="text-ui-sm font-bold text-foreground">
        {formatRoommateMoney(request.listing.monthlyRent)} / tháng · tối đa {request.listing.maxOccupants ?? "—"} người
      </p>
      <p className="rm-roommate-callout text-ui-sm leading-6 text-muted-foreground">
        {roommateSafetyCopy.linkedMeaning}
      </p>
    </Card>
  );
}

export function RoommateRequestFacts({
  request,
  showBudget = true,
  showAreas = true,
  showStatus = true
}: Readonly<{ request: RoommateRequest; showBudget?: boolean; showAreas?: boolean; showStatus?: boolean }>) {
  return (
    <dl className="rm-roommate-facts text-ui-sm">
      {showBudget ? (
        <div className="rm-roommate-fact">
          <dt>Ngân sách mỗi người</dt>
          <dd>
            {formatRoommateMoney(request.budgetMinPerPerson)} – {formatRoommateMoney(request.budgetMaxPerPerson)}
          </dd>
        </div>
      ) : null}
      <div className="rm-roommate-fact">
        <dt>Thời gian chuyển vào</dt>
        <dd>
          {formatRoommateDate(request.moveInFrom)} – {formatRoommateDate(request.moveInUntil)}
        </dd>
      </div>
      {showAreas ? (
        <div className="rm-roommate-fact">
          <dt>Khu vực quan tâm</dt>
          <dd>
            {request.preferredAreaKeys.length
              ? request.preferredAreaKeys.map(formatAreaLabel).join(" · ")
              : "Theo phòng đã chọn"}
          </dd>
        </div>
      ) : null}
      {showStatus ? (
        <div className="rm-roommate-fact">
          <dt>Trạng thái</dt>
          <dd>
            <RoommateStatusPill status={request.status} label={roommateRequestStatusLabels[request.status]} />
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

export function RoommateReportControl({
  target,
  requestId,
  interestId,
  messageId,
  label = "Báo cáo",
  hasReported = false,
  open: controlledOpen,
  onOpenChange,
  onSubmitted,
  dialogTitle,
  dialogDescription,
  className
}: Readonly<{
  target: RoommateReportTargetType;
  requestId?: number;
  interestId?: number;
  messageId?: number;
  label?: string;
  hasReported?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSubmitted?: () => void;
  dialogTitle?: string;
  dialogDescription?: string;
  className?: string;
}>) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [category, setCategory] = useState<RoommateReportCategory>("OTHER");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = controlledOpen ?? internalOpen;
  const reportAcknowledged = hasReported || submitted;

  const setDialogOpen = (nextOpen: boolean) => {
    setCategory("OTHER");
    setDetails("");
    setError(null);
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      if (target === "ROOMMATE_MESSAGE" && messageId) {
        await api.roommates.reportMessage(messageId, { category, details: details.trim() || null });
      } else if (target === "ROOMMATE_PROFILE" && interestId) {
        await api.roommates.reportInterest(interestId, { category, details: details.trim() || null });
      } else if (requestId && (target === "ROOMMATE_PROFILE" || target === "ROOMMATE_REQUEST")) {
        await api.roommates.reportRequest(requestId, { targetType: target, category, details: details.trim() || null });
      } else {
        throw new Error("Roommate report context is missing.");
      }
      setSubmitted(true);
      onSubmitted?.();
      setDialogOpen(false);
    } catch (caught) {
      setError(roommateErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  if (reportAcknowledged) {
    return (
      <p role="status" className="text-ui-xs font-bold text-heroDark-950">
        {target === "ROOMMATE_MESSAGE" ? "Báo cáo đã được gửi tới đội ngũ an toàn." : "✓ Đã gửi báo cáo"}
      </p>
    );
  }
  if (!open) {
    return (
      <Button variant="outline" size="sm" className={className} onClick={() => setDialogOpen(true)}>
        <Icon name="flag" className="h-4 w-4" /> {label}
      </Button>
    );
  }
  const fallbackTitle =
    target === "ROOMMATE_PROFILE"
      ? "Báo cáo hồ sơ ở ghép"
      : target === "ROOMMATE_REQUEST"
        ? "Báo cáo yêu cầu ở ghép"
        : "Báo cáo nội dung ở ghép";
  const fallbackDescription =
    target === "ROOMMATE_PROFILE"
      ? "Gửi thông tin về hồ sơ này tới RentMate để xem xét. Báo cáo không tự động chặn người này."
      : target === "ROOMMATE_REQUEST"
        ? "Gửi thông tin về yêu cầu này tới RentMate để xem xét. Báo cáo không tự động chặn người đăng."
        : "Báo cáo được gửi tới đội ngũ an toàn để xem xét. Báo cáo không tự động chặn người này.";
  return (
    <Dialog
      open={open}
      title={dialogTitle ?? fallbackTitle}
      description={dialogDescription ?? fallbackDescription}
      onClose={() => setDialogOpen(false)}
      className="max-w-xl"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="rm-roommate-callout" data-tone="warning">
          <p className="text-ui-sm leading-6 text-foreground">
            Chọn lý do phù hợp và thêm bối cảnh nếu cần. Bạn có thể sử dụng thao tác Chặn riêng, không gắn với báo cáo.
          </p>
        </div>
        <label
          className="block text-ui-sm font-semibold text-foreground"
          htmlFor={`roommate-report-category-${target}-${requestId ?? interestId ?? messageId}`}
        >
          Lý do
        </label>
        <select
          id={`roommate-report-category-${target}-${requestId ?? interestId ?? messageId}`}
          value={category}
          onChange={(event) => setCategory(event.target.value as RoommateReportCategory)}
          className="min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 py-2.5 text-ui-sm font-medium text-foreground outline-none transition-[border-color,box-shadow] duration-fast focus:border-primary focus:ring-[3px] focus:ring-primary/20"
        >
          {Object.entries(roommateReportCategoryLabels).map(([value, itemLabel]) => (
            <option key={value} value={value}>
              {itemLabel}
            </option>
          ))}
        </select>
        <label
          className="block text-ui-sm font-semibold text-foreground"
          htmlFor={`roommate-report-details-${target}-${requestId ?? interestId ?? messageId}`}
        >
          Chi tiết <span className="font-medium text-muted-foreground">(không bắt buộc)</span>
        </label>
        <textarea
          id={`roommate-report-details-${target}-${requestId ?? interestId ?? messageId}`}
          value={details}
          maxLength={2000}
          rows={5}
          onChange={(event) => setDetails(event.target.value)}
          className="min-h-28 w-full resize-y rounded-control border border-border-strong bg-surface p-4 text-ui-sm text-foreground outline-none transition-[border-color,box-shadow] duration-fast focus:border-primary focus:ring-[3px] focus:ring-primary/20"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-ui-xs font-medium text-muted-foreground">
            Không chia sẻ thông tin riêng tư không cần thiết.
          </p>
          <p className="text-ui-xs font-semibold text-muted-foreground">{Array.from(details).length}/2000</p>
        </div>
        {error ? (
          <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3 pt-1">
          <Button type="submit" pending={pending} pendingLabel="Đang gửi…">
            Gửi báo cáo
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => setDialogOpen(false)}>
            Hủy
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function RoommateBlockControl({
  context,
  id,
  onBlocked,
  buttonVariant = "outline",
  className
}: Readonly<{
  context: "request" | "interest";
  id: number;
  onBlocked?: () => void;
  buttonVariant?: "outline" | "danger";
  className?: string;
}>) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const block = async () => {
    setPending(true);
    setError(null);
    try {
      if (context === "request") await api.roommates.blockRequest(id);
      else await api.roommates.blockInterest(id);
      setBlocked(true);
      setConfirming(false);
      onBlocked?.();
    } catch (caught) {
      setError(roommateErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  if (blocked)
    return (
      <p role="status" className="text-ui-xs font-bold">
        Bạn đã chặn tương tác này.
      </p>
    );
  if (!confirming) {
    return (
      <Button variant={buttonVariant} size="sm" className={className} onClick={() => setConfirming(true)}>
        <Icon name="lock" className="h-4 w-4" /> Chặn
      </Button>
    );
  }
  return (
    <Dialog
      open={confirming}
      title={context === "request" ? "Chặn người dùng này?" : "Xác nhận chặn tương tác"}
      description={
        context === "request"
          ? "Hai bên sẽ không thể tiếp tục tương tác qua flow hiện tại. Bạn có thể bỏ chặn sau tại trang Đã chặn."
          : "Bạn có thể bỏ chặn sau này, nhưng thao tác đó không khôi phục nội dung hoặc kết nối cũ."
      }
      onClose={() => setConfirming(false)}
      className="max-w-lg"
    >
      <div className="space-y-4">
        <div className="rm-roommate-callout" data-tone="danger">
          <p className="text-ui-sm font-semibold leading-6 text-foreground">
            {context === "request"
              ? "Sau khi chặn, người này sẽ bị ẩn khỏi các kết quả khám phá phù hợp. Thao tác Chặn không tự động gửi báo cáo; nếu cần, bạn có thể dùng một thao tác Báo cáo riêng trên trang này."
              : "Sau khi chặn, hai bên sẽ không thể tiếp tục một số tương tác theo quy định hiện tại của RentMate. Lời quan tâm hoặc kết nối cũ không được khôi phục khi bỏ chặn."}
          </p>
        </div>
        {error ? (
          <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button autoFocus variant="danger" pending={pending} pendingLabel="Đang chặn…" onClick={() => void block()}>
            Xác nhận chặn
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
            Hủy
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
