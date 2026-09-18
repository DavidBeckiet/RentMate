"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminPage } from "../../components/ui/admin-workspace";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/feedback-states";
import { Icon, type IconName } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import styles from "./admin-overview-page.module.css";

type SourceState<T> =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "success"; readonly data: T }
  | { readonly status: "error"; readonly error: ApiError | null };

type SourceStatus = SourceState<unknown>["status"];

const numberFormatter = new Intl.NumberFormat("vi-VN");

function useOverviewSource<T>(
  enabled: boolean,
  load: (signal?: AbortSignal) => Promise<T>,
  refreshAuth: () => Promise<void>
): readonly [SourceState<T>, () => Promise<void>] {
  const [state, setState] = useState<SourceState<T>>({ status: "idle" });
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    setState({ status: "loading" });
    try {
      const data = await load(controller.signal);
      if (currentRequest === requestId.current) setState({ status: "success", data });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      const apiError = error instanceof ApiError ? error : null;
      setState({ status: "error", error: apiError });
      if (apiError?.status === 401) void refreshAuth();
    }
  }, [enabled, load, refreshAuth]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return [state, reload] as const;
}

function formatCount(value: number): string {
  return numberFormatter.format(value);
}

function SourceValue({
  status,
  value,
  href,
  label,
  onRetry
}: Readonly<{
  status: SourceStatus;
  value?: number;
  href: string;
  label: string;
  onRetry: () => void;
}>) {
  if (status === "success" && value !== undefined) {
    return (
      <Link
        href={href}
        className={value > 0 ? styles.queueCountAttention : styles.queueCount}
        aria-label={`${label}: ${formatCount(value)}`}
      >
        <strong>{formatCount(value)}</strong>
        <span>{label}</span>
      </Link>
    );
  }

  if (status === "error") {
    return (
      <div className={styles.unavailable}>
        <Link href={href} className={styles.unavailableLink}>
          {label}
        </Link>
        <span>Chưa tải được</span>
        <button type="button" className={styles.retryLink} onClick={() => void onRetry()}>
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <span className={styles.loadingValue} role="status">
      Đang tải
    </span>
  );
}

function WorkItem({
  icon,
  title,
  description,
  status,
  value,
  href,
  valueLabel,
  onRetry
}: Readonly<{
  icon: IconName;
  title: string;
  description: string;
  status: SourceStatus;
  value?: number;
  href: string;
  valueLabel: string;
  onRetry: () => void;
}>) {
  return (
    <li className={styles.workItem}>
      <span className={styles.workIcon} aria-hidden="true">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className={styles.workCopy}>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <SourceValue status={status} value={value} href={href} label={valueLabel} onRetry={onRetry} />
    </li>
  );
}

function SplitStatusLinks({
  status,
  first,
  second,
  sourceLabel,
  onRetry
}: Readonly<{
  status: SourceStatus;
  first: { readonly count?: number; readonly href: string; readonly label: string };
  second: { readonly count?: number; readonly href: string; readonly label: string };
  sourceLabel: string;
  onRetry: () => void;
}>) {
  if (status === "success") {
    return (
      <div className={styles.splitStatusLinks}>
        {[first, second].map((item) => {
          const count = item.count ?? 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={count > 0 ? styles.splitLinkAttention : styles.splitLink}
              aria-label={`${sourceLabel} ${item.label}: ${formatCount(count)}`}
            >
              <strong>{formatCount(count)}</strong>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={styles.unavailable}>
        <Link href={first.href} className={styles.unavailableLink}>
          {sourceLabel} {first.label}
        </Link>
        <Link href={second.href} className={styles.unavailableLink}>
          {sourceLabel} {second.label}
        </Link>
        <span>Chưa tải được</span>
        <button type="button" className={styles.retryLink} onClick={() => void onRetry()}>
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <span className={styles.loadingValue} role="status">
      Đang tải
    </span>
  );
}

function SourceUnavailable({ status, onRetry }: Readonly<{ status: SourceStatus; onRetry: () => void }>) {
  if (status === "loading" || status === "idle")
    return (
      <p className={styles.loadingValue} role="status">
        Đang tải số liệu…
      </p>
    );
  return (
    <div className={styles.scaleUnavailable}>
      <p>Chưa tải được số liệu của nhóm này.</p>
      <button type="button" className={styles.retryLink} onClick={() => void onRetry()}>
        Thử lại
      </button>
    </div>
  );
}

export function AdminOverviewPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [identity, reloadIdentity] = useOverviewSource(adminReady, api.admin.getIdentityOverview, refresh);
  const [listings, reloadListings] = useOverviewSource(adminReady, api.admin.getListingOverview, refresh);
  const [engagement, reloadEngagement] = useOverviewSource(adminReady, api.admin.getEngagementOverview, refresh);

  if (authStatus === "loading")
    return (
      <div className={styles.routeLoading} role="status">
        Đang kiểm tra tài khoản…
      </div>
    );
  if (authStatus === "anonymous") {
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên để tiếp tục."
        action={<Link href="/admin/login">Đăng nhập quản trị</Link>}
      />
    );
  }
  if (authStatus === "error") {
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        onRetry={() => void refresh()}
      />
    );
  }
  if (!user || user.role !== "ADMIN") return <ErrorState message="Trang này dành cho quản trị viên." />;

  const authorizationFailure = [identity, listings, engagement].some(
    (source) => source.status === "error" && (source.error?.status === 401 || source.error?.status === 403)
  );
  if (authorizationFailure) {
    return <ErrorState message="Bạn không còn quyền truy cập khu vực quản trị." onRetry={() => void refresh()} />;
  }

  const identityData = identity.status === "success" ? identity.data : undefined;
  const listingData = listings.status === "success" ? listings.data : undefined;
  const engagementData = engagement.status === "success" ? engagement.data : undefined;
  const allSourcesSucceeded =
    identity.status === "success" && listings.status === "success" && engagement.status === "success";
  const allSourcesFailed = identity.status === "error" && listings.status === "error" && engagement.status === "error";
  const trackedCounts = [
    identityData?.verifications.pending,
    listingData?.listings.byStatus.PENDING,
    listingData?.listingReports.open,
    listingData?.listingReports.investigating,
    engagementData?.support.open,
    engagementData?.support.inProgress,
    engagementData?.reviews.pending,
    engagementData?.contactReports.open,
    engagementData?.contactReports.investigating,
    engagementData?.roommateReports.open,
    engagementData?.roommateReports.investigating,
    engagementData?.reviewReports.open,
    engagementData?.reviewReports.investigating
  ];
  const allClear = allSourcesSucceeded && trackedCounts.every((value) => value === 0);
  const refreshing = identity.status === "loading" || listings.status === "loading" || engagement.status === "loading";
  const reloadAll = () => Promise.all([reloadIdentity(), reloadListings(), reloadEngagement()]).then(() => undefined);

  return (
    <AdminPage labelledBy="admin-overview-heading" className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Khu vực quản trị</p>
          <h1 id="admin-overview-heading">Tổng quan quản trị</h1>
          <p>Ưu tiên công việc đang chờ và mở đúng quy trình để xử lý.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          pending={refreshing}
          pendingLabel="Đang cập nhật…"
          onClick={() => void reloadAll()}
        >
          <Icon name="refresh" className="h-4 w-4" />
          Làm mới số liệu
        </Button>
      </header>

      {allSourcesFailed ? (
        <section className={styles.totalFailure} role="alert" aria-labelledby="overview-data-error">
          <div>
            <h2 id="overview-data-error">Chưa tải được số liệu tổng quan</h2>
            <p>Các đường dẫn nghiệp vụ bên dưới vẫn có thể sử dụng.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void reloadAll()}>
            Thử lại
          </Button>
        </section>
      ) : null}

      <section aria-labelledby="attention-heading" className={styles.attentionSection}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionEyebrow}>Ưu tiên vận hành</p>
            <h2 id="attention-heading">Cần xử lý</h2>
          </div>
          {allClear ? <p className={styles.allClear}>Hiện không có việc đang chờ xử lý.</p> : null}
        </div>

        <div className={styles.attentionGrid}>
          <section className={styles.workPanel} aria-label="Hàng đợi chính">
            <ul className={styles.workList}>
              <WorkItem
                icon="clipboard"
                title="Tin chờ duyệt"
                description="Các tin cần quyết định kiểm duyệt"
                status={listings.status}
                value={listingData?.listings.byStatus.PENDING}
                href="/admin/listings"
                valueLabel="tin chờ duyệt"
                onRetry={reloadListings}
              />
              <WorkItem
                icon="shield"
                title="Xác minh chủ trọ"
                description="Hồ sơ đang chờ kiểm tra"
                status={identity.status}
                value={identityData?.verifications.pending}
                href="/admin/verifications"
                valueLabel="hồ sơ chờ xử lý"
                onRetry={reloadIdentity}
              />
              <li className={styles.workItem}>
                <span className={styles.workIcon} aria-hidden="true">
                  <Icon name="message" className="h-5 w-5" />
                </span>
                <div className={styles.workCopy}>
                  <h3>Yêu cầu hỗ trợ</h3>
                  <p>Phân biệt việc mới và đang xem xét</p>
                </div>
                <SplitStatusLinks
                  status={engagement.status}
                  first={{ count: engagementData?.support.open, href: "/admin/support-requests", label: "mới" }}
                  second={{
                    count: engagementData?.support.inProgress,
                    href: "/admin/support-requests?status=IN_PROGRESS",
                    label: "đang xem xét"
                  }}
                  sourceLabel="Yêu cầu hỗ trợ"
                  onRetry={reloadEngagement}
                />
              </li>
              <WorkItem
                icon="star"
                title="Đánh giá chờ duyệt"
                description="Đánh giá cần kiểm duyệt trước khi hoàn tất"
                status={engagement.status}
                value={engagementData?.reviews.pending}
                href="/admin/reviews"
                valueLabel="đánh giá chờ duyệt"
                onRetry={reloadEngagement}
              />
            </ul>
          </section>

          <section className={styles.reportPanel} aria-labelledby="report-heading">
            <div className={styles.reportPanelHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Phản hồi an toàn</p>
                <h3 id="report-heading">Báo cáo cần xem xét</h3>
              </div>
              <Icon name="flag" className="h-5 w-5" aria-hidden="true" />
            </div>
            <ul className={styles.reportList}>
              <li>
                <span>Báo cáo tin đăng</span>
                <SplitStatusLinks
                  status={listings.status}
                  first={{ count: listingData?.listingReports.open, href: "/admin/reports", label: "mới" }}
                  second={{
                    count: listingData?.listingReports.investigating,
                    href: "/admin/reports?status=INVESTIGATING",
                    label: "đang xem xét"
                  }}
                  sourceLabel="Báo cáo tin đăng"
                  onRetry={reloadListings}
                />
              </li>
              <li>
                <span>Báo cáo liên hệ</span>
                <SplitStatusLinks
                  status={engagement.status}
                  first={{ count: engagementData?.contactReports.open, href: "/admin/contact-reports", label: "mới" }}
                  second={{
                    count: engagementData?.contactReports.investigating,
                    href: "/admin/contact-reports?status=INVESTIGATING",
                    label: "đang xem xét"
                  }}
                  sourceLabel="Báo cáo liên hệ"
                  onRetry={reloadEngagement}
                />
              </li>
              <li>
                <span>Báo cáo ở ghép</span>
                <SplitStatusLinks
                  status={engagement.status}
                  first={{ count: engagementData?.roommateReports.open, href: "/admin/roommate-reports", label: "mới" }}
                  second={{
                    count: engagementData?.roommateReports.investigating,
                    href: "/admin/roommate-reports?status=INVESTIGATING",
                    label: "đang xem xét"
                  }}
                  sourceLabel="Báo cáo ở ghép"
                  onRetry={reloadEngagement}
                />
              </li>
              <li>
                <span>Báo cáo đánh giá</span>
                <SplitStatusLinks
                  status={engagement.status}
                  first={{ count: engagementData?.reviewReports.open, href: "/admin/review-reports", label: "mới" }}
                  second={{
                    count: engagementData?.reviewReports.investigating,
                    href: "/admin/review-reports?status=INVESTIGATING",
                    label: "đang xem xét"
                  }}
                  sourceLabel="Báo cáo đánh giá"
                  onRetry={reloadEngagement}
                />
              </li>
            </ul>
          </section>
        </div>
      </section>

      <section aria-labelledby="scale-heading" className={styles.scaleSection}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionEyebrow}>Bối cảnh toàn hệ thống</p>
            <h2 id="scale-heading">Quy mô RentMate</h2>
          </div>
          <p className={styles.scaleNote}>Các nhóm số liệu được tải độc lập theo service quản lý dữ liệu.</p>
        </div>
        <div className={styles.scaleGrid}>
          <section className={styles.scalePanel} aria-labelledby="accounts-heading">
            <div className={styles.scalePanelHeader}>
              <div>
                <h3 id="accounts-heading">Tài khoản</h3>
                <p>Phân bổ tài khoản hiện có</p>
              </div>
              <Link href="/admin/users">Mở danh sách người dùng</Link>
            </div>
            {identityData ? (
              <>
                <p className={styles.totalMetric}>
                  <strong>{formatCount(identityData.accounts.total)}</strong>
                  <span>tổng tài khoản</span>
                </p>
                <dl className={styles.metricList}>
                  <div>
                    <dt>Người thuê</dt>
                    <dd>{formatCount(identityData.accounts.byRole.TENANT)}</dd>
                  </div>
                  <div>
                    <dt>Chủ trọ</dt>
                    <dd>{formatCount(identityData.accounts.byRole.LANDLORD)}</dd>
                  </div>
                  <div>
                    <dt>Quản trị viên</dt>
                    <dd>{formatCount(identityData.accounts.byRole.ADMIN)}</dd>
                  </div>
                  <div>
                    <dt>Đang hoạt động</dt>
                    <dd>{formatCount(identityData.accounts.active)}</dd>
                  </div>
                  <div>
                    <dt>Ngừng hoạt động</dt>
                    <dd>{formatCount(identityData.accounts.inactive)}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <SourceUnavailable status={identity.status} onRetry={reloadIdentity} />
            )}
          </section>
          <section className={styles.scalePanel} aria-labelledby="listings-heading">
            <div className={styles.scalePanelHeader}>
              <div>
                <h3 id="listings-heading">Tin đăng</h3>
                <p>Phân bổ theo trạng thái kiểm duyệt</p>
              </div>
            </div>
            {listingData ? (
              <>
                <p className={styles.totalMetric}>
                  <strong>{formatCount(listingData.listings.total)}</strong>
                  <span>tổng tin đăng</span>
                </p>
                <dl className={styles.metricList}>
                  <div>
                    <dt>Bản nháp</dt>
                    <dd>{formatCount(listingData.listings.byStatus.DRAFT)}</dd>
                  </div>
                  <div>
                    <dt>
                      <Link href="/admin/listings">Chờ duyệt</Link>
                    </dt>
                    <dd>{formatCount(listingData.listings.byStatus.PENDING)}</dd>
                  </div>
                  <div>
                    <dt>
                      <Link href="/admin/listings?status=APPROVED">Đã duyệt kiểm duyệt</Link>
                    </dt>
                    <dd>{formatCount(listingData.listings.byStatus.APPROVED)}</dd>
                  </div>
                  <div>
                    <dt>
                      <Link href="/admin/listings?status=REJECTED">Bị từ chối</Link>
                    </dt>
                    <dd>{formatCount(listingData.listings.byStatus.REJECTED)}</dd>
                  </div>
                  <div>
                    <dt>
                      <Link href="/admin/listings?status=HIDDEN">Đã ẩn</Link>
                    </dt>
                    <dd>{formatCount(listingData.listings.byStatus.HIDDEN)}</dd>
                  </div>
                  <div>
                    <dt>
                      <Link href="/admin/listings?status=INACTIVE">Ngừng hoạt động</Link>
                    </dt>
                    <dd>{formatCount(listingData.listings.byStatus.INACTIVE)}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <SourceUnavailable status={listings.status} onRetry={reloadListings} />
            )}
          </section>
        </div>
      </section>
    </AdminPage>
  );
}
