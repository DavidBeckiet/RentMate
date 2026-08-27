"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { TextareaField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, RoommateInterest, RoommateMessage } from "../../types/api";
import {
  formatRoommateDateTime,
  isTerminalRoommateInterest,
  paymentOrContactHint,
  roommateErrorMessage,
  roommateInterestStatusLabels
} from "./roommate-content";
import {
  RoommateBlockControl,
  RoommateListingContext,
  RoommatePageHeader,
  RoommateProfileSummary,
  RoommateReportControl,
  RoommateSafetyNotice,
  RoommateSubnav,
  RoommateTenantBoundary
} from "./roommate-shared";

function parseInterestId(value: string): number | null {
  if (!/^[1-9][0-9]*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 2_147_483_647 ? parsed : null;
}

function MessageBubble({ message }: Readonly<{ message: RoommateMessage }>) {
  const self = message.sender === "SELF";
  const body =
    message.body === "This message is no longer available." ? "Tin nhắn này hiện không còn hiển thị." : message.body;
  return (
    <article
      className={`max-w-[42rem] border-2 border-heroDark-950 p-3 shadow-glass-sm ${self ? "ml-auto bg-rent-accent" : "mr-auto bg-rent-surface"}`}
    >
      <p className="whitespace-pre-wrap break-words text-ui-sm leading-6 text-heroDark-950">{body}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-ui-xs font-semibold text-rent-secondary">
        <time dateTime={message.createdAt}>{formatRoommateDateTime(message.createdAt)}</time>
        <span>{self ? (message.isRead ? "Đã đọc" : "Đã gửi") : "Người còn lại"}</span>
      </div>
      {!self ? (
        <div className="mt-3">
          <RoommateReportControl target="ROOMMATE_MESSAGE" messageId={message.id} label="Báo cáo tin nhắn" />
        </div>
      ) : null}
    </article>
  );
}

function ConversationContent({ interestId }: Readonly<{ interestId: number }>) {
  const { status: authStatus, user } = useAuth();
  const tenantReady = authStatus === "authenticated" && user?.role === "TENANT" && user.isActive;
  const [interest, setInterest] = useState<RoommateInterest | null>(null);
  const [messages, setMessages] = useState<readonly RoommateMessage[]>([]);
  const [messagePage, setMessagePage] = useState(1);
  const [messagePagination, setMessagePagination] = useState<ApiPage<RoommateMessage>["pagination"]>({
    page: 1,
    pageSize: 100,
    hasNextPage: false
  });
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantReady) return;
    const controller = new AbortController();
    setState("loading");
    setError(null);
    void Promise.all([
      api.roommates.getInterest(interestId, controller.signal),
      api.roommates.listMessages(interestId, { page: messagePage, pageSize: 100 }, controller.signal)
    ])
      .then(([interestValue, page]) => {
        if (controller.signal.aborted) return;
        setInterest(interestValue);
        setMessages(page.data);
        setMessagePagination(page.pagination);
        setState("success");
        void api.roommates.markMessagesRead(interestId).catch(() => undefined);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof ApiError ? caught : null);
          setState("error");
        }
      });
    return () => controller.abort();
  }, [interestId, messagePage, retryKey, tenantReady]);

  const writable = interest?.status === "PENDING" || interest?.status === "ACCEPTED";
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body.trim()) {
      setSendError("Hãy nhập tin nhắn trước khi gửi.");
      return;
    }
    setPending(true);
    setSendError(null);
    try {
      const message = await api.roommates.sendMessage(interestId, body.trim());
      if (!messagePagination.hasNextPage) setMessages((current) => [...current, message]);
      setBody("");
    } catch (caught) {
      setSendError(roommateErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  if (state === "loading") return <LoadingState message="Đang tải cuộc trò chuyện ở ghép…" />;
  if (state === "error" || !interest) {
    return (
      <ErrorState
        message={roommateErrorMessage(error)}
        requestId={error?.requestId}
        action={<Button onClick={() => setRetryKey((key) => key + 1)}>Thử lại</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <RoommatePageHeader
        title="Cuộc trò chuyện ở ghép"
        description="Trao đổi trong RentMate và tự kiểm tra điều kiện thuê trước khi giao dịch. Không dùng cuộc trò chuyện này để chia sẻ OTP, mật khẩu hoặc thông tin tài chính."
      />
      <RoommateSubnav />
      <RoommateSafetyNotice kind="short" className="sticky top-20 z-20" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.45fr)]">
        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-heroDark-950 pb-4">
              <div>
                <p className="text-ui-xs font-bold uppercase tracking-[0.12em] text-rent-secondary">TRẠNG THÁI</p>
                <h2 className="mt-1 font-display text-heading-sm font-bold">
                  {roommateInterestStatusLabels[interest.status]}
                </h2>
              </div>
              {interest.status === "ACCEPTED" ? (
                <Link
                  className="text-ui-sm font-bold underline decoration-2 underline-offset-4"
                  href="/roommates/connection"
                >
                  Mở kết nối hiện tại
                </Link>
              ) : null}
            </div>
            {messages.length === 0 ? (
              <EmptyState title="Chưa có tin nhắn nào" description="Gửi lời nhắn đầu tiên để bắt đầu trao đổi." />
            ) : null}
            <div className="space-y-3" aria-live="polite" aria-label="Tin nhắn ở ghép">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
            {messagePagination.hasNextPage || messagePage > 1 ? (
              <Pagination
                ariaLabel="Phân trang tin nhắn ở ghép"
                page={messagePagination.page}
                hasNextPage={messagePagination.hasNextPage}
                onPrevious={() => setMessagePage((current) => Math.max(1, current - 1))}
                onNext={() => setMessagePage((current) => current + 1)}
              />
            ) : null}
          </Card>
          {writable ? (
            <Card>
              <form className="space-y-4" onSubmit={(event) => void submit(event)} noValidate>
                <TextareaField
                  id={`roommate-message-${interest.id}`}
                  name="message"
                  label="Tin nhắn"
                  required
                  maxLength={2000}
                  rows={5}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
                {paymentOrContactHint(body) ? (
                  <p
                    role="note"
                    className="border-l-4 border-heroDark-950 bg-rent-yellow pl-3 py-2 text-ui-sm font-semibold leading-6"
                  >
                    {
                      "Không chia sẻ OTP, mật khẩu hoặc thông tin tài chính. Thận trọng với yêu cầu chuyển tiền hoặc đặt cọc."
                    }
                  </p>
                ) : null}
                {sendError ? (
                  <p role="alert" className="border-l-4 border-rose-700 pl-3 text-ui-sm font-semibold text-rose-800">
                    {sendError}
                  </p>
                ) : null}
                <Button type="submit" pending={pending} pendingLabel="Đang gửi…">
                  <Icon name="message" className="h-4 w-4" /> Gửi tin nhắn
                </Button>
              </form>
            </Card>
          ) : (
            <Card className="border-rose-700 bg-rose-50">
              <h2 className="font-display text-ui-base font-bold">Cuộc trò chuyện chỉ đọc</h2>
              <p className="mt-2 text-ui-sm leading-6 text-rent-secondary">
                {isTerminalRoommateInterest(interest.status)
                  ? "Lời quan tâm này đã kết thúc nên không thể gửi thêm tin nhắn."
                  : "Cuộc trò chuyện này hiện không thể nhận tin nhắn mới."}
              </p>
            </Card>
          )}
        </div>
        <aside className="space-y-4" aria-label="Thông tin và an toàn ở ghép">
          <RoommateProfileSummary profile={interest.counterpart} heading="Hồ sơ người còn lại" />
          <RoommateListingContext request={interest.request} />
          <RoommateSafetyNotice kind="checklist" />
          <div className="flex flex-wrap gap-2">
            <RoommateReportControl target="ROOMMATE_PROFILE" interestId={interest.id} label="Báo cáo" />
            <RoommateBlockControl context="interest" id={interest.id} onBlocked={() => setRetryKey((key) => key + 1)} />
          </div>
        </aside>
      </div>
    </div>
  );
}

export function RoommateConversationPage({ interestId }: Readonly<{ interestId: string }>) {
  const parsedId = useMemo(() => parseInterestId(interestId), [interestId]);
  return (
    <RoommateTenantBoundary>
      {parsedId ? (
        <ConversationContent interestId={parsedId} />
      ) : (
        <ErrorState message="Cuộc trò chuyện ở ghép hiện không còn khả dụng." />
      )}
    </RoommateTenantBoundary>
  );
}
