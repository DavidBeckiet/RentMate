"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { TextareaField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import styles from "./roommate-request-detail.module.css";
import { Skeleton } from "../../components/ui/skeleton";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { RoommateAiCompatibilityExplanation, RoommateRequest } from "../../types/api";
import { roommateErrorMessage } from "./roommate-content";
import {
  RoommateBlockControl,
  RoommateListingContext,
  RoommateProfileSummary,
  RoommateReportControl,
  RoommateRequestFacts,
  RoommateSafetyNotice,
  RoommateStatusPill,
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

const ICEBREAKER_TEMPLATES = [
  {
    label: "Hỏi về độ phù hợp",
    text: "Chào bạn, mình thấy nhịp sinh hoạt và ngân sách của tụi mình khá hợp nhau, muốn kết nối cùng tìm phòng."
  },
  {
    label: "Hỏi về phòng",
    text: "Chào bạn, bạn đã tìm được căn phòng ưng ý ở khu vực này chưa?"
  },
  {
    label: "Tìm bạn cùng thuê",
    text: "Chào bạn, mình cũng đang tìm phòng khu vực này và muốn tìm bạn cùng thuê."
  }
] as const;

function InterestComposer({ requestId }: Readonly<{ requestId: number }>) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyIcebreaker = (text: string) => {
    setMessage((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
  };

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
    <Card className={styles.composer} aria-labelledby="roommate-interest-heading">
      <div>
        <p className="rm-roommate-section-label">Kết nối bắt đầu từ đây</p>
        <h2 id="roommate-interest-heading" className="mt-1 font-display text-heading-md font-bold text-foreground">
          Gửi lời quan tâm
        </h2>
        <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
          Lời nhắn mở đầu sẽ tạo một cuộc trò chuyện trong RentMate.
        </p>
      </div>

      <div className={styles.icebreakerContainer}>
        <p className="text-ui-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Icon name="sparkles" className="h-3.5 w-3.5 text-primary" />
          Gợi ý lời chào nhanh:
        </p>
        <div className={styles.icebreakers}>
          {ICEBREAKER_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.label}
              type="button"
              onClick={() => applyIcebreaker(tmpl.text)}
              className={styles.icebreakerChip}
            >
              {tmpl.label}
            </button>
          ))}
        </div>
      </div>

      <form className="space-y-4" onSubmit={(event) => void submit(event)} noValidate>
        <TextareaField
          id={`roommate-interest-message-${requestId}`}
          name="message"
          label="Lời nhắn mở đầu"
          hint="Không chia sẻ thông tin liên hệ, OTP hoặc thông tin tài chính."
          required
          maxLength={2000}
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <p aria-live="polite" className="text-right text-ui-xs font-semibold text-muted-foreground">
          {Array.from(message).length}/2000 ký tự
        </p>
        {error ? (
          <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
            {error}
          </p>
        ) : null}
        <Button className="w-full shadow-sm" type="submit" pending={pending} pendingLabel="Đang gửi…">
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
    <Card
      className="rm-roommate-ai-panel rm-roommate-card-static space-y-4"
      aria-labelledby="roommate-ai-explanation-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rm-roommate-ai-label">
            <Icon name="sparkles" className="h-4 w-4" /> AI hỗ trợ · theo yêu cầu
          </p>
          <h2
            id="roommate-ai-explanation-heading"
            className="mt-3 font-display text-heading-sm font-bold text-foreground"
          >
            Giải thích bằng AI
          </h2>
          <p className="mt-1 text-ui-sm leading-6 text-muted-foreground">
            Giải thích do AI hỗ trợ dựa trên các khía cạnh tương thích xác định ở trên; không thay thế các thông tin đó.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={generate}
          disabled={state === "loading"}
          pending={state === "loading"}
          pendingLabel="Đang tạo…"
        >
          Giải thích bằng AI
        </Button>
      </div>
      {state === "loading" ? (
        <div className="rm-roommate-callout space-y-3" role="status" aria-live="polite">
          <p className="text-ui-sm text-info-foreground">Đang tạo giải thích do AI hỗ trợ…</p>
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ) : null}
      {state === "error" ? (
        <div className="rm-roommate-callout space-y-3 text-danger" data-tone="danger" role="alert">
          <p className="text-ui-sm font-semibold">{aiExplanationErrorMessage(error)}</p>
          <Button type="button" variant="secondary" onClick={generate}>
            Thử lại
          </Button>
        </div>
      ) : null}
      {state === "success" && result ? (
        <section
          className="rm-roommate-callout space-y-4"
          data-tone="accent"
          aria-labelledby="roommate-ai-generated-heading"
        >
          <div>
            <h3 id="roommate-ai-generated-heading" className="font-display text-ui-base font-bold">
              Giải thích do AI hỗ trợ
            </h3>
            <p className="mt-2 text-ui-sm leading-6 text-foreground">{result.summary}</p>
          </div>
          {result.cautions.length > 0 ? (
            <div>
              <h4 className="text-ui-sm font-bold text-foreground">Điểm nên trao đổi</h4>
              <ul className="mt-2 space-y-2" aria-label="Điểm nên trao đổi">
                {result.cautions.map((caution) => (
                  <li
                    className="rm-roommate-callout text-ui-sm text-foreground"
                    data-tone="warning"
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
            <h4 className="text-ui-sm font-bold text-foreground">Căn cứ từ các khía cạnh tương thích</h4>
            <ul className="mt-2 space-y-1 text-ui-sm leading-6 text-muted-foreground" aria-label="Căn cứ tương thích">
              {result.evidenceRefs.map((reference) => (
                <li key={`${reference.dimension}:${reference.explanationCode}`}>
                  <span className="font-bold text-foreground">
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
  const router = useRouter();
  const tenantReady = authStatus === "authenticated" && user?.role === "TENANT" && user.isActive;
  const [request, setRequest] = useState<RoommateRequest | null>(null);
  const [activeReportTarget, setActiveReportTarget] = useState<"PROFILE" | "REQUEST" | null>(null);
  const [reporting, setReporting] = useState({ profileHasReported: false, requestHasReported: false });
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
          setReporting(detail.reporting ?? { profileHasReported: false, requestHasReported: false });
          setActiveReportTarget(null);
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

  if (state === "loading")
    return <LoadingState message="Đang tải yêu cầu ở ghép…" className="rm-roommate-card-static" />;
  if (state === "error" || !request) {
    const unavailable = error?.status === 404;
    return (
      <ErrorState
        tone={unavailable ? "neutral" : "danger"}
        title={unavailable ? "Nội dung ở ghép không còn khả dụng" : undefined}
        message={roommateErrorMessage(error)}
        requestId={unavailable ? null : error?.requestId}
        onRetry={unavailable ? undefined : () => setRetryKey((key) => key + 1)}
        action={
          unavailable ? (
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-ui-sm font-bold text-primary-foreground shadow-surface hover:bg-primary-hover"
                href="/roommates"
              >
                Quay lại khám phá
              </Link>
              <Link
                className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 text-ui-sm font-bold text-foreground shadow-surface hover:border-primary hover:bg-primary-subtle"
                href="/roommates/blocked"
              >
                Đến danh sách đã chặn
              </Link>
            </div>
          ) : undefined
        }
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
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Điều hướng yêu cầu ở ghép">
        <Link href="/roommates">
          <Icon name="arrow" className="h-4 w-4 rotate-180" /> Khám phá ở ghép
        </Link>
        <span aria-hidden="true">/</span>
        <span>Chi tiết yêu cầu</span>
      </nav>
      <header className={styles.hero}>
        <div>
          <p className="rm-roommate-section-label">Tìm người cùng chia sẻ không gian sống</p>
          <h1>Chi tiết yêu cầu ở ghép</h1>
          <p>Tìm hiểu người đăng, xem nhu cầu và bắt đầu trao đổi khi bạn thấy phù hợp.</p>
        </div>
        <a href="#roommate-next-step" className={styles.primaryLink}>
          <Icon name={isOwner ? "sliders" : "message"} className="h-4 w-4" />
          {isOwner ? "Quản lý yêu cầu" : canStartInterest ? "Kết nối với người đăng" : "Xem trạng thái kết nối"}
        </a>
      </header>
      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.section} aria-labelledby="request-overview-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className="rm-roommate-section-label">01 · Nhu cầu ở ghép</p>
                <h2 id="request-overview-heading">Bạn sẽ cùng tìm một nơi như thế nào?</h2>
              </div>
              {isOwner ? <RoommateStatusPill status="MATCHED" label="Của bạn" /> : null}
            </div>
            <RoommateRequestFacts request={request} />
            <div className={styles.listingContext}>
              <RoommateListingContext request={request} />
            </div>
            {request.note ? (
              <div className={styles.note}>
                <h3>Lời nhắn từ người đăng</h3>
                <p>{request.note}</p>
              </div>
            ) : null}
          </section>

          <section className={styles.section} aria-label="Người bạn có thể ở ghép cùng">
            <p className="rm-roommate-section-label">02 · Người đăng yêu cầu</p>
            <div className={styles.profile}>
              <RoommateProfileSummary profile={request.profile} heading="Hồ sơ người đăng" />
            </div>
          </section>

          {!isOwner && request.compatibility !== undefined ? (
            <section className={styles.section} aria-label="Cân nhắc trước khi kết nối">
              <p className="rm-roommate-section-label">03 · Hai bạn có phù hợp?</p>
              <p className={styles.description}>
                Tham khảo từng khía cạnh và trao đổi thêm trước khi quyết định ở ghép.
              </p>
              <div className={styles.compatibility}>
                <RoommateCompatibilitySummary
                  compatibility={request.compatibility}
                  detail
                  heading="Các khía cạnh cần cân nhắc"
                />
              </div>
              {!isOwner && request.compatibility != null && explanationCapability ? (
                <div className={styles.ai}>
                  <RoommateAiExplanationPanel requestId={request.id} onNoEvidence={refreshNoCompatibilityEvidence} />
                </div>
              ) : null}
            </section>
          ) : null}

          <RoommateSafetyNotice kind="long" className={styles.warning} />
          <details className={styles.checklist}>
            <summary>
              <Icon name="shield" className="h-4 w-4" /> Những điều nên kiểm tra trước khi ở ghép{" "}
              <Icon name="chevronDown" className="h-4 w-4" />
            </summary>
            <RoommateSafetyNotice kind="checklist" />
          </details>
        </div>
        <aside className={styles.sidebar} aria-label="Kết nối và an toàn">
          <div id="roommate-next-step" className={styles.nextStep}>
            {isOwner ? (
              <Card className="space-y-3">
                <h2 className="font-display text-heading-sm font-bold">Quản lý yêu cầu</h2>
                <div className="grid gap-2 sm:flex sm:flex-wrap">
                  <Link
                    className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-ui-sm font-bold text-primary-foreground shadow-surface hover:bg-primary-hover"
                    href="/roommates/my-request"
                  >
                    Chỉnh sửa yêu cầu
                  </Link>
                  {request.status === "OPEN" ? (
                    <Link
                      className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 text-ui-sm font-bold text-foreground shadow-surface hover:bg-surface-subtle"
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
                    ? "Phòng trong yêu cầu này hiện không còn khả dụng cho tương tác mới."
                    : "Yêu cầu này không còn mở hoặc hồ sơ hiện không khả dụng."
                }
              />
            )}
          </div>
          <Card className={styles.safety} aria-label="An toàn khi kết nối">
            {!isOwner ? (
              <>
                <div>
                  <p className="rm-roommate-section-label">AN TOÀN</p>
                  <h2
                    id="roommate-safety-heading"
                    className="mt-1 font-display text-heading-sm font-bold text-foreground"
                  >
                    Bảo vệ tương tác của bạn
                  </h2>
                  <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
                    Chặn để ngừng tương tác; báo cáo để gửi thông tin cho RentMate xem xét.
                  </p>
                </div>
                <RoommateBlockControl
                  context="request"
                  id={request.id}
                  buttonVariant="outline"
                  className="w-full"
                  onBlocked={() => router.push("/roommates/blocked")}
                />
                <div className="border-t border-border pt-4">
                  <p className="text-ui-sm font-semibold text-muted-foreground">Báo cáo</p>
                  <div className="mt-2 grid gap-2">
                    <RoommateReportControl
                      target="ROOMMATE_PROFILE"
                      requestId={request.id}
                      label="Báo cáo hồ sơ"
                      hasReported={reporting.profileHasReported}
                      open={activeReportTarget === "PROFILE"}
                      onOpenChange={(open) => setActiveReportTarget(open ? "PROFILE" : null)}
                      onSubmitted={() => setReporting((current) => ({ ...current, profileHasReported: true }))}
                      className="w-full justify-start"
                    />
                    <RoommateReportControl
                      target="ROOMMATE_REQUEST"
                      requestId={request.id}
                      label="Báo cáo yêu cầu"
                      hasReported={reporting.requestHasReported}
                      open={activeReportTarget === "REQUEST"}
                      onOpenChange={(open) => setActiveReportTarget(open ? "REQUEST" : null)}
                      onSubmitted={() => setReporting((current) => ({ ...current, requestHasReported: true }))}
                      className="w-full justify-start"
                    />
                  </div>
                </div>
              </>
            ) : null}
            <div className="border-t border-border pt-4">
              <h2 className="font-display text-ui-base font-bold text-foreground">Ghi nhớ</h2>
              <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
                Chấp nhận lời quan tâm chỉ tạo kết nối tìm người ở ghép trong RentMate. Đây không phải đặt chỗ, không
                phải phê duyệt của chủ nhà và không bảo đảm việc thuê nhà.
              </p>
            </div>
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
