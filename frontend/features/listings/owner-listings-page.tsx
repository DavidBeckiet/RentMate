"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { ListingStatusBadge } from "../../components/ui/status-badge";
import { useRegisterLandlordCommandBar } from "../../components/ui/landlord-command-bar";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type {
  ListingBusinessStatus,
  ListingStatus,
  OwnerListingDetail,
  OwnerListingPage,
  OwnerListingSummary
} from "../../types/api";
import { formatVnd } from "./format";
import { ListingImage } from "./listing-presentation";
import { OwnerListingCard } from "./owner-listing-card";
import { OwnerListingInspector } from "./owner-listing-inspector";
import { propertyTypeLabel } from "./room-type-label";
import {
  getDraftRequirements,
  resolveOwnerWorkspaceMode,
  selectProgressListing,
  type OwnerWorkspaceMode
} from "./owner-workspace-state";
import {
  ownerBusinessStatuses,
  ownerDefaultPageSize,
  ownerListingStatuses,
  ownerListingsUrl,
  parseOwnerQuery,
  serializeOwnerQuery,
  toOwnedListingQuery,
  type OwnerQueryState,
  withOwnerBusinessStatus,
  withOwnerPage,
  withOwnerStatus
} from "./owner-query";
import styles from "./owner-listings-page.module.css";

type LoadStatus = "idle" | "loading" | "success" | "error";

interface OwnerInventorySnapshot {
  readonly listings: readonly OwnerListingSummary[];
  readonly metadata?: { readonly hasEverApprovedListing: boolean };
}

const listingStatusLabels: Record<ListingStatus, string> = {
  DRAFT: "Bản nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Cần chỉnh sửa",
  HIDDEN: "Đã ẩn",
  INACTIVE: "Ngừng hoạt động"
};

const businessStatusLabels: Record<ListingBusinessStatus, string> = {
  AVAILABLE: "Còn phòng",
  PAUSED: "Tạm dừng",
  RENTED: "Đã thuê",
  UNKNOWN: "Chưa xác định"
};

function listingMatchesOwnerQuery(listing: OwnerListingSummary, state: OwnerQueryState): boolean {
  return (
    (state.status === undefined || listing.status === state.status) &&
    (state.businessStatus === undefined || listing.businessStatus === state.businessStatus)
  );
}

function listingMatchesSearch(listing: OwnerListingSummary, searchQuery: string): boolean {
  const query = searchQuery.trim().toLocaleLowerCase("vi-VN");
  if (!query) return true;
  return [listing.title, listing.areaName, listing.propertyType?.label]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase("vi-VN").includes(query));
}

function ownerListError(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Trang quản lý tin chỉ dành cho tài khoản người cho thuê.";
  if (error?.status === 422) return "Liên kết quản lý tin đăng không hợp lệ.";
  if (error?.code === "NETWORK_ERROR") return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.";
  return "Không thể tải danh sách tin lúc này. Vui lòng thử lại.";
}

function createError(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Bạn không có quyền tạo bản nháp.";
  if (error?.status === 422) return "Yêu cầu tạo bản nháp không hợp lệ.";
  if (error?.code === "NETWORK_ERROR") {
    return "Không thể xác nhận việc tạo bản nháp. Hãy kiểm tra danh sách tin trước khi thử lại.";
  }
  return "Không thể tạo bản nháp lúc này. Vui lòng thử lại sau.";
}

function duplicateError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Không thể nhân bản tin lúc này. Vui lòng thử lại sau.";
  if (error.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
  if (error.status === 403) return "Bạn không có quyền nhân bản tin này.";
  if (error.status === 404) return "Tin đăng không còn tồn tại hoặc bạn không thể truy cập.";
  if (error.status === 409) return "Tin đã thay đổi. Hãy tải lại danh sách rồi thử lại.";
  if (error.code === "NETWORK_ERROR") {
    return "Không thể xác nhận việc nhân bản. Hãy kiểm tra danh sách trước khi thử lại.";
  }
  return "Không thể nhân bản tin lúc này. Vui lòng thử lại sau.";
}

function businessStatusError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Không thể cập nhật tình trạng phòng lúc này. Vui lòng thử lại.";
  if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.status === 403) return "Bạn không có quyền cập nhật tình trạng tin này.";
  if (error.status === 404) return "Tin đăng không tồn tại hoặc bạn không thể truy cập.";
  if (error.status === 409) return "Tin đăng vừa thay đổi. Vui lòng tải lại danh sách rồi thử lại.";
  if (error.status === 422) return "Tình trạng phòng chưa hợp lệ.";
  return "Không thể cập nhật tình trạng phòng lúc này. Vui lòng thử lại.";
}

async function loadOwnerInventory(signal: AbortSignal): Promise<OwnerInventorySnapshot | null> {
  const listings: OwnerListingSummary[] = [];
  let pageNumber = 1;
  let metadata: OwnerInventorySnapshot["metadata"];

  for (;;) {
    const page = await api.listings.listOwned({ page: pageNumber, pageSize: 100 }, signal);
    if (signal.aborted) return null;
    listings.push(...page.data);
    if (pageNumber === 1 && typeof page.metadata?.hasEverApprovedListing === "boolean") {
      metadata = { hasEverApprovedListing: page.metadata.hasEverApprovedListing };
    }
    if (!page.pagination.hasNextPage) break;
    pageNumber += 1;
  }

  return {
    listings: Object.freeze(listings),
    ...(metadata === undefined ? {} : { metadata })
  };
}

async function hasUnreadLead(signal: AbortSignal): Promise<boolean> {
  let pageNumber = 1;

  for (;;) {
    const page = await api.leads.list({ view: "ALL", page: pageNumber, pageSize: 100 }, signal);
    if (signal.aborted) return false;
    if (page.data.some((lead) => lead.hasUnreadTenantMessages)) return true;
    if (!page.pagination.hasNextPage) return false;
    pageNumber += 1;
  }
}

