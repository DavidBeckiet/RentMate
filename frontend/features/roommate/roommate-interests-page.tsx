"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Pagination } from "../../components/ui/pagination";
import { Icon } from "../../components/ui/icon";
import { formatAreaLabel } from "../../lib/area";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, RoommateInterest } from "../../types/api";
import {
  formatRoommateMoney,
  isTerminalRoommateInterest,
  roommateErrorMessage,
  roommateInterestStatusLabels
} from "./roommate-content";
import styles from "./roommate-interests.module.css";
import {
  RoommateBlockControl,
  RoommateAvatar,
  RoommateListingContext,
  RoommatePageHeader,
  RoommateProfileSummary,
  RoommateReportControl,
  RoommateRequestFacts,
  RoommateSafetyNotice,
  RoommateStatusPill,
  RoommateTenantBoundary
} from "./roommate-shared";

type InterestTab = "incoming" | "outgoing";

function parseRequestId(value: string | null): number | null {
  if (!value || !/^[1-9][0-9]*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 2_147_483_647 ? parsed : null;
}

function interestAreaLabel(interest: RoommateInterest): string {
  const { listing, preferredAreaKeys } = interest.request;
  if (listing?.areaName) return formatAreaLabel(listing.areaName);

  const preferredAreas = preferredAreaKeys.map(formatAreaLabel).join(" · ");
  return preferredAreas || "Khu vực đang trao đổi";
}

function InterestCard({
  interest,
  tab,
  onAction
}: Readonly<{ interest: RoommateInterest; tab: InterestTab; onAction: () => void }>) {
  const router = useRouter();
  const [action, setAction] = useState<"accept" | "reject" | "withdraw" | null>(null);
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAction = async (next: "accept" | "reject" | "withdraw") => {
    if (action) return;
    setAction(next);
    setError(null);
    try {
      if (next === "accept") {
        await api.roommates.acceptInterest(interest.id);
        router.push("/roommates/connection");
        return;
      }
      if (next === "reject") await api.roommates.rejectInterest(interest.id);
      else await api.roommates.withdrawInterest(interest.id);
      onAction();
    } catch (caught) {
      setError(roommateErrorMessage(caught));
    } finally {
      setAction(null);
    }
  };

  const canOpenConversation =
    interest.status === "PENDING" || interest.status === "ACCEPTED" || isTerminalRoommateInterest(interest.status);
  return (
    <article
      className={`rm-roommate-card ${styles.card}`}
      data-status={interest.status}
      aria-labelledby={`interest-person-${interest.id}`}
    >
      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <div className={styles.person}>
            <span className={styles.avatarFrame}>
              <RoommateAvatar displayName={interest.counterpart?.displayName ?? null} />
            </span>
            <div className="min-w-0">
              <h2 id={`interest-person-${interest.id}`} className={styles.name}>
                {interest.counterpart?.displayName ?? "Thành viên RentMate"}
              </h2>
              <p className={styles.date}>
                Cập nhật{" "}
                {new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(interest.updatedAt))}
              </p>
            </div>
          </div>
          <RoommateStatusPill status={interest.status} label={roommateInterestStatusLabels[interest.status]} />
        </div>
        <div className={styles.context}>
          <p>
            <Icon name="pin" /> <span>{interestAreaLabel(interest)}</span>
          </p>
          <p>
            <Icon name="home" />
            <span>
              {formatRoommateMoney(interest.request.budgetMinPerPerson)} –{" "}
              {formatRoommateMoney(interest.request.budgetMaxPerPerson)}
              <small> / người / tháng</small>
            </span>
          </p>
        </div>
        {interest.initialMessage ? (
          <section className={styles.message}>
            <h3>
              <Icon name="message" /> Lời nhắn mở đầu
            </h3>
            <p>{interest.initialMessage.body}</p>
          </section>
        ) : (
          <p className={styles.noMessage}>Mở cuộc trò chuyện để xem nội dung trao đổi.</p>
        )}
        <details className={styles.details}>
          <summary>
            Hồ sơ & nhu cầu ở ghép <Icon name="chevronDown" />
          </summary>
          <div className={styles.detailBody}>
            <div className={styles.profileSummary}>
              <RoommateProfileSummary
                profile={interest.counterpart}
                heading="Lối sống & thói quen"
                showAvatar={false}
                showDisplayName={false}
                compact
              />
            </div>
            <RoommateRequestFacts request={interest.request} showBudget={false} showAreas={false} />
            <RoommateListingContext request={interest.request} />
            <div className={styles.safetyActions}>
              <RoommateReportControl target="ROOMMATE_PROFILE" interestId={interest.id} label="Báo cáo" />
              <RoommateBlockControl context="interest" id={interest.id} onBlocked={onAction} />
            </div>
          </div>
        </details>
        {error && !confirmAccept ? (
          <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          {canOpenConversation ? (
            <Link className={styles.chatLink} href={`/roommates/messages?roommate=${interest.id}`}>
              <Icon name="message" />{" "}
              {isTerminalRoommateInterest(interest.status) ? "Xem lịch sử trò chuyện" : "Nhắn tin"}
            </Link>
          ) : null}
          {tab === "incoming" && interest.status === "PENDING" ? (
            <div className={styles.decisions}>
              {confirmAccept ? (
                <Dialog
                  open={confirmAccept}
                  title="Chấp nhận lời quan tâm?"
                  description="Hãy xem lại điều gì sẽ xảy ra trước khi tạo kết nối hiện tại."
                  onClose={() => setConfirmAccept(false)}
                >
                  <div className="space-y-4">
                    <section className={styles.acceptNotice} aria-label="Xác nhận chấp nhận lời quan tâm">
                      <div>
                        <h3 className="font-display text-ui-base font-bold">Điều gì xảy ra khi chấp nhận?</h3>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-ui-sm font-semibold leading-6">
                          <li>Hai bạn sẽ có một kết nối tìm roommate hiện tại.</li>
                          <li>
                            Yêu cầu này chuyển sang trạng thái đã ghép; các tương tác đang chờ khác có thể kết thúc.
                          </li>
                          <li>Đây không phải đặt chỗ, phê duyệt của chủ nhà hoặc bảo đảm thuê nhà.</li>
                        </ul>
                      </div>
                      <RoommateSafetyNotice kind="long" />
                      <RoommateSafetyNotice kind="checklist" />
                    </section>
                    {error ? (
                      <p role="alert" className="text-ui-sm text-danger">
                        {error}
                      </p>
                    ) : null}
                    <div className="grid gap-2 sm:flex sm:flex-wrap">
                      <Button
                        autoFocus
                        pending={action === "accept"}
                        pendingLabel="Đang chấp nhận…"
                        onClick={() => void runAction("accept")}
                      >
                        Xác nhận chấp nhận
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={action === "accept"}
                        onClick={() => setConfirmAccept(false)}
                      >
                        Quay lại
                      </Button>
                    </div>
                  </div>
                </Dialog>
              ) : (
                <div className={styles.decisions}>
                  <Button size="sm" disabled={action !== null} onClick={() => setConfirmAccept(true)}>
                    Chấp nhận
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={action !== null}
                    pending={action === "reject"}
                    pendingLabel="Đang từ chối…"
                    onClick={() => void runAction("reject")}
                  >
                    Từ chối
                  </Button>
                </div>
              )}
            </div>
          ) : null}
          {tab === "outgoing" && interest.status === "PENDING" ? (
            <Button
              variant="ghost"
              size="sm"
              pending={action === "withdraw"}
              pendingLabel="Đang rút…"
              onClick={() => void runAction("withdraw")}
            >
              Rút lời quan tâm
            </Button>
          ) : null}
          {interest.status === "ACCEPTED" ? (
            <Link className={styles.connectionLink} href="/roommates/connection">
              Mở kết nối hiện tại
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function InterestsContent() {
  const { status: authStatus, user } = useAuth();
  const searchParams = useSearchParams();
  const tenantReady = authStatus === "authenticated" && user?.role === "TENANT" && user.isActive;
  const initialTab: InterestTab = searchParams.get("tab") === "outgoing" ? "outgoing" : "incoming";
  const requestedRequestId = parseRequestId(searchParams.get("requestId"));
  const [tab, setTab] = useState<InterestTab>(initialTab);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<RoommateInterest> | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setTab(initialTab);
    setPage(1);
  }, [initialTab]);

  useEffect(() => {
    if (!tenantReady) return;
    const controller = new AbortController();
    setState("loading");
    setError(null);
    const load = async () => {
      if (tab === "outgoing") {
        return api.roommates.listInterests({ direction: "OUTGOING", page, pageSize: 20 }, controller.signal);
      }
      if (requestedRequestId) {
        const own = await api.roommates.listMine({ page: 1, pageSize: 50 }, controller.signal);
        const request = own.data.find((item) => item.id === requestedRequestId);
        if (!request) {
          return { data: [], pagination: { page: 1, pageSize: 20, hasNextPage: false } } as ApiPage<RoommateInterest>;
        }
        return api.roommates.listIncoming(request.id, { page, pageSize: 20 }, controller.signal);
      }
      return api.roommates.listInterests({ direction: "INCOMING", page, pageSize: 20 }, controller.signal);
    };
    void load()
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          setState("success");
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof ApiError ? caught : null);
          setState("error");
        }
      });
    return () => controller.abort();
  }, [page, reloadKey, requestedRequestId, tab, tenantReady]);

  return (
    <div className={`rm-roommate-page ${styles.page}`}>
      <RoommatePageHeader
        title="Lời quan tâm"
        description="Gặp người cùng nhu cầu. Trò chuyện trước, kết nối khi thấy phù hợp."
        action={
          <Link className={styles.inboxLink} href="/inquiries?kind=ROOMMATE">
            <Icon name="message" /> Mở tin nhắn <Icon name="arrowUpRight" />
          </Link>
        }
      />
      <div className={styles.toolbar}>
        <div
          className={styles.tabs}
          role="tablist"
          aria-label="Loại lời quan tâm"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? "incoming"
                : event.key === "End"
                  ? "outgoing"
                  : tab === "incoming"
                    ? "outgoing"
                    : "incoming";
            setTab(next);
            setPage(1);
            document.getElementById(`roommate-tab-${next}`)?.focus();
          }}
        >
          <Button
            id="roommate-tab-incoming"
            variant={tab === "incoming" ? "primary" : "outline"}
            role="tab"
            tabIndex={tab === "incoming" ? 0 : -1}
            aria-selected={tab === "incoming"}
            aria-controls="roommate-interest-panel"
            onClick={() => {
              setTab("incoming");
              setPage(1);
            }}
          >
            <Icon name="mail" /> Nhận được
          </Button>
          <Button
            id="roommate-tab-outgoing"
            variant={tab === "outgoing" ? "primary" : "outline"}
            role="tab"
            tabIndex={tab === "outgoing" ? 0 : -1}
            aria-selected={tab === "outgoing"}
            aria-controls="roommate-interest-panel"
            onClick={() => {
              setTab("outgoing");
              setPage(1);
            }}
          >
            <Icon name="send" /> Đã gửi
          </Button>
        </div>
        <p className={styles.tabHint}>
          {tab === "incoming" ? "Những người muốn tìm hiểu bạn" : "Những lời chào bạn đã gửi đi"}
        </p>
      </div>
      <div
        id="roommate-interest-panel"
        role="tabpanel"
        aria-labelledby={tab === "incoming" ? "roommate-tab-incoming" : "roommate-tab-outgoing"}
        tabIndex={0}
      >
        {state === "idle" || state === "loading" ? <LoadingState message="Đang tải lời quan tâm…" /> : null}
        {state === "error" ? (
          <ErrorState
            message={roommateErrorMessage(error)}
            requestId={error?.requestId}
            action={<Button onClick={() => setReloadKey((value) => value + 1)}>Thử lại</Button>}
          />
        ) : null}
        {state === "success" && result && result.data.length === 0 ? (
          <EmptyState
            title={tab === "incoming" ? "Chưa có lời quan tâm" : "Bạn chưa gửi lời quan tâm nào"}
            description={
              tab === "incoming"
                ? "Các lời quan tâm mới sẽ xuất hiện tại đây."
                : "Duyệt yêu cầu đang mở để gửi lời nhắn mở đầu."
            }
            action={
              <Link
                className="font-bold underline decoration-2 underline-offset-4"
                href={tab === "incoming" ? "/roommates/my-request" : "/roommates"}
              >
                {tab === "incoming" ? "Xem yêu cầu của tôi" : "Khám phá yêu cầu ở ghép"}
              </Link>
            }
          />
        ) : null}
        {state === "success" && result && result.data.length > 0 ? (
          <div className="space-y-5">
            {([true, false] as const).map((pending) => {
              const items = result.data.filter((interest) => (interest.status === "PENDING") === pending);
              if (!items.length) return null;
              return (
                <section key={String(pending)} className={styles.group} aria-labelledby={`interests-group-${pending}`}>
                  <div className={styles.groupHeading}>
                    <h2 id={`interests-group-${pending}`}>
                      {pending
                        ? tab === "incoming"
                          ? "Đang chờ bạn phản hồi"
                          : "Đang chờ phản hồi"
                        : "Đã phản hồi & lịch sử"}
                    </h2>
                    <span>{items.length} trên trang này</span>
                  </div>
                  <div className={styles.grid}>
                    {items.map((interest) => (
                      <InterestCard
                        key={interest.id}
                        interest={interest}
                        tab={tab}
                        onAction={() => setReloadKey((value) => value + 1)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            {result.pagination.hasNextPage || result.pagination.page > 1 ? (
              <Pagination
                compact
                ariaLabel="Phân trang lời quan tâm ở ghép"
                page={result.pagination.page}
                hasNextPage={result.pagination.hasNextPage}
                onPrevious={() => setPage((value) => Math.max(1, value - 1))}
                onNext={() => setPage((value) => value + 1)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RoommateInterestsPage() {
  return (
    <RoommateTenantBoundary>
      <InterestsContent />
    </RoommateTenantBoundary>
  );
}
