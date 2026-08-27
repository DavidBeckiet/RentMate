"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, RoommateInterest } from "../../types/api";
import { isTerminalRoommateInterest, roommateErrorMessage, roommateInterestStatusLabels } from "./roommate-content";
import {
  RoommateBlockControl,
  RoommateListingContext,
  RoommatePageHeader,
  RoommateProfileSummary,
  RoommateReportControl,
  RoommateRequestFacts,
  RoommateSafetyNotice,
  RoommateSubnav,
  RoommateTenantBoundary
} from "./roommate-shared";

type InterestTab = "incoming" | "outgoing";

function parseRequestId(value: string | null): number | null {
  if (!value || !/^[1-9][0-9]*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 2_147_483_647 ? parsed : null;
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
    <article className="space-y-4 border-2 border-heroDark-950 bg-rent-surface p-5 shadow-glass">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-ui-xs font-bold uppercase tracking-[0.12em] text-rent-secondary">
            {tab === "incoming" ? "LỜI QUAN TÂM NHẬN ĐƯỢC" : "LỜI QUAN TÂM ĐÃ GỬI"}
          </p>
          <h2 className="mt-1 font-display text-heading-sm font-bold">
            {roommateInterestStatusLabels[interest.status]}
          </h2>
        </div>
        <Link
          className="text-ui-sm font-bold underline decoration-2 underline-offset-4"
          href={`/roommates/conversations/${interest.id}`}
        >
          Mở cuộc trò chuyện
        </Link>
      </div>
      <RoommateProfileSummary profile={interest.counterpart} heading="Hồ sơ người còn lại" />
      <RoommateRequestFacts request={interest.request} />
      <RoommateListingContext request={interest.request} />
      {interest.initialMessage ? (
        <section className="border-l-4 border-heroDark-950 bg-rent-canvas px-3 py-3">
          <h3 className="text-ui-xs font-bold uppercase tracking-wide text-rent-secondary">Lời nhắn mở đầu</h3>
          <p className="mt-2 whitespace-pre-wrap text-ui-sm leading-6 text-heroDark-950">
            {interest.initialMessage.body}
          </p>
        </section>
      ) : null}
      {error ? (
        <p role="alert" className="border-l-4 border-rose-700 pl-3 text-ui-sm font-semibold text-rose-800">
          {error}
        </p>
      ) : null}
      {tab === "incoming" && interest.status === "PENDING" ? (
        <div className="space-y-4 border-t-2 border-heroDark-950 pt-4">
          {confirmAccept ? (
            <section
              className="space-y-4 border-2 border-heroDark-950 bg-rent-yellow p-4"
              aria-label="Xác nhận chấp nhận lời quan tâm"
            >
              <p className="text-ui-sm font-semibold leading-6">
                Trước khi chấp nhận, hãy kiểm tra kỹ thông tin và chỉ tiếp tục khi bạn thấy phù hợp.
              </p>
              <RoommateSafetyNotice kind="long" />
              <RoommateSafetyNotice kind="checklist" />
              <div className="flex flex-wrap gap-2">
                <Button
                  pending={action === "accept"}
                  pendingLabel="Đang chấp nhận…"
                  onClick={() => void runAction("accept")}
                >
                  Xác nhận chấp nhận
                </Button>
                <Button variant="secondary" disabled={action === "accept"} onClick={() => setConfirmAccept(false)}>
                  Quay lại
                </Button>
              </div>
            </section>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setConfirmAccept(true)}>Chấp nhận</Button>
              <Button
                variant="outline"
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
          variant="outline"
          pending={action === "withdraw"}
          pendingLabel="Đang rút…"
          onClick={() => void runAction("withdraw")}
        >
          Rút lời quan tâm
        </Button>
      ) : null}
      {interest.status === "ACCEPTED" ? (
        <Link
          className="inline-flex min-h-11 items-center border-2 border-heroDark-950 bg-heroDark-950 px-4 text-ui-sm font-bold text-white shadow-glass-sm"
          href="/roommates/connection"
        >
          Mở kết nối hiện tại
        </Link>
      ) : null}
      <div className="flex flex-wrap gap-2 border-t-2 border-heroDark-950 pt-4">
        {canOpenConversation ? (
          <Link
            className="text-ui-sm font-bold underline decoration-2 underline-offset-4"
            href={`/roommates/conversations/${interest.id}`}
          >
            Xem lịch sử trò chuyện
          </Link>
        ) : null}
        <RoommateReportControl target="ROOMMATE_PROFILE" interestId={interest.id} label="Báo cáo" />
        <RoommateBlockControl context="interest" id={interest.id} onBlocked={onAction} />
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
    <div className="space-y-6">
      <RoommatePageHeader
        title="Lời quan tâm"
        description="Quản lý lời quan tâm nhận được hoặc đã gửi. Chỉ chấp nhận sau khi xem checklist an toàn và tự xác nhận điều kiện phù hợp."
      />
      <RoommateSubnav />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Loại lời quan tâm">
        <Button
          variant={tab === "incoming" ? "primary" : "outline"}
          role="tab"
          aria-selected={tab === "incoming"}
          onClick={() => {
            setTab("incoming");
            setPage(1);
          }}
        >
          Nhận được
        </Button>
        <Button
          variant={tab === "outgoing" ? "primary" : "outline"}
          role="tab"
          aria-selected={tab === "outgoing"}
          onClick={() => {
            setTab("outgoing");
            setPage(1);
          }}
        >
          Đã gửi
        </Button>
      </div>
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
        />
      ) : null}
      {state === "success" && result && result.data.length > 0 ? (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            {result.data.map((interest) => (
              <InterestCard
                key={interest.id}
                interest={interest}
                tab={tab}
                onAction={() => setReloadKey((value) => value + 1)}
              />
            ))}
          </div>
          <Pagination
            ariaLabel="Phân trang lời quan tâm ở ghép"
            page={result.pagination.page}
            hasNextPage={result.pagination.hasNextPage}
            onPrevious={() => setPage((value) => Math.max(1, value - 1))}
            onNext={() => setPage((value) => value + 1)}
          />
        </div>
      ) : null}
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
