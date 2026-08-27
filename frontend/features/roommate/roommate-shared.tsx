"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { api } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type {
  RoommateProfile,
  RoommateReportCategory,
  RoommateReportTargetType,
  RoommateRequest
} from "../../types/api";
import {
  formatMemberSince,
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

export function RoommateTenantBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const { status, user, error, refresh } = useAuth();

  if (status === "loading") return <LoadingState message="Đang kiểm tra quyền truy cập ở ghép…" />;
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
    <header className="border-2 border-heroDark-950 bg-rent-accent p-5 shadow-glass sm:p-7">
      <p className="text-ui-xs font-bold uppercase tracking-[0.14em] text-heroDark-950">{eyebrow}</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="font-display text-3xl font-bold tracking-[-0.05em] text-heroDark-950 sm:text-4xl">{title}</h1>
          <p className="mt-3 text-ui-sm leading-6 text-rent-secondary">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}

export function RoommateSubnav() {
  const items = [
    { href: "/roommates", label: "Khám phá" },
    { href: "/roommates/my-request", label: "Yêu cầu của tôi" },
    { href: "/roommates/interests", label: "Lời quan tâm" },
    { href: "/roommates/connection", label: "Kết nối hiện tại" },
    { href: "/roommates/profile", label: "Hồ sơ ở ghép" }
  ] as const;

  return (
    <nav aria-label="Điều hướng ở ghép" className="flex gap-2 overflow-x-auto border-b-2 border-heroDark-950 pb-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="whitespace-nowrap border-2 border-heroDark-950 bg-rent-surface px-3 py-2 text-ui-xs font-bold text-heroDark-950 shadow-glass-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brandBlue-500/40"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function RoommateSafetyNotice({
  kind,
  className = ""
}: Readonly<{ kind: "long" | "short" | "checklist"; className?: string }>) {
  if (kind === "checklist") {
    return (
      <section
        className={`border-2 border-heroDark-950 bg-rent-surface p-4 shadow-glass-sm ${className}`}
        aria-labelledby="roommate-safety-checklist"
      >
        <h2 id="roommate-safety-checklist" className="flex items-center gap-2 font-display text-ui-base font-bold">
          <Icon name="shield" className="h-5 w-5" /> Checklist an toàn
        </h2>
        <ul className="mt-3 space-y-2 text-ui-sm leading-6 text-rent-secondary">
          {roommateSafetyCopy.checklist.map((item) => (
            <li key={item} className="flex gap-2">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-heroDark-950" />
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
      className={`border-2 border-heroDark-950 bg-rent-yellow p-4 text-ui-sm font-semibold leading-6 text-heroDark-950 shadow-glass-sm ${className}`}
    >
      <span className="flex gap-2">
        <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0" />
        <span>{copy}</span>
      </span>
    </aside>
  );
}

export function RoommateProfileSummary({
  profile,
  heading = "Hồ sơ ở ghép"
}: Readonly<{ profile: RoommateProfile | null; heading?: string }>) {
  if (!profile) {
    return (
      <Card subtle className="text-ui-sm text-rent-secondary">
        Chưa có hồ sơ ở ghép công khai trong ngữ cảnh này.
      </Card>
    );
  }

  const memberSince = formatMemberSince(profile.memberSince);
  const preferences = [
    ["Nhịp sinh hoạt", roommateSleepScheduleLabels[profile.sleepSchedule]],
    ["Mức độ gọn gàng", roommateCleanlinessLabels[profile.cleanlinessLevel]],
    ["Không gian", roommateNoiseLabels[profile.noisePreference]],
    ["Thuốc lá", roommateSmokingLabels[profile.smokingEnvironment]],
    ["Thú cưng", roommatePetLabels[profile.petEnvironment]]
  ] as const;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-display text-heading-sm font-bold text-heroDark-950">{heading}</h2>
        {profile.displayName ? <p className="mt-1 text-ui-base font-semibold">{profile.displayName}</p> : null}
        {memberSince ? (
          <p className="mt-1 text-ui-xs font-semibold text-rent-secondary">Thành viên từ {memberSince}</p>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap text-ui-sm leading-6 text-rent-secondary">{profile.intro}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {preferences.map(([label, value]) => (
          <div key={label} className="border-l-4 border-heroDark-950 bg-rent-canvas px-3 py-2">
            <dt className="text-ui-xs font-bold uppercase tracking-wide text-rent-secondary">{label}</dt>
            <dd className="mt-1 text-ui-sm font-semibold text-heroDark-950">{value}</dd>
          </div>
        ))}
      </dl>
      {profile.profileCompleted ? (
        <p className="inline-flex items-center gap-2 text-ui-xs font-bold text-heroDark-950">
          <Icon name="check" className="h-4 w-4" /> Hồ sơ ở ghép đã hoàn thành
        </p>
      ) : null}
    </Card>
  );
}

export function RoommateListingContext({ request }: Readonly<{ request: RoommateRequest }>) {
  if (request.listingMode === "UNLINKED") {
    return (
      <Card subtle>
        <h2 className="font-display text-ui-base font-bold">Chưa gắn listing</h2>
        <p className="mt-2 text-ui-sm leading-6 text-rent-secondary">
          Yêu cầu này tìm người để cùng tiếp tục tìm listing phù hợp trên RentMate.
        </p>
      </Card>
    );
  }

  if (!request.listing || request.signals.listingCurrentlyAvailable === false) {
    return (
      <Card className="border-rose-700 bg-rose-50">
        <h2 className="font-display text-ui-base font-bold text-heroDark-950">Listing không còn khả dụng</h2>
        <p className="mt-2 text-ui-sm leading-6 text-rent-secondary">
          {request.status === "MATCHED"
            ? "Liên kết này chỉ còn là ngữ cảnh lịch sử; kết nối ở ghép không tự động thay đổi."
            : "Không thể xác nhận listing này cho tương tác mới. Nếu đây là yêu cầu của bạn, hãy gỡ liên kết hoặc hủy yêu cầu."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-ui-xs font-bold uppercase tracking-[0.12em] text-rent-secondary">BỐI CẢNH LISTING</p>
          <h2 className="mt-1 font-display text-ui-base font-bold">{request.listing.title}</h2>
          <p className="mt-1 text-ui-sm text-rent-secondary">{request.listing.areaName}</p>
        </div>
        <Link
          href={`/listings/${request.listing.id}`}
          className="text-ui-sm font-bold underline decoration-2 underline-offset-4"
        >
          Xem listing
        </Link>
      </div>
      <p className="text-ui-sm font-semibold text-heroDark-950">
        {formatRoommateMoney(request.listing.monthlyRent)} / tháng · tối đa {request.listing.maxOccupants ?? "—"} người
      </p>
      <p className="border-l-4 border-heroDark-950 pl-3 text-ui-sm leading-6 text-rent-secondary">
        {roommateSafetyCopy.linkedMeaning}
      </p>
    </Card>
  );
}

export function RoommateRequestFacts({ request }: Readonly<{ request: RoommateRequest }>) {
  return (
    <dl className="grid gap-3 text-ui-sm sm:grid-cols-2">
      <div className="border-l-4 border-heroDark-950 bg-rent-canvas px-3 py-2">
        <dt className="text-ui-xs font-bold uppercase tracking-wide text-rent-secondary">Ngân sách mỗi người</dt>
        <dd className="mt-1 font-semibold">
          {formatRoommateMoney(request.budgetMinPerPerson)} – {formatRoommateMoney(request.budgetMaxPerPerson)}
        </dd>
      </div>
      <div className="border-l-4 border-heroDark-950 bg-rent-canvas px-3 py-2">
        <dt className="text-ui-xs font-bold uppercase tracking-wide text-rent-secondary">Thời gian chuyển vào</dt>
        <dd className="mt-1 font-semibold">
          {formatRoommateDate(request.moveInFrom)} – {formatRoommateDate(request.moveInUntil)}
        </dd>
      </div>
      <div className="border-l-4 border-heroDark-950 bg-rent-canvas px-3 py-2">
        <dt className="text-ui-xs font-bold uppercase tracking-wide text-rent-secondary">Khu vực quan tâm</dt>
        <dd className="mt-1 font-semibold">
          {request.preferredAreaKeys.length ? request.preferredAreaKeys.join(" · ") : "Theo listing"}
        </dd>
      </div>
      <div className="border-l-4 border-heroDark-950 bg-rent-canvas px-3 py-2">
        <dt className="text-ui-xs font-bold uppercase tracking-wide text-rent-secondary">Trạng thái</dt>
        <dd className="mt-1 font-semibold">{roommateRequestStatusLabels[request.status]}</dd>
      </div>
    </dl>
  );
}

export function RoommateReportControl({
  target,
  requestId,
  interestId,
  messageId,
  label = "Báo cáo"
}: Readonly<{
  target: RoommateReportTargetType;
  requestId?: number;
  interestId?: number;
  messageId?: number;
  label?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<RoommateReportCategory>("OTHER");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setOpen(false);
    } catch (caught) {
      setError(roommateErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  if (submitted) {
    return (
      <p role="status" className="text-ui-xs font-bold text-heroDark-950">
        Báo cáo đã được gửi tới đội ngũ an toàn.
      </p>
    );
  }
  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Icon name="flag" className="h-4 w-4" /> {label}
      </Button>
    );
  }
  return (
    <section
      className="space-y-3 border-2 border-heroDark-950 bg-[#fff6ef] p-4 shadow-glass-sm"
      aria-label="Gửi báo cáo ở ghép"
    >
      <div>
        <h2 className="font-display text-ui-base font-bold">Báo cáo nội dung ở ghép</h2>
        <p className="mt-1 text-ui-xs leading-5 text-rent-secondary">
          Báo cáo không tự động chặn người này. Bạn có thể chặn riêng nếu cần.
        </p>
      </div>
      <label
        className="block text-ui-sm font-bold"
        htmlFor={`roommate-report-category-${target}-${requestId ?? interestId ?? messageId}`}
      >
        Lý do
      </label>
      <select
        id={`roommate-report-category-${target}-${requestId ?? interestId ?? messageId}`}
        value={category}
        onChange={(event) => setCategory(event.target.value as RoommateReportCategory)}
        className="min-h-11 w-full border-2 border-heroDark-950 bg-white px-3 text-ui-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-brandBlue-500/40"
      >
        {Object.entries(roommateReportCategoryLabels).map(([value, itemLabel]) => (
          <option key={value} value={value}>
            {itemLabel}
          </option>
        ))}
      </select>
      <label
        className="block text-ui-sm font-bold"
        htmlFor={`roommate-report-details-${target}-${requestId ?? interestId ?? messageId}`}
      >
        Chi tiết <span className="font-semibold text-rent-secondary">(không bắt buộc)</span>
      </label>
      <textarea
        id={`roommate-report-details-${target}-${requestId ?? interestId ?? messageId}`}
        value={details}
        maxLength={2000}
        rows={4}
        onChange={(event) => setDetails(event.target.value)}
        className="min-h-24 w-full resize-y border-2 border-heroDark-950 bg-white p-3 text-ui-sm outline-none focus-visible:ring-4 focus-visible:ring-brandBlue-500/40"
      />
      <p className="text-right text-ui-xs font-semibold text-rent-secondary">{details.length}/2000</p>
      {error ? (
        <p role="alert" className="border-l-4 border-rose-700 pl-2 text-ui-sm font-semibold text-rose-800">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button pending={pending} pendingLabel="Đang gửi…" onClick={() => void submit()}>
          Gửi báo cáo
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
          Hủy
        </Button>
      </div>
    </section>
  );
}

export function RoommateBlockControl({
  context,
  id,
  onBlocked
}: Readonly<{ context: "request" | "interest"; id: number; onBlocked?: () => void }>) {
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
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        <Icon name="lock" className="h-4 w-4" /> Chặn
      </Button>
    );
  }
  return (
    <section
      className="space-y-3 border-2 border-heroDark-950 bg-rent-coral p-4 shadow-glass-sm"
      aria-label="Xác nhận chặn tương tác"
    >
      <p className="text-ui-sm font-semibold leading-6">
        Chặn sẽ ngừng tương tác trong ngữ cảnh này và không khôi phục lại lời quan tâm hoặc kết nối cũ khi bỏ chặn.
      </p>
      {error ? (
        <p role="alert" className="border-l-4 border-rose-800 pl-2 text-ui-sm font-bold text-rose-800">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" pending={pending} pendingLabel="Đang chặn…" onClick={() => void block()}>
          Xác nhận chặn
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
          Hủy
        </Button>
      </div>
    </section>
  );
}