function listingSummaryFromDetail(listing: OwnerListingSummary, detail: OwnerListingDetail): OwnerListingSummary {
  return {
    ...listing,
    status: detail.status,
    businessStatus: detail.businessStatus,
    availabilityStatus: detail.availabilityStatus,
    availabilityConfirmedAt: detail.availabilityConfirmedAt,
    availabilityExpiresAt: detail.availabilityExpiresAt,
    updatedAt: detail.updatedAt
  };
}

function OwnerPagination({
  page,
  state,
  onNavigate
}: {
  readonly page: OwnerListingPage["pagination"];
  readonly state: {
    readonly page: number;
    readonly status?: ListingStatus;
    readonly businessStatus?: ListingBusinessStatus;
    readonly pageSize?: number;
  };
  readonly onNavigate: (url: string) => void;
}) {
  if (page.page === 1 && !page.hasNextPage) return null;
  return (
    <Pagination
      ariaLabel="Phân trang tin đăng"
      page={page.page}
      hasNextPage={page.hasNextPage}
      onPrevious={() => onNavigate(ownerListingsUrl(withOwnerPage(state, page.page - 1)))}
      onNext={() => onNavigate(ownerListingsUrl(withOwnerPage(state, page.page + 1)))}
    />
  );
}

function LocalSearchPagination({
  page,
  hasNextPage,
  onNavigate
}: {
  readonly page: number;
  readonly hasNextPage: boolean;
  readonly onNavigate: (page: number) => void;
}) {
  if (page === 1 && !hasNextPage) return null;
  return (
    <Pagination
      ariaLabel="Phân trang kết quả tìm kiếm"
      page={page}
      hasNextPage={hasNextPage}
      compact
      onPrevious={() => onNavigate(page - 1)}
      onNext={() => onNavigate(page + 1)}
    />
  );
}

function ListingInventory({
  listings,
  selectedListingId,
  onInspect
}: {
  readonly listings: readonly OwnerListingSummary[];
  readonly selectedListingId: number | null;
  readonly onInspect: (listingId: number) => void;
}) {
  const layoutClass =
    listings.length === 1 ? styles.singleInventoryGrid : listings.length === 2 ? styles.doubleInventoryGrid : "";

  return (
    <ul
      className={layoutClass ? `${styles.inventoryGrid} ${layoutClass}` : styles.inventoryGrid}
      aria-label="Tin đăng của bạn"
    >
      {listings.map((listing) => (
        <li key={listing.id} className={styles.inventoryItem}>
          <OwnerListingCard
            listing={listing}
            selected={selectedListingId === listing.id}
            onInspect={() => onInspect(listing.id)}
          />
        </li>
      ))}
    </ul>
  );
}

