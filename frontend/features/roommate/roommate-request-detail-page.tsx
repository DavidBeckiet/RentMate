"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { TextareaField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { RoommateRequest } from "../../types/api";
import { roommateErrorMessage, roommateRequestStatusLabels } from "./roommate-content";
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

const maximumId = 2_147_483_647;

function parseId(value: string): number | null {
  if (!/^[1-9][0-9]*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximumId ? parsed : null;
}

function InterestComposer({ requestId }: Readonly<{ requestId: number }>) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) {
      setError("Hãy viết lời nhắn mở đầu trước khi gửi lời quan tâm.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const interest = await api.roommates.createInterest(requestId, message.trim());
      router.push(`/roommates/conversations/${interest.id}`);
    } catch (caught) {
      setError(roommateErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="space-y-4" aria-labelledby="roommate-interest-heading">
      <div>
        <h2 id="roommate-interest-heading" className="font-display text-heading-sm font-bold">
          Gửi lời quan tâm
        </h2>
        <p className="mt-2 text-ui-sm leading-6 text-rent-secondary">
          Lời nhắn mở đầu sẽ tạo một cuộc trò chuyện trong RentMate.
        </p>
      </div>
      <form className="space-y-4" onSubmit={(event) => void submit(event)} noValidate>
        <TextareaField
          id={`roommate-interest-message-${requestId}`}
          name="message"
          label="Lời nhắn mở đầu"
          hint="Không chia sẻ thông tin liên hệ, OTP hoặc thông tin tài chính."
          required
          maxLength={2000}
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        {error ? (
          <p role="alert" className="border-l-4 border-rose-700 pl-3 text-ui-sm font-semibold text-rose-800">
            {error}
          </p>
        ) : null}
        <Button type="submit" pending={pending} pendingLabel="Đang gửi…">
          <Icon name="userPlus" className="h-4 w-4" /> Gửi lời quan tâm
        </Button>
      </form>
    </Card>
  );
}

function RequestDetailContent({ requestId }: Readonly<{ requestId: number }>) {
  const { status: authStatus, user } = useAuth();
  const tenantReady = authStatus === "authenticated" && user?.role === "TENANT" && user.isActive;
  const [request, setRequest] = useState<RoommateRequest | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!tenantReady) return;
    const controller = new AbortController();
    setState("loading");
    setError(null);
    void Promise.all([
      api.roommates.getRequest(requestId, controller.signal),
      api.roommates.listMine({ page: 1, pageSize: 50 }, controller.signal)
    ])
      .then(([detail, mine]) => {
        if (!controller.signal.aborted) {
          setRequest(detail);
          setIsOwner(mine.data.some((item) => item.id === detail.id));
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
  }, [requestId, retryKey, tenantReady]);

  if (state === "loading") return <LoadingState message="Đang tải yêu cầu ở ghép…" />;
  if (state === "error" || !request) {
    return (
      <ErrorState
        message={roommateErrorMessage(error)}
        requestId={error?.requestId}
        action={<Button onClick={() => setRetryKey((key) => key + 1)}>Thử lại</Button>}
      />
    );
  }

  const canStartInterest =
    !isOwner &&
    request.status === "OPEN" &&
    request.signals.profileCompleted &&
    request.signals.listingCurrentlyAvailable !== false;

  return (
    <div className="space-y-6">
      <RoommatePageHeader
        title="Chi tiết yêu cầu ở ghép"
        description="Xem các thông tin công khai cần thiết cho bối cảnh ở ghép. Không có thông tin liên hệ hoặc địa chỉ chính xác trong màn hình này."
      />
      <RoommateSubnav />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
        <div className="space-y-5">
          <Card className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-ui-xs font-bold uppercase tracking-[0.12em] text-rent-secondary">YÊU CẦU Ở GHÉP</p>
                <h2 className="mt-1 font-display text-heading-sm font-bold">
                  {roommateRequestStatusLabels[request.status]}
                </h2>
              </div>
              {isOwner ? (
                <span className="border-2 border-heroDark-950 bg-rent-accent px-2 py-1 text-ui-xs font-bold">
                  Của bạn
                </span>
              ) : null}
            </div>
            <RoommateProfileSummary profile={request.profile} heading="Hồ sơ người đăng" />
            <RoommateRequestFacts request={request} />
            {request.note ? (
              <p className="whitespace-pre-wrap border-l-4 border-heroDark-950 pl-3 text-ui-sm leading-6 text-rent-secondary">
                {request.note}
              </p>
            ) : null}
            <RoommateListingContext request={request} />
          </Card>
          <RoommateSafetyNotice kind="long" />
          <RoommateSafetyNotice kind="checklist" />
          {isOwner ? (
            <Card className="space-y-3">
              <h2 className="font-display text-heading-sm font-bold">Quản lý yêu cầu</h2>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="inline-flex min-h-11 items-center border-2 border-heroDark-950 bg-heroDark-950 px-4 text-ui-sm font-bold text-white shadow-glass-sm"
                  href="/roommates/my-request"
                >
                  Chỉnh sửa yêu cầu
                </Link>
                {request.status === "OPEN" ? (
                  <Link
                    className="inline-flex min-h-11 items-center border-2 border-heroDark-950 bg-rent-surface px-4 text-ui-sm font-bold shadow-glass-sm"
                    href={`/roommates/interests?requestId=${request.id}`}
                  >
                    Xem lời quan tâm
                  </Link>
                ) : null}
              </div>
            </Card>
          ) : canStartInterest ? (
            <InterestComposer requestId={request.id} />
          ) : (
            <EmptyState
              title="Không thể gửi lời quan tâm lúc này"
              description={
                request.signals.listingCurrentlyAvailable === false
                  ? "Listing trong yêu cầu này hiện không còn khả dụng cho tương tác mới."
                  : "Yêu cầu này không còn mở hoặc hồ sơ hiện không khả dụng."
              }
            />
          )}
        </div>
        <aside className="space-y-4" aria-label="Thao tác an toàn">
          {!isOwner ? (
            <>
              <RoommateBlockControl context="request" id={request.id} />
              <RoommateReportControl target="ROOMMATE_PROFILE" requestId={request.id} label="Báo cáo hồ sơ" />
              <RoommateReportControl target="ROOMMATE_REQUEST" requestId={request.id} label="Báo cáo yêu cầu" />
            </>
          ) : null}
          <Card subtle>
            <h2 className="font-display text-ui-base font-bold">Ghi nhớ</h2>
            <p className="mt-2 text-ui-sm leading-6 text-rent-secondary">
              Accept không phải là sự đồng ý chia sẻ email, số điện thoại hoặc thông tin tài chính.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export function RoommateRequestDetailPage({ requestId }: Readonly<{ requestId: string }>) {
  const parsedId = useMemo(() => parseId(requestId), [requestId]);
  return (
    <RoommateTenantBoundary>
      {parsedId ? (
        <RequestDetailContent requestId={parsedId} />
      ) : (
        <ErrorState message="Yêu cầu ở ghép hiện không còn khả dụng." />
      )}
    </RoommateTenantBoundary>
  );
}
