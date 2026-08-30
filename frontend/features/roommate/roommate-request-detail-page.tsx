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
import type { RoommateAiCompatibilityExplanation, RoommateRequest } from "../../types/api";
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
import {
  RoommateCompatibilitySummary,
  roommateCompatibilityDimensionLabels,
  roommateCompatibilityExplanation
} from "./roommate-v2";

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
        <p aria-live="polite" className="text-right text-ui-xs font-semibold text-rent-secondary">
          {Array.from(message).length}/2000 ký tự
        </p>
        {error ? (
          <p role="alert" className="border-l-4 border-rose-700 pl-3 text-ui-sm font-semibold text-rose-800">
            {error}
          </p>
        ) : null}
        <Button className="w-full sm:w-auto" type="submit" pending={pending} pendingLabel="Đang gửi…">
          <Icon name="userPlus" className="h-4 w-4" /> Gửi lời quan tâm
        </Button>
      </form>
    </Card>
  );
}

function aiExplanationErrorMessage(error: ApiError | null): string {
  if (error?.status === 429) return "Bạn đang yêu cầu giải thích quá nhanh. Vui lòng thử lại sau.";
  if (error?.status === 502)
    return "Chưa thể tạo phần giải thích lúc này. Các khía cạnh tương thích bên trên vẫn là thông tin chính.";
  if (error?.status === 504) return "Phần giải thích mất nhiều thời gian hơn dự kiến. Bạn có thể chủ động thử lại.";
  if (error?.status === 503)
    return "Tính năng giải thích AI hiện chưa sẵn sàng. Các khía cạnh tương thích bên trên vẫn dùng được.";
  return roommateErrorMessage(error);
}