function OwnerAttentionStrip({
  listings,
  hasUnreadLeads
}: {
  readonly listings: readonly OwnerListingSummary[];
  readonly hasUnreadLeads: boolean | null;
}) {
  const rejected = listings.find((listing) => listing.status === "REJECTED");
  const autoPaused = listings.find((listing) => listing.availabilityStatus === "AUTO_PAUSED");
  const reminder = listings.find((listing) => listing.availabilityStatus === "REMINDER_DUE");
  const availabilityTask = autoPaused ?? reminder;
  const tasks = [
    ...(hasUnreadLeads === true
      ? [
          {
            key: "leads",
            label: "Tin nhắn mới",
            description: "Có khách quan tâm gửi tin nhắn chưa đọc. Mở danh sách để tiếp tục trao đổi.",
            href: "/landlord/leads",
            icon: "message" as const
          }
        ]
      : []),
    ...(rejected
      ? [
          {
            key: "rejected",
            label: "Sửa tin cần chỉnh",
            description: rejected.title ?? "Tin #" + rejected.id,
            href: "/landlord/listings/" + rejected.id,
            icon: "note" as const
          }
        ]
      : []),
    ...(availabilityTask
      ? [
          {
            key: "availability",
            label: autoPaused ? "Xác nhận để mở lại tin" : "Xác nhận tình trạng phòng",
            description: availabilityTask.title ?? "Tin #" + availabilityTask.id,
            href: "/landlord/listings/" + availabilityTask.id,
            icon: "refresh" as const
          }
        ]
      : [])
  ];

  if (tasks.length === 0) return null;
  return (
    <section className={styles.attentionStrip} aria-label="Việc cần xử lý">
      <ul className={styles.attentionTasks}>
        {tasks.map((task) => (
          <li key={task.key} data-task={task.key}>
            <span className={styles.attentionMark} aria-hidden="true">
              <Icon name={task.icon} />
            </span>
            <div className={styles.taskContent}>
              <strong>{task.label}</strong>
              <p>{task.description}</p>
              <Link href={task.href} aria-label={task.label}>
                {task.key === "leads" ? "Mở khách quan tâm" : "Mở tin để xử lý"}
                <Icon name="arrow" aria-hidden="true" />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyOwnerLaunchpad({ pending, onCreate }: { readonly pending: boolean; readonly onCreate: () => void }) {
  return (
    <section className={styles.launchpad} aria-labelledby="owner-launch-heading" data-workspace-state="A">
      <div className={styles.launchHero}>
        <div className={styles.launchCopy}>
          <span className={styles.launchIcon} aria-hidden="true">
            <Icon name="building" />
          </span>
          <div className={styles.launchIntro}>
            <span className={styles.productEyebrow}>QUẢN LÝ TIN CHO THUÊ</span>
            <h1 id="owner-launch-heading">Bạn chưa có tin nào.</h1>
            <p>
              Tạo một tin rõ ràng, thêm ảnh và ghim vị trí trên bản đồ. RentMate sẽ hướng dẫn từng bước trước khi gửi
              duyệt.
            </p>
          </div>
          <Button pending={pending} pendingLabel="Đang tạo tin…" className={styles.launchAction} onClick={onCreate}>
            <Icon name="plus" aria-hidden="true" />
            Tạo tin đầu tiên
          </Button>
          <span className={styles.launchFootnote}>
            <Icon name="check" aria-hidden="true" />
            Tạo bản nháp miễn phí · có thể hoàn thiện sau
          </span>
        </div>

        <div className={styles.launchVisual} aria-hidden="true">
          <span className={styles.visualSparkle}>
            <Icon name="sparkles" />
          </span>
          <div className={styles.previewCard}>
            <div className={styles.previewImage}>
              <span className={styles.previewBuilding}>
                <Icon name="building" />
              </span>
              <span className={styles.previewBadge}>
                <i /> Bản nháp đầu tiên
              </span>
            </div>
            <div className={styles.previewBody}>
              <span className={styles.previewEyebrow}>PHÒNG CỦA BẠN</span>
              <strong>Chỗ ở phù hợp bắt đầu từ một tin rõ ràng</strong>
              <div className={styles.previewFacts}>
                <span>
                  <Icon name="pin" /> Vị trí
                </span>
                <span>
                  <Icon name="ruler" /> Diện tích
                </span>
                <span>
                  <Icon name="wifi" /> Tiện ích
                </span>
              </div>
            </div>
          </div>
          <span className={styles.visualHint}>
            <Icon name="check" /> Sẵn sàng trong vài bước
          </span>
        </div>
      </div>

      <div className={styles.launchGuide}>
        <div className={styles.launchGuideHeading}>
          <div>
            <span className={styles.sectionEyebrow}>LỘ TRÌNH KHỞI ĐỘNG</span>
            <h2>Ba bước để tin sẵn sàng tiếp cận người thuê</h2>
          </div>
          <p>Bắt đầu với thông tin bạn đang có, phần còn thiếu có thể bổ sung sau.</p>
        </div>
        <ol className={styles.launchSteps} aria-label="Các bước tạo tin đăng">
          <li>
            <span className={styles.launchStepIcon}>
              <Icon name="note" />
              <small>01</small>
            </span>
            <div>
              <strong>Tạo tin</strong>
              <p>Nhập thông tin căn phòng, giá thuê và tiện ích.</p>
            </div>
          </li>
          <li>
            <span className={styles.launchStepIcon}>
              <Icon name="eye" />
              <small>02</small>
            </span>
            <div>
              <strong>Hoàn thiện hình ảnh</strong>
              <p>Thêm ảnh, vị trí và các thông tin còn thiếu.</p>
            </div>
          </li>
          <li>
            <span className={styles.launchStepIcon}>
              <Icon name="send" />
              <small>03</small>
            </span>
            <div>
              <strong>Gửi duyệt và nhận khách</strong>
              <p>Gửi xét duyệt rồi theo dõi trao đổi tại đây.</p>
            </div>
          </li>
        </ol>
      </div>

      <ul className={styles.launchBenefits} aria-label="Tiện ích hỗ trợ chủ trọ">
        <li>
          <span data-tone="blue">
            <Icon name="clipboard" />
          </span>
          <div>
            <strong>Lưu nháp linh hoạt</strong>
            <p>Không cần hoàn thành tất cả trong một lần.</p>
          </div>
        </li>
        <li>
          <span data-tone="amber">
            <Icon name="pin" />
          </span>
          <div>
            <strong>Ghim vị trí dễ dàng</strong>
            <p>Chỉ cần nhập địa chỉ, không cần biết tọa độ.</p>
          </div>
        </li>
        <li>
          <span data-tone="violet">
            <Icon name="message" />
          </span>
          <div>
            <strong>Quản lý tập trung</strong>
            <p>Theo dõi tin và người thuê quan tâm tại một nơi.</p>
          </div>
        </li>
      </ul>
    </section>
  );
}

function ListingProgressFeature({
  listing,
  draftDetail,
  draftStatus,
  onRetryDraft,
  onCreate,
  createPending
}: {
  readonly listing: OwnerListingSummary;
  readonly draftDetail: OwnerListingDetail | null;
  readonly draftStatus: LoadStatus;
  readonly onRetryDraft: () => void;
  readonly onCreate: () => void;
  readonly createPending: boolean;
}) {
  const isRejected = listing.status === "REJECTED";
  const isDraft = listing.status === "DRAFT";
  const title = listing.title ?? "Tin đăng chưa có tiêu đề";
  const requirements = isDraft && draftDetail ? getDraftRequirements(draftDetail) : [];
  const completeCount = requirements.filter((requirement) => requirement.complete).length;
  const primaryLabel = isRejected
    ? "Sửa tin"
    : isDraft
      ? "Tiếp tục hoàn thiện"
      : listing.status === "PENDING"
        ? "Xem trạng thái duyệt"
        : "Mở tin để quản lý";
  const heading = isRejected
    ? "Tin cần được chỉnh sửa"
    : isDraft
      ? "Tiếp tục hoàn thiện tin đăng"
      : listing.status === "PENDING"
        ? "Tin đăng đang được xem xét"
        : listing.status === "INACTIVE"
          ? "Tin đăng đang tạm dừng"
          : listing.status === "HIDDEN"
            ? "Tin đăng đang ẩn"
            : "Tiến độ tin đăng của bạn";
  const image = draftDetail?.images[0] ?? listing.coverImage;
  const progressActions = (
    <div className={styles.progressActions} data-primary-first={isDraft ? "true" : undefined}>
      <Link href={"/landlord/listings/" + listing.id} className={styles.progressPrimaryAction}>
        {primaryLabel}
        <Icon name="arrow" aria-hidden="true" />
      </Link>
      <div className={styles.progressSecondaryActions}>
        <Button variant="outline" size="sm" pending={createPending} pendingLabel="Đang tạo…" onClick={onCreate}>
          <Icon name="plus" aria-hidden="true" />
          Tạo thêm tin
        </Button>
        <Link href="/landlord/profile">
          Hồ sơ chủ nhà
          <Icon name="arrowUpRight" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );

  return (
    <section
      className={styles.progressFeature}
      aria-labelledby="listing-progress-heading"
      data-listing-status={listing.status}
    >
      <div className={styles.progressPhoto}>
        <ListingImage
          image={image}
          title={title}
          sizes="(min-width: 900px) 44vw, 100vw"
          className={styles.featureImage}
        />
        <span className={styles.moderationOnPhoto}>
          <ListingStatusBadge status={listing.status} />
        </span>
        <span className={styles.imageCounter}>
          <Icon name="building" aria-hidden="true" />
          Tin #{listing.id}
        </span>
      </div>
      <div className={styles.progressContent}>
        <div className={styles.progressHeadingRow}>
          <div>
            <span className={styles.sectionEyebrow}>TIẾN ĐỘ ĐĂNG TIN</span>
            <h1 id="listing-progress-heading">{heading}</h1>
          </div>
          <Badge variant={listing.businessStatus === "AVAILABLE" ? "success" : "neutral"} context="Tình trạng phòng">
            {businessStatusLabels[listing.businessStatus]}
          </Badge>
        </div>
        <h2 className={styles.progressListingTitle}>{title}</h2>
        <div className={styles.progressFacts}>
          <span>
            <Icon name="pin" aria-hidden="true" />
            {listing.areaName ?? "Chưa có khu vực"}
          </span>
          <span>
            <Icon name="home" aria-hidden="true" />
            {listing.propertyType ? propertyTypeLabel(listing.propertyType) : "Chưa chọn loại phòng"}
          </span>
          <strong>{listing.monthlyRent === null ? "Chưa nhập giá thuê" : formatVnd(listing.monthlyRent)}</strong>
        </div>

        {isRejected ? (
          <div className={styles.rejectionReason} aria-labelledby="rejection-reason-heading">
            <span className={styles.reasonIcon} aria-hidden="true">
              <Icon name="note" />
            </span>
            <div>
              <strong id="rejection-reason-heading">Lý do cần chỉnh sửa</strong>
              <p>{listing.currentModerationReason ?? "Mở tin để xem nội dung cần cập nhật trước khi gửi lại."}</p>
            </div>
          </div>
        ) : null}

        {isDraft ? progressActions : null}

        {isDraft ? (
          <div className={styles.draftProgress}>
            {draftStatus === "loading" ? (
              <p className={styles.inlineProgressStatus} role="status">
                Đang kiểm tra các mục cần hoàn thiện…
              </p>
            ) : draftStatus === "error" || !draftDetail ? (
              <div className={styles.inlineProgressStatus} role="status">
                <span>Chưa tải được danh sách yêu cầu của tin.</span>
                <button type="button" className={styles.inlineAction} onClick={onRetryDraft}>
                  Thử lại
                </button>
              </div>
            ) : (
              <>
                <div className={styles.progressCount}>
                  <span>Đã sẵn sàng</span>
                  <strong>
                    {completeCount}
                    <small> / {requirements.length}</small>
                  </strong>
                </div>
                <div
                  className={styles.progressTrack}
                  role="progressbar"
                  aria-label="Tiến độ hoàn thiện tin"
                  aria-valuemin={0}
                  aria-valuemax={requirements.length}
                  aria-valuenow={completeCount}
                >
                  <span
                    style={{
                      width: (requirements.length === 0 ? 0 : (completeCount / requirements.length) * 100) + "%"
                    }}
                  />
                </div>
                <ul className={styles.requirementList} aria-label="Các yêu cầu của tin đăng">
                  {requirements.map((requirement) => (
                    <li key={requirement.key} data-complete={requirement.complete}>
                      <span className={styles.requirementMark} aria-hidden="true">
                        <Icon name={requirement.complete ? "check" : "plus"} />
                      </span>
                      <span>{requirement.label}</span>
                      <span className="sr-only">{requirement.complete ? "Đã hoàn thành" : "Còn thiếu"}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}

        {listing.status === "PENDING" ? (
          <div className={styles.reviewNote}>
            <span className={styles.reviewIcon} aria-hidden="true">
              <Icon name="shield" />
            </span>
            <p>
              RentMate đang xem xét tin của bạn. <strong>Bạn không cần gửi lại.</strong> Chúng tôi sẽ cập nhật trạng
              thái khi có kết quả.
            </p>
          </div>
        ) : null}

        {!isRejected && !isDraft && listing.status !== "PENDING" ? (
          <p className={styles.neutralProgressCopy}>
            {listing.status === "INACTIVE"
              ? "Tin đang tạm dừng. Mở tin để xem các lựa chọn quản lý tiếp theo."
              : listing.status === "HIDDEN"
                ? "Tin đang được ẩn. Mở tin để xem các lựa chọn quản lý tiếp theo."
                : `Tin của bạn đang ở trạng thái ${listingStatusLabels[listing.status].toLowerCase()}. Mở tin để xem lựa chọn tiếp theo.`}
          </p>
        ) : null}

        {!isDraft ? progressActions : null}
      </div>
    </section>
  );
}

export function OwnerListingsPage() {
  const router = useRouter();
  const routerPush = router.push;
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const parsed = useMemo(() => parseOwnerQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const queryIdentity = parsed.ok ? serializeOwnerQuery(parsed.state).toString() : "invalid:" + rawQuery;
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const [mounted, setMounted] = useState(false);
  const isLandlord = mounted && authStatus === "authenticated" && user?.role === "LANDLORD";
  const [result, setResult] = useState<OwnerListingPage | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [loadedQueryIdentity, setLoadedQueryIdentity] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<OwnerInventorySnapshot | null>(null);
  const [portfolioStatus, setPortfolioStatus] = useState<LoadStatus>("idle");
  const [portfolioRetryKey, setPortfolioRetryKey] = useState(0);
  const [hasUnreadLeads, setHasUnreadLeads] = useState<boolean | null>(null);
  const [draftDetail, setDraftDetail] = useState<OwnerListingDetail | null>(null);
  const [draftDetailStatus, setDraftDetailStatus] = useState<LoadStatus>("idle");
  const [draftRetryKey, setDraftRetryKey] = useState(0);
  const [createPending, setCreatePending] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<string | null>(null);
  const [duplicatePendingId, setDuplicatePendingId] = useState<number | null>(null);
  const [duplicateFeedback, setDuplicateFeedback] = useState<string | null>(null);
  const [businessStatusPendingId, setBusinessStatusPendingId] = useState<number | null>(null);
  const [businessStatusFeedback, setBusinessStatusFeedback] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null);
  const requestIdentity = useRef(0);
  const createPendingRef = useRef(false);
  const createController = useRef<AbortController | null>(null);
  const duplicateController = useRef<AbortController | null>(null);
  const businessStatusController = useRef<AbortController | null>(null);
  const authRefreshAttempted = useRef(false);
  const committedState = parsed.ok ? parsed.state : { page: 1 };
  const hasCustomQuery = parsed.ok && serializeOwnerQuery(parsed.state).size > 0;
  const hasUnfilteredEmptyResult =
    parsed.ok &&
    result !== null &&
    committedState.page === 1 &&
    committedState.status === undefined &&
    committedState.businessStatus === undefined &&
    result.data.length === 0 &&
    result.pagination.hasNextPage === false;
  const resolvedMode: OwnerWorkspaceMode =
    portfolioStatus === "success" && portfolio
      ? resolveOwnerWorkspaceMode(portfolio.listings.length, portfolio.metadata)
      : portfolioStatus === "error" && hasUnfilteredEmptyResult
        ? "EMPTY"
        : "UNKNOWN";
  const inventoryListings = portfolio?.listings ?? [];
  const selectedListing =
    selectedListingId === null
      ? null
      : (inventoryListings.find((listing) => listing.id === selectedListingId) ??
        result?.data.find((listing) => listing.id === selectedListingId) ??
        null);
  const progressListing = resolvedMode === "GETTING_LISTING_LIVE" ? selectProgressListing(inventoryListings) : null;
  const draftListingId =
    resolvedMode === "GETTING_LISTING_LIVE" && progressListing?.status === "DRAFT" ? progressListing.id : null;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setSearchTerm("");
    setSearchPage(1);
  }, [queryIdentity]);

  useEffect(() => setSearchPage(1), [searchTerm]);

  useEffect(() => setSelectedListingId(null), [queryIdentity]);

  useEffect(() => {
    if (!isLandlord || !parsed.ok) {
      ++requestIdentity.current;
      setResult(null);
      setLoadedQueryIdentity(null);
      setLoadError(null);
      setLoadStatus("idle");
      return;
    }

    const controller = new AbortController();
    const identity = ++requestIdentity.current;
    setResult(null);
    setLoadedQueryIdentity(null);
    setLoadError(null);
    setLoadStatus("loading");

    void api.listings
      .listOwned(toOwnedListingQuery(parsed.state), controller.signal)
      .then((page) => {
        if (controller.signal.aborted || identity !== requestIdentity.current) return;
        setResult(page);
        setLoadedQueryIdentity(queryIdentity);
        setLoadStatus("success");
        authRefreshAttempted.current = false;
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || identity !== requestIdentity.current) return;
        const error = caught instanceof ApiError ? caught : null;
        setLoadError(error);
        setLoadStatus("error");
        if (error?.status === 401 && !authRefreshAttempted.current) {
          authRefreshAttempted.current = true;
          void refresh().catch(() => undefined);
        }
      });

    return () => controller.abort();
  }, [isLandlord, parsed, queryIdentity, refresh, retryKey]);

  useEffect(() => {
    if (!isLandlord || !parsed.ok) {
      setPortfolio(null);
      setPortfolioStatus("idle");
      return;
    }

    const controller = new AbortController();
    setPortfolio(null);
    setPortfolioStatus("loading");
    void loadOwnerInventory(controller.signal)
      .then((inventory) => {
        if (controller.signal.aborted || inventory === null) return;
        setPortfolio(inventory);
        setPortfolioStatus("success");
      })
      .catch(() => {
        if (!controller.signal.aborted) setPortfolioStatus("error");
      });

    return () => controller.abort();
  }, [isLandlord, parsed.ok, portfolioRetryKey]);

  useEffect(() => {
    if (!isLandlord || resolvedMode !== "OPERATING") {
      setHasUnreadLeads(null);
      return;
    }

    const controller = new AbortController();
    setHasUnreadLeads(null);
    void hasUnreadLead(controller.signal)
      .then((hasUnread) => {
        if (!controller.signal.aborted) setHasUnreadLeads(hasUnread);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [isLandlord, resolvedMode, retryKey]);

  useEffect(() => {
    if (!isLandlord || draftListingId === null) {
      setDraftDetail(null);
      setDraftDetailStatus("idle");
      return;
    }

    const controller = new AbortController();
    setDraftDetail(null);
    setDraftDetailStatus("loading");
    void api.listings
      .getOwned(draftListingId, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        setDraftDetail(detail);
        setDraftDetailStatus("success");
      })
      .catch(() => {
        if (!controller.signal.aborted) setDraftDetailStatus("error");
      });

    return () => controller.abort();
  }, [draftListingId, draftRetryKey, isLandlord]);

  useEffect(
    () => () => {
      createController.current?.abort();
      duplicateController.current?.abort();
      businessStatusController.current?.abort();
    },
    []
  );

  const createDraft = useCallback(async () => {
    if (createPendingRef.current) return;
    const controller = new AbortController();
    createController.current = controller;
    createPendingRef.current = true;
    setCreatePending(true);
    setCreateFeedback(null);

    try {
      const created = await api.listings.createDraft({}, controller.signal);
      if (!controller.signal.aborted) routerPush("/landlord/listings/" + created.id);
    } catch (caught: unknown) {
      if (controller.signal.aborted) return;
      const error = caught instanceof ApiError ? caught : null;
      setCreateFeedback(createError(error));
      if (error?.status === 401) await refresh().catch(() => undefined);
    } finally {
      if (!controller.signal.aborted && createController.current === controller) {
        createPendingRef.current = false;
        setCreatePending(false);
      }
    }
  }, [refresh, routerPush]);

  const duplicateListing = useCallback(
    async (listingId: number) => {
      if (duplicatePendingId !== null) return;
      setDuplicatePendingId(listingId);
      setDuplicateFeedback(null);
      const controller = new AbortController();
      duplicateController.current = controller;
      try {
        const created = await api.listings.duplicate(listingId, controller.signal);
        if (!controller.signal.aborted) routerPush("/landlord/listings/" + created.id);
      } catch (caught: unknown) {
        if (controller.signal.aborted) return;
        setDuplicateFeedback(duplicateError(caught));
        if (caught instanceof ApiError && caught.status === 401) await refresh().catch(() => undefined);
      } finally {
        if (!controller.signal.aborted && duplicateController.current === controller) {
          duplicateController.current = null;
          setDuplicatePendingId(null);
        }
      }
    },
    [duplicatePendingId, refresh, routerPush]
  );

  const updateBusinessStatus = useCallback(
    async (listing: OwnerListingSummary, businessStatus: ListingBusinessStatus) => {
      if (businessStatusPendingId !== null || listing.businessStatus === businessStatus) return;
      setBusinessStatusPendingId(listing.id);
      setBusinessStatusFeedback(null);
      const controller = new AbortController();
      businessStatusController.current = controller;

      try {
        const updated = await api.listings.updateBusinessStatus(listing.id, { businessStatus }, controller.signal);
        const nextListing = listingSummaryFromDetail(listing, updated);
        const matchesCurrentFilters =
          (committedState.status === undefined || committedState.status === nextListing.status) &&
          (committedState.businessStatus === undefined || committedState.businessStatus === nextListing.businessStatus);
        setResult((current) =>
          current
            ? {
                ...current,
                data: current.data.flatMap((item) => {
                  if (item.id !== listing.id) return [item];
                  return matchesCurrentFilters ? [nextListing] : [];
                })
              }
            : current
        );
        setPortfolio((current) =>
          current
            ? {
                ...current,
                listings: current.listings.map((item) => (item.id === listing.id ? nextListing : item))
              }
            : current
        );
        setBusinessStatusFeedback("Đã cập nhật tình trạng phòng.");
      } catch (caught: unknown) {
        if (controller.signal.aborted) return;
        setBusinessStatusFeedback(businessStatusError(caught));
        if (caught instanceof ApiError && caught.status === 401) await refresh().catch(() => undefined);
      } finally {
        if (!controller.signal.aborted && businessStatusController.current === controller) {
          businessStatusController.current = null;
          setBusinessStatusPendingId(null);
        }
      }
    },
    [businessStatusPendingId, committedState.businessStatus, committedState.status, refresh]
  );

  const updateInspectorDetail = useCallback((detail: OwnerListingDetail) => {
    setPortfolio((current) =>
      current
        ? {
            ...current,
            listings: current.listings.map((listing) =>
              listing.id === detail.id ? listingSummaryFromDetail(listing, detail) : listing
            )
          }
        : current
    );
    setResult((current) =>
      current
        ? {
            ...current,
            data: current.data.map((listing) =>
              listing.id === detail.id ? listingSummaryFromDetail(listing, detail) : listing
            )
          }
        : current
    );
  }, []);

  const closeInspector = useCallback(() => setSelectedListingId(null), []);
  const refreshAuth = useCallback(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);
  const occupiedListingCount = inventoryListings.filter((listing) => listing.businessStatus === "RENTED").length;

  const commandBarConfig = useMemo(
    () =>
      isLandlord
        ? {
            searchValue: searchTerm,
            onSearchChange: (value: string) => setSearchTerm(value),
            searchEnabled:
              portfolioStatus === "success" &&
              inventoryListings.length > 0 &&
              (resolvedMode === "OPERATING" || resolvedMode === "UNKNOWN"),
            inventoryCount: inventoryListings.length,
            occupancyRate:
              inventoryListings.length > 0 ? (occupiedListingCount / inventoryListings.length) * 100 : null,
            onCreate: () => void createDraft(),
            createPending
          }
        : null,
    [
      createDraft,
      createPending,
      inventoryListings.length,
      isLandlord,
      occupiedListingCount,
      portfolioStatus,
      resolvedMode,
      searchTerm
    ]
  );
  useRegisterLandlordCommandBar(commandBarConfig);

  useEffect(() => {
    if (selectedListingId !== null && portfolioStatus === "success" && selectedListing === null) {
      setSelectedListingId(null);
    }
  }, [portfolioStatus, selectedListing, selectedListingId]);

  if (!mounted || authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (!parsed.ok) {
    return (
      <ErrorState
        message={parsed.message}
        action={<Button onClick={() => router.replace("/landlord")}>Đặt lại liên kết</Button>}
      />
    );
  }
  if (authStatus === "anonymous") {
    return (
      <EmptyState
        title="Đăng nhập để quản lý tin"
        description="Trang này dành cho tài khoản người cho thuê."
        action={
          <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  }
  if (authStatus === "error") {
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này. Vui lòng thử lại."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  if (!user || user.role !== "LANDLORD") {
    return (
      <EmptyState
        title="Trang này dành cho tài khoản người cho thuê"
        description="Hãy dùng tài khoản người cho thuê để tạo và quản lý tin đăng."
        action={
          <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/search">
            Tìm phòng
          </Link>
        }
      />
    );
  }
  if (loadStatus === "loading" || loadStatus === "idle") return <LoadingState message="Đang tải tin của bạn…" />;
  if (loadStatus === "error") {
    return (
      <ErrorState
        message={ownerListError(loadError)}
        requestId={loadError?.requestId}
        action={<Button onClick={() => setRetryKey((key) => key + 1)}>Thử lại</Button>}
      />
    );
  }
  if (!result || loadedQueryIdentity !== queryIdentity) return <LoadingState message="Đang cập nhật danh sách tin…" />;
  if (portfolioStatus === "loading" || portfolioStatus === "idle") {
    return <LoadingState message="Đang xác định kho tin của bạn…" />;
  }

  const inventoryCount = inventoryListings.length;
  const localSearchActive = portfolioStatus === "success" && searchTerm.trim().length > 0;
  const localSearchMatches = localSearchActive
    ? inventoryListings.filter(
        (listing) => listingMatchesOwnerQuery(listing, committedState) && listingMatchesSearch(listing, searchTerm)
      )
    : [];
  const searchPageSize = result.pagination.pageSize || ownerDefaultPageSize;
  const searchableInventoryTotal = localSearchActive ? localSearchMatches.length : result.data.length;
  const searchableInventory = localSearchActive
    ? localSearchMatches.slice((searchPage - 1) * searchPageSize, searchPage * searchPageSize)
    : result.data;
  const isEmptyResults =
    searchableInventory.length === 0 && (inventoryCount > 0 || hasCustomQuery || resolvedMode === "UNKNOWN");
  const otherListings = progressListing
    ? result.data.filter((listing) => listing.id !== progressListing.id)
    : result.data;
  const hasFilterableInventory =
    resolvedMode === "GETTING_LISTING_LIVE" ? otherListings.length > 0 : inventoryCount > 0;
  const moderationStatusCounts = ownerListingStatuses.reduce(
    (counts, status) => ({
      ...counts,
      [status]: inventoryListings.filter((listing) => listing.status === status).length
    }),
    {} as Record<ListingStatus, number>
  );
  const businessStatusCounts = ownerBusinessStatuses.reduce(
    (counts, status) => ({
      ...counts,
      [status]: inventoryListings.filter((listing) => listing.businessStatus === status).length
    }),
    {} as Record<ListingBusinessStatus, number>
  );
  const filterBaseState: OwnerQueryState = { page: 1, pageSize: committedState.pageSize };
  const allQuickFilterActive = committedState.status === undefined && committedState.businessStatus === undefined;
  const attentionCount = moderationStatusCounts.REJECTED;
  const filterControls =
    hasFilterableInventory || hasCustomQuery ? (
      <section className={styles.filterRail} aria-label="Lọc tin đăng">
        <div className={styles.quickFilterTabs} role="group" aria-label="Lọc nhanh kho phòng">
          <button
            type="button"
            data-active={allQuickFilterActive || undefined}
            aria-pressed={allQuickFilterActive}
            onClick={() => router.push(ownerListingsUrl(filterBaseState))}
          >
            Tất cả <span>{inventoryCount}</span>
          </button>
          <button
            type="button"
            data-active={committedState.businessStatus === "AVAILABLE" || undefined}
            aria-pressed={committedState.businessStatus === "AVAILABLE"}
            onClick={() => router.push(ownerListingsUrl({ ...filterBaseState, businessStatus: "AVAILABLE" }))}
          >
            <i className={styles.availableDot} aria-hidden="true" />
            Còn trống <span>{businessStatusCounts.AVAILABLE}</span>
          </button>
          <button
            type="button"
            data-active={committedState.businessStatus === "RENTED" || undefined}
            aria-pressed={committedState.businessStatus === "RENTED"}
            onClick={() => router.push(ownerListingsUrl({ ...filterBaseState, businessStatus: "RENTED" }))}
          >
            Đã cho thuê <span>{businessStatusCounts.RENTED}</span>
          </button>
          <button
            type="button"
            className={styles.attentionFilter}
            data-active={committedState.status === "REJECTED" || undefined}
            aria-pressed={committedState.status === "REJECTED"}
            onClick={() => router.push(ownerListingsUrl({ ...filterBaseState, status: "REJECTED" }))}
          >
            <i className={styles.attentionDot} aria-hidden="true" />
            Cần xử lý <span>{attentionCount}</span>
          </button>
        </div>
        <div className={styles.filterUtilities}>
          {localSearchActive ? <strong>{searchableInventoryTotal} tin khớp</strong> : null}
          <label htmlFor="owner-moderation-status-filter">
            <span>Duyệt tin:</span>
            <select
              id="owner-moderation-status-filter"
              name="status"
              aria-label="Trạng thái tin"
              value={committedState.status ?? ""}
              onChange={(event) => {
                const status = event.target.value === "" ? undefined : (event.target.value as ListingStatus);
                router.push(ownerListingsUrl(withOwnerStatus(committedState, status)));
              }}
            >
              <option value="">Mọi trạng thái ({inventoryCount})</option>
              {ownerListingStatuses.map((status) => (
                <option key={status} value={status}>
                  {listingStatusLabels[status]} ({moderationStatusCounts[status]})
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="owner-business-status-filter" className={styles.roomFilterSelect}>
            <span className="sr-only">Tình trạng phòng:</span>
            <select
              id="owner-business-status-filter"
              name="businessStatus"
              aria-label="Tình trạng phòng"
              value={committedState.businessStatus ?? ""}
              onChange={(event) => {
                const businessStatus =
                  event.target.value === "" ? undefined : (event.target.value as ListingBusinessStatus);
                router.push(ownerListingsUrl(withOwnerBusinessStatus(committedState, businessStatus)));
              }}
            >
              <option value="">Mọi tình trạng phòng</option>
              {ownerBusinessStatuses.map((businessStatus) => (
                <option key={businessStatus} value={businessStatus}>
                  {businessStatusLabels[businessStatus]} ({businessStatusCounts[businessStatus]})
                </option>
              ))}
            </select>
          </label>
          {hasCustomQuery ? (
            <Button variant="ghost" size="sm" onClick={() => router.push(ownerListingsUrl(filterBaseState))}>
              Xóa bộ lọc
            </Button>
          ) : null}
        </div>
      </section>
    ) : null;

  return (
    <div className={selectedListing ? styles.workspaceWithInspector : styles.workspaceFrame}>
      <div className={styles.ownerPage} data-workspace-state={resolvedMode}>
        {createFeedback ? (
          <p role="alert" className={styles.feedback}>
            {createFeedback}
          </p>
        ) : null}
        {duplicateFeedback ? (
          <p role="alert" className={styles.feedback}>
            {duplicateFeedback}
          </p>
        ) : null}
        {businessStatusFeedback ? (
          <p role={businessStatusFeedback.startsWith("Đã cập nhật") ? "status" : "alert"} className={styles.feedback}>
            {businessStatusFeedback}
          </p>
        ) : null}

        {resolvedMode === "EMPTY" ? (
          <EmptyOwnerLaunchpad pending={createPending} onCreate={() => void createDraft()} />
        ) : null}

        {resolvedMode === "GETTING_LISTING_LIVE" ? (
          <>
            {progressListing ? (
              <ListingProgressFeature
                listing={progressListing}
                draftDetail={draftDetail?.id === progressListing.id ? draftDetail : null}
                draftStatus={draftDetailStatus}
                onRetryDraft={() => setDraftRetryKey((key) => key + 1)}
                onCreate={() => void createDraft()}
                createPending={createPending}
              />
            ) : (
              <section className={styles.safeInventoryNotice} role="status">
                <h1>Tin đăng của bạn</h1>
                <p>Hiện chưa có tin cần hoàn thiện. Kho tin được giữ nguyên để bạn tiếp tục quản lý.</p>
              </section>
            )}
            {filterControls}
            {otherListings.length > 0 ? (
              <section className={styles.inventorySection} aria-labelledby="owner-other-listings-heading">
                <div className={styles.inventorySectionHeading}>
                  <div>
                    <span className={styles.sectionEyebrow}>CÁC TIN CÒN LẠI</span>
                    <h2 id="owner-other-listings-heading">Kho tin của bạn</h2>
                  </div>
                </div>
                <ListingInventory
                  listings={otherListings}
                  selectedListingId={selectedListingId}
                  onInspect={setSelectedListingId}
                />
              </section>
            ) : null}
            {isEmptyResults ? (
              <FilteredEmptyState
                hasCustomQuery={hasCustomQuery}
                onClear={() => router.push(ownerListingsUrl({ page: 1 }))}
              />
            ) : null}
            <OwnerPagination page={result.pagination} state={committedState} onNavigate={(url) => router.push(url)} />
          </>
        ) : null}

        {resolvedMode === "OPERATING" || resolvedMode === "UNKNOWN" ? (
          <>
            <h1 className="sr-only">Quản lý {inventoryCount} phòng cho thuê</h1>
            <div className={styles.workspaceTop}>{filterControls}</div>
            {resolvedMode === "OPERATING" ? (
              <OwnerAttentionStrip listings={inventoryListings} hasUnreadLeads={hasUnreadLeads} />
            ) : portfolioStatus === "error" ? (
              <p className={styles.neutralFallback} role="status">
                Chưa tải được toàn bộ kho tin. Bạn vẫn có thể mở các tin bên dưới.
                <button type="button" onClick={() => setPortfolioRetryKey((key) => key + 1)}>
                  Thử tải lại
                </button>
              </p>
            ) : null}
            {searchableInventory.length > 0 ? (
              <section className={styles.inventorySection} aria-labelledby="owner-inventory-heading">
                <div className={styles.inventorySectionHeading}>
                  <div>
                    <span className={styles.sectionEyebrow}>
                      {resolvedMode === "OPERATING" ? "CHỖ Ở CỦA BẠN" : "DANH SÁCH TIN"}
                    </span>
                    <h2 id="owner-inventory-heading">Kho tin</h2>
                  </div>
                  <span className={styles.inventoryCount}>{inventoryCount} tin</span>
                </div>
                <ListingInventory
                  listings={searchableInventory}
                  selectedListingId={selectedListingId}
                  onInspect={setSelectedListingId}
                />
              </section>
            ) : (
              <FilteredEmptyState
                hasCustomQuery={hasCustomQuery || localSearchActive}
                searchQuery={localSearchActive}
                onClear={() => router.push(ownerListingsUrl({ page: 1 }))}
                onClearSearch={() => setSearchTerm("")}
              />
            )}
            {localSearchActive ? (
              <LocalSearchPagination
                page={searchPage}
                hasNextPage={
                  searchPage * (result.pagination.pageSize || ownerDefaultPageSize) < searchableInventoryTotal
                }
                onNavigate={setSearchPage}
              />
            ) : (
              <OwnerPagination page={result.pagination} state={committedState} onNavigate={(url) => router.push(url)} />
            )}
          </>
        ) : null}
      </div>
      {selectedListing ? (
        <OwnerListingInspector
          listing={selectedListing}
          onClose={closeInspector}
          onDuplicate={() => void duplicateListing(selectedListing.id)}
          duplicatePending={duplicatePendingId === selectedListing.id}
          onBusinessStatusChange={(status) => void updateBusinessStatus(selectedListing, status)}
          businessStatusPending={businessStatusPendingId === selectedListing.id}
          onDetailChange={updateInspectorDetail}
          onAuthRefresh={refreshAuth}
        />
      ) : null}
    </div>
  );
}

function FilteredEmptyState({
  hasCustomQuery,
  searchQuery,
  onClear,
  onClearSearch
}: {
  readonly hasCustomQuery: boolean;
  readonly searchQuery?: boolean;
  readonly onClear: () => void;
  readonly onClearSearch?: () => void;
}) {
  const searchOnly = searchQuery === true;
  return (
    <section className={styles.filteredEmpty} aria-labelledby="owner-filter-empty-heading">
      <span className={styles.filteredEmptyIcon} aria-hidden="true">
        <Icon name="search" />
      </span>
      <div>
        <h2 id="owner-filter-empty-heading">
          {searchOnly
            ? "Không tìm thấy tin phù hợp"
            : hasCustomQuery
              ? "Không có tin khớp với bộ lọc này"
              : "Không có tin trên trang này"}
        </h2>
        <p>
          {searchOnly
            ? "Thử tên tin, khu vực hoặc loại phòng khác."
            : hasCustomQuery
              ? "Thử trạng thái khác hoặc xem lại toàn bộ kho tin."
              : "Chọn trang khác để tiếp tục xem tin đăng."}
        </p>
      </div>
      {searchOnly ? (
        <Button variant="outline" size="sm" onClick={onClearSearch}>
          Xóa tìm kiếm
        </Button>
      ) : hasCustomQuery ? (
        <Button variant="outline" size="sm" onClick={onClear}>
          Xóa bộ lọc
        </Button>
      ) : null}
    </section>
  );
}