function RoommateAiExplanationPanel({
  requestId,
  onNoEvidence
}: Readonly<{
  requestId: number;
  onNoEvidence: () => void;
}>) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<RoommateAiCompatibilityExplanation | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    setState("idle");
    setResult(null);
    setError(null);
  }, [requestId]);

  const generate = () => {
    if (state === "loading") return;
    setState("loading");
    setError(null);
    setResult(null);
    void api.roommates
      .createAiExplanation(requestId, { locale: "vi" })
      .then((value) => {
        if (value === null) {
          setState("idle");
          onNoEvidence();
          return;
        }
        setResult(value);
        setState("success");
      })
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught : null);
        setState("error");
      });
  };

  return (
    <Card className="space-y-4" aria-labelledby="roommate-ai-explanation-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="roommate-ai-explanation-heading" className="font-display text-ui-base font-bold">
            Giải thích bằng AI
          </h2>
          <p className="mt-1 text-ui-sm leading-6 text-rent-secondary">
            Giải thích do AI hỗ trợ dựa trên các khía cạnh tương thích xác định ở trên; không thay thế các thông tin đó.
          </p>
        </div>
        <Button
          type="button"
          onClick={generate}
          disabled={state === "loading"}
          pending={state === "loading"}
          pendingLabel="Đang tạo…"
        >
          Giải thích bằng AI
        </Button>
      </div>
      {state === "loading" ? (
        <p aria-live="polite" className="text-ui-sm text-rent-secondary">
          Đang tạo giải thích do AI hỗ trợ…
        </p>
      ) : null}
      {state === "error" ? (
        <div className="space-y-3 border-l-4 border-rose-700 pl-3" role="alert">
          <p className="text-ui-sm font-semibold text-rose-800">{aiExplanationErrorMessage(error)}</p>
          <Button type="button" variant="secondary" onClick={generate}>
            Thử lại
          </Button>
        </div>
      ) : null}
      {state === "success" && result ? (
        <section
          className="space-y-4 border-2 border-heroDark-950 bg-rent-muted p-4"
          aria-labelledby="roommate-ai-generated-heading"
        >
          <div>
            <h3 id="roommate-ai-generated-heading" className="font-display text-ui-base font-bold">
              Giải thích do AI hỗ trợ
            </h3>
            <p className="mt-2 text-ui-sm leading-6 text-heroDark-950">{result.summary}</p>
          </div>
          {result.cautions.length > 0 ? (
            <div>
              <h4 className="text-ui-sm font-bold text-heroDark-950">Điểm nên trao đổi</h4>
              <ul className="mt-2 space-y-2" aria-label="Điểm nên trao đổi">
                {result.cautions.map((caution) => (
                  <li
                    className="border-l-4 border-brandBlue-700 bg-white px-3 py-2 text-ui-sm text-heroDark-950"
                    key={caution.dimension}
                  >
                    <span className="font-bold">{roommateCompatibilityDimensionLabels[caution.dimension]}: </span>
                    {caution.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <h4 className="text-ui-sm font-bold text-heroDark-950">Căn cứ từ các khía cạnh tương thích</h4>
            <ul className="mt-2 space-y-1 text-ui-sm leading-6 text-rent-secondary" aria-label="Căn cứ tương thích">
              {result.evidenceRefs.map((reference) => (
                <li key={`${reference.dimension}:${reference.explanationCode}`}>
                  <span className="font-bold text-heroDark-950">
                    {roommateCompatibilityDimensionLabels[reference.dimension]}:{" "}
                  </span>
                  {roommateCompatibilityExplanation(reference.explanationCode)}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </Card>
  );
}

function RequestDetailContent({ requestId }: Readonly<{ requestId: number }>) {
  const { status: authStatus, user } = useAuth();
  const tenantReady = authStatus === "authenticated" && user?.role === "TENANT" && user.isActive;
  const [request, setRequest] = useState<RoommateRequest | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [profileReady, setProfileReady] = useState<boolean | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [explanationCapability, setExplanationCapability] = useState(false);

  useEffect(() => {
    if (!tenantReady) return;
    const controller = new AbortController();
    setState("loading");
    setError(null);
    setProfileReady(null);
    setExplanationCapability(false);
    const profilePromise = api.roommates.getProfile(controller.signal).catch((caught: unknown) => {
      if (caught instanceof ApiError && caught.status === 404) return null;
      throw caught;
    });
    void Promise.all([
      api.roommates.getRequest(requestId, controller.signal),
      api.roommates.listMine({ page: 1, pageSize: 50 }, controller.signal),
      profilePromise,
      api.roommates.getAiCapabilities(controller.signal).catch(() => null)
    ])
      .then(([detail, mine, profile, capabilities]) => {
        if (!controller.signal.aborted) {
          setRequest(detail);
          setIsOwner(mine.data.some((item) => item.id === detail.id));
          setProfileReady(profile?.profileCompleted === true);
          setExplanationCapability(capabilities?.compatibilityExplanations === true);
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
    profileReady === true &&
    request.signals.profileCompleted &&
    request.signals.listingCurrentlyAvailable !== false;
  const needsProfile =
    !isOwner &&
    profileReady !== true &&
    request.status === "OPEN" &&
    request.signals.listingCurrentlyAvailable !== false;
  const refreshNoCompatibilityEvidence = () => {
    void api.roommates
      .getRequest(requestId)
      .then((detail) => setRequest(detail))
      .catch(() => undefined);
  };

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
            {!isOwner && request.compatibility !== undefined ? (
              <RoommateCompatibilitySummary
                compatibility={request.compatibility}
                detail
                heading="Các khía cạnh cần cân nhắc"
              />
            ) : null}
            {!isOwner && request.compatibility != null && explanationCapability ? (
              <RoommateAiExplanationPanel requestId={request.id} onNoEvidence={refreshNoCompatibilityEvidence} />
            ) : null}
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
              <div className="grid gap-2 sm:flex sm:flex-wrap">
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
          ) : needsProfile ? (
            <EmptyState
              title="Hoàn thành hồ sơ trước khi gửi lời quan tâm"
              description="Bạn cần có hồ sơ ở ghép đầy đủ và khả dụng trước khi gửi lời quan tâm."
              action={
                <Link
                  className="font-bold underline decoration-2 underline-offset-4"
                  href={`/roommates/profile?next=/roommates/requests/${request.id}`}
                >
                  Thiết lập hồ sơ ở ghép
                </Link>
              }
            />
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
              Chấp nhận lời quan tâm chỉ tạo kết nối tìm roommate trong RentMate. Đây không phải đặt chỗ, không phải phê
              duyệt của chủ nhà và không bảo đảm việc thuê nhà.
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
