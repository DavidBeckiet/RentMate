"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState, ErrorState } from "../../components/ui/feedback-states";
import { InputField, SelectField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { Skeleton } from "../../components/ui/skeleton";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type {
  ApiPage,
  RoommateAiRecommendationItem,
  RoommateAiRecommendations,
  RoommateDiscoveryQuery,
  RoommateRequest
} from "../../types/api";
import { formatRoommateDate, roommateErrorMessage, roommateRequestStatusLabels } from "./roommate-content";
import {
  RoommateAvatar,
  RoommateListingContext,
  RoommatePageHeader,
  RoommateProfileSummary,
  RoommateRequestFacts,
  RoommateStatusPill,
  RoommateSubnav,
  RoommateTenantBoundary
} from "./roommate-shared";
import { RoommateCompatibilitySummary } from "./roommate-v2";

interface DiscoveryForm {
  readonly area: string;
  readonly budgetMinPerPerson: string;
  readonly budgetMaxPerPerson: string;
  readonly moveInFrom: string;
  readonly moveInUntil: string;
  readonly listingMode: RoommateDiscoveryQuery["listingMode"];
}

const initialForm: DiscoveryForm = {
  area: "",
  budgetMinPerPerson: "",
  budgetMaxPerPerson: "",
  moveInFrom: "",
  moveInUntil: "",
  listingMode: "ALL"
};

function queryFromForm(form: DiscoveryForm, page: number): RoommateDiscoveryQuery {
  return {
    ...(form.area.trim() ? { area: form.area.trim() } : {}),
    ...(form.budgetMinPerPerson ? { budgetMinPerPerson: Number(form.budgetMinPerPerson) } : {}),
    ...(form.budgetMaxPerPerson ? { budgetMaxPerPerson: Number(form.budgetMaxPerPerson) } : {}),
    ...(form.moveInFrom ? { moveInFrom: form.moveInFrom } : {}),
    ...(form.moveInUntil ? { moveInUntil: form.moveInUntil } : {}),
    listingMode: form.listingMode,
    page,
    pageSize: 12
  };
}

function recommendationFilters(query: RoommateDiscoveryQuery) {
  return {
    ...(query.area ? { area: query.area } : {}),
    ...(query.budgetMinPerPerson ? { budgetMinPerPerson: query.budgetMinPerPerson } : {}),
    ...(query.budgetMaxPerPerson ? { budgetMaxPerPerson: query.budgetMaxPerPerson } : {}),
    ...(query.moveInFrom ? { moveInFrom: query.moveInFrom } : {}),
    ...(query.moveInUntil ? { moveInUntil: query.moveInUntil } : {}),
    ...(query.listingMode ? { listingMode: query.listingMode } : {})
  };
}

function DiscoveryCard({ request }: Readonly<{ request: RoommateRequest }>) {
  return (
    <article className="rm-roommate-card">
      <div className="rm-roommate-card-body space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <RoommateAvatar displayName={request.profile?.displayName ?? null} />
            <div className="min-w-0">
              <p className="rm-roommate-section-label">
                {request.listingMode === "LINKED" ? "Cùng cân nhắc listing" : "Cùng tìm listing"}
              </p>
              <h2 className="mt-1 truncate font-display text-heading-sm font-bold text-foreground">
                {request.profile?.displayName ?? "Người thuê RentMate"}
              </h2>
            </div>
          </div>
          <RoommateStatusPill status={request.status} label={roommateRequestStatusLabels[request.status]} />
        </div>
        <RoommateProfileSummary
          profile={request.profile}
          heading="Phong cách sống"
          showDisplayName={false}
          showAvatar={false}
        />
        {request.compatibility !== undefined ? (
          <RoommateCompatibilitySummary compatibility={request.compatibility} heading="Gợi ý tương thích" />
        ) : null}
        <RoommateRequestFacts request={request} />
        {request.note ? (
          <p className="rm-roommate-callout whitespace-pre-wrap text-ui-sm leading-6 text-muted-foreground">
            {request.note}
          </p>
        ) : null}
        <RoommateListingContext request={request} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-ui-xs font-semibold text-muted-foreground">
            Mở từ {formatRoommateDate(request.createdAt.slice(0, 10))}
          </p>
          <Link
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 text-ui-sm font-bold text-primary-foreground shadow-surface transition-[background-color,transform] duration-fast hover:-translate-y-0.5 hover:bg-primary-hover sm:w-auto"
            href={`/roommates/requests/${request.id}`}
          >
            Xem yêu cầu <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

const recommendationReasonLabels: Readonly<Record<string, string>> = Object.freeze({
  SEMANTIC_SLEEP_ALIGNED: "Nhịp sinh hoạt có tín hiệu phù hợp.",
  SEMANTIC_CLEANLINESS_ALIGNED: "Có tín hiệu phù hợp về nếp sinh hoạt chung.",
  SEMANTIC_NOISE_ALIGNED: "Có tín hiệu phù hợp về không gian sinh hoạt.",
  SEMANTIC_SMOKING_ALIGNED: "Có tín hiệu phù hợp về môi trường hút thuốc.",
  SEMANTIC_PETS_ALIGNED: "Có tín hiệu phù hợp về môi trường thú cưng.",
  V2_BUDGET_ALIGNED: "Khung ngân sách có giao nhau.",
  V2_AREA_ALIGNED: "Khu vực dự định có giao nhau.",
  V2_MOVE_IN_ALIGNED: "Thời gian chuyển vào có giao nhau."
});

function RecommendationCard({
  item,
  onDismiss
}: Readonly<{ item: RoommateAiRecommendationItem; onDismiss: () => void }>) {
  return (
    <div className="rm-roommate-card rm-roommate-card-static" aria-label="Gợi ý bằng AI">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-sky/35 px-4 py-3">
        <p className="rm-roommate-ai-label">
          <span aria-hidden="true">✦</span> AI hỗ trợ
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={onDismiss}>
          Ẩn trong phiên này
        </Button>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <p className="text-ui-xs font-bold uppercase tracking-[0.1em] text-info-foreground">Vì sao gợi ý?</p>
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Lý do gợi ý">
            {item.recommendation.reasonCodes.map((code) => (
              <li className="rm-roommate-chip" key={code}>
                {recommendationReasonLabels[code]}
              </li>
            ))}
          </ul>
        </div>
        <DiscoveryCard request={item.request} />
      </div>
    </div>
  );
}

function DiscoveryCardSkeleton() {
  return (
    <div className="rm-roommate-card rm-roommate-card-static space-y-5 p-5" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton rounded="card" className="h-14 w-14" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}

function DiscoveryContent() {
  const { status: authStatus, user } = useAuth();
  const tenantReady = authStatus === "authenticated" && user?.role === "TENANT" && user.isActive;
  const [form, setForm] = useState<DiscoveryForm>(initialForm);
  const [submittedForm, setSubmittedForm] = useState<DiscoveryForm>(initialForm);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<RoommateRequest> | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [recommendationCapability, setRecommendationCapability] = useState(false);
  const [recommendationOpen, setRecommendationOpen] = useState(false);
  const [recommendationState, setRecommendationState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [recommendationResult, setRecommendationResult] = useState<RoommateAiRecommendations | null>(null);
  const [recommendationError, setRecommendationError] = useState<ApiError | null>(null);
  const [dismissedRecommendationIds, setDismissedRecommendationIds] = useState<ReadonlySet<number>>(new Set());
  const query = useMemo(() => queryFromForm(submittedForm, page), [page, submittedForm]);

  useEffect(() => {
    if (!tenantReady) return;
    const controller = new AbortController();
    setState("loading");
    setError(null);
    void api.roommates
      .discover(query, controller.signal)
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
  }, [query, tenantReady]);

  useEffect(() => {
    if (!tenantReady || typeof api.roommates.getAiCapabilities !== "function") return;
    const controller = new AbortController();
    void api.roommates
      .getAiCapabilities(controller.signal)
      .then((capabilities) => {
        if (!controller.signal.aborted) setRecommendationCapability(capabilities.semanticRecommendations);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecommendationCapability(false);
      });
    return () => controller.abort();
  }, [tenantReady]);

  const loadRecommendations = () => {
    setRecommendationState("loading");
    setRecommendationResult(null);
    setRecommendationError(null);
    void api.roommates
      .getAiRecommendations({ filters: recommendationFilters(query), limit: 10, locale: "vi" })
      .then((value) => {
        setRecommendationResult(value);
        setRecommendationState("success");
      })
      .catch((caught: unknown) => {
        setRecommendationError(caught instanceof ApiError ? caught : null);
        setRecommendationState("error");
      });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSubmittedForm(form);
  };

  const reset = () => {
    setForm(initialForm);
    setSubmittedForm({ ...initialForm });
    setPage(1);
  };

  return (
    <div className="rm-roommate-page space-y-6">
      <RoommatePageHeader
        title="Tìm người ở ghép cùng nhịp sống"
        description="Không chỉ tìm một chỗ ở — tìm người có nhịp sống phù hợp. Duyệt các yêu cầu đang mở theo khu vực, ngân sách và thời gian chuyển vào; mỗi thông tin đều được trình bày vừa đủ cho một cuộc trò chuyện tốt hơn."
        action={
          <Link
            className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-ui-sm font-bold text-primary-foreground shadow-surface transition-[background-color,transform] duration-fast hover:-translate-y-0.5 hover:bg-primary-hover"
            href="/roommates/my-request"
          >
            Tạo yêu cầu
          </Link>
        }
      />
      <RoommateSubnav />
      <Card className="rm-roommate-card-static">
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={submit}>
          <div className="sm:col-span-2 lg:col-span-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-subtle text-primary-hover">
                <Icon name="sliders" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-heading-sm font-bold text-foreground">Lọc yêu cầu ở ghép</h2>
                <p className="mt-1 text-ui-sm leading-6 text-muted-foreground">
                  Chọn các tiêu chí quan trọng; bạn có thể để trống trường chưa cần giới hạn.
                </p>
              </div>
            </div>
          </div>
          <InputField
            id="roommate-discovery-area"
            name="area"
            label="Khu vực"
            value={form.area}
            maxLength={120}
            placeholder="Ví dụ: Quận 3"
            onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
          />
          <InputField
            id="roommate-discovery-budget-min"
            name="budgetMinPerPerson"
            label="Ngân sách tối thiểu mỗi người"
            type="number"
            min="1"
            inputMode="numeric"
            value={form.budgetMinPerPerson}
            onChange={(event) => setForm((current) => ({ ...current, budgetMinPerPerson: event.target.value }))}
          />
          <InputField
            id="roommate-discovery-budget-max"
            name="budgetMaxPerPerson"
            label="Ngân sách tối đa mỗi người"
            type="number"
            min="1"
            inputMode="numeric"
            value={form.budgetMaxPerPerson}
            onChange={(event) => setForm((current) => ({ ...current, budgetMaxPerPerson: event.target.value }))}
          />
          <InputField
            id="roommate-discovery-move-from"
            name="moveInFrom"
            label="Chuyển vào từ"
            type="date"
            value={form.moveInFrom}
            onChange={(event) => setForm((current) => ({ ...current, moveInFrom: event.target.value }))}
          />
          <InputField
            id="roommate-discovery-move-until"
            name="moveInUntil"
            label="Chuyển vào đến"
            type="date"
            value={form.moveInUntil}
            onChange={(event) => setForm((current) => ({ ...current, moveInUntil: event.target.value }))}
          />
          <SelectField
            id="roommate-discovery-listing-mode"
            name="listingMode"
            label="Bối cảnh listing"
            value={form.listingMode}
            onChange={(event) =>
              setForm((current) => ({ ...current, listingMode: event.target.value as DiscoveryForm["listingMode"] }))
            }
          >
            <option value="ALL">Tất cả yêu cầu</option>
            <option value="LINKED">Đang cân nhắc một listing</option>
            <option value="UNLINKED">Cùng tìm listing</option>
          </SelectField>
          <div className="grid items-end gap-2 sm:flex sm:col-span-2 lg:col-span-3">
            <Button type="submit" className="w-full sm:w-auto">
              Lọc yêu cầu
            </Button>
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={reset}>
              Xóa bộ lọc
            </Button>
          </div>
        </form>
      </Card>
      {recommendationCapability ? (
        <Card className="rm-roommate-ai-panel rm-roommate-card-static">
          <div className="space-y-5" role="region" aria-label="Gợi ý bằng AI">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="rm-roommate-ai-label">
                  <span aria-hidden="true">✦</span> AI hỗ trợ · bề mặt riêng
                </p>
                <h2 className="mt-3 font-display text-heading-md font-bold text-foreground">Gợi ý bằng AI</h2>
                <p className="mt-1 text-ui-sm leading-6 text-muted-foreground">
                  Gợi ý bổ sung từ tín hiệu sinh hoạt; danh sách tìm kiếm thông thường vẫn độc lập.
                </p>
              </div>
              <Button
                type="button"
                aria-expanded={recommendationOpen}
                onClick={() => {
                  const next = !recommendationOpen;
                  setRecommendationOpen(next);
                  if (next && recommendationState === "idle") loadRecommendations();
                }}
              >
                {" "}
                {recommendationOpen ? "Ẩn gợi ý AI" : "Xem gợi ý AI"}{" "}
              </Button>
            </div>
            {recommendationOpen && recommendationState === "loading" ? (
              <div className="grid gap-4 xl:grid-cols-2" role="status" aria-label="Đang tạo gợi ý bằng AI">
                <DiscoveryCardSkeleton />
                <DiscoveryCardSkeleton />
              </div>
            ) : null}
            {recommendationOpen && recommendationState === "error" ? (
              <ErrorState
                title={recommendationError?.status === 429 ? "Gợi ý AI đang tạm giới hạn" : "Gợi ý AI chưa sẵn sàng"}
                message={
                  recommendationError?.status === 429
                    ? "Bạn có thể thử lại sau. Khám phá thông thường vẫn dùng được ngay."
                    : "Chưa thể tạo gợi ý lúc này. Khám phá thông thường vẫn dùng được ngay."
                }
                action={<Button onClick={loadRecommendations}>Thử lại</Button>}
              />
            ) : null}
            {recommendationOpen &&
            recommendationState === "success" &&
            recommendationResult?.reason === "INSUFFICIENT_SEMANTIC_EVIDENCE" ? (
              <EmptyState
                title="Chưa có đủ tín hiệu để tạo gợi ý AI"
                description="Bạn vẫn có thể dùng danh sách tìm roommate thông thường."
                action={
                  <Link className="font-bold underline decoration-2 underline-offset-4" href="/roommates/my-request">
                    Chỉnh sửa sở thích
                  </Link>
                }
              />
            ) : null}
            {recommendationOpen &&
            recommendationState === "success" &&
            recommendationResult &&
            recommendationResult.items.filter((item) => !dismissedRecommendationIds.has(item.request.id)).length > 0 ? (
              <div className="grid gap-5 xl:grid-cols-2">
                {recommendationResult.items
                  .filter((item) => !dismissedRecommendationIds.has(item.request.id))
                  .map((item) => (
                    <RecommendationCard
                      key={item.request.id}
                      item={item}
                      onDismiss={() =>
                        setDismissedRecommendationIds((current) => new Set([...current, item.request.id]))
                      }
                    />
                  ))}
              </div>
            ) : null}
            {recommendationOpen &&
            recommendationState === "success" &&
            recommendationResult &&
            recommendationResult.items.length === 0 ? (
              <EmptyState
                title="Chưa có gợi ý phù hợp lúc này"
                description="Thêm tín hiệu sinh hoạt hoặc tiếp tục với khám phá thông thường."
              />
            ) : null}
            {recommendationOpen &&
            recommendationState === "success" &&
            recommendationResult &&
            recommendationResult.items.length > 0 &&
            recommendationResult.items.every((item) => dismissedRecommendationIds.has(item.request.id)) ? (
              <EmptyState
                title="Bạn đã xem hết gợi ý trong phiên này"
                description="Bạn có thể tiếp tục với khám phá thông thường bên dưới."
              />
            ) : null}
            {recommendationOpen ? (
              <Link
                className="inline-flex min-h-11 items-center font-bold underline decoration-2 underline-offset-4"
                href="/roommates/my-request"
              >
                Chỉnh sửa sở thích roommate
              </Link>
            ) : null}
          </div>
        </Card>
      ) : null}
      <section className="space-y-4" aria-labelledby="roommate-normal-discovery-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="rm-roommate-section-label">Khám phá thông thường</p>
            <h2
              id="roommate-normal-discovery-heading"
              className="mt-1 font-display text-heading-lg font-bold text-foreground"
            >
              Các yêu cầu đang mở
            </h2>
            <p className="mt-1 text-ui-sm text-muted-foreground">
              Thứ tự hiển thị theo dữ liệu khám phá hiện tại của RentMate.
            </p>
          </div>
          <span className="rm-roommate-chip">
            <Icon name="compass" className="h-4 w-4" /> V1 + V2
          </span>
        </div>
        {state === "idle" || state === "loading" ? (
          <div className="grid gap-5 xl:grid-cols-2" role="status" aria-label="Đang tìm yêu cầu ở ghép">
            <DiscoveryCardSkeleton />
            <DiscoveryCardSkeleton />
          </div>
        ) : null}
        {state === "error" ? (
          <ErrorState
            message={roommateErrorMessage(error)}
            requestId={error?.requestId}
            action={<Button onClick={() => setSubmittedForm({ ...submittedForm })}>Thử lại</Button>}
          />
        ) : null}
        {state === "success" && result?.data.length === 0 ? (
          <EmptyState
            title="Chưa tìm thấy yêu cầu phù hợp"
            description="Thử điều chỉnh khu vực, ngân sách hoặc thời gian chuyển vào."
            action={
              <Link className="font-bold underline decoration-2 underline-offset-4" href="/roommates/my-request">
                Tạo yêu cầu của bạn
              </Link>
            }
          />
        ) : null}
        {state === "success" && result && result.data.length > 0 ? (
          <div className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-2">
              {result.data.map((request) => (
                <DiscoveryCard key={request.id} request={request} />
              ))}
            </div>
            <Pagination
              ariaLabel="Phân trang yêu cầu ở ghép"
              page={result.pagination.page}
              hasNextPage={result.pagination.hasNextPage}
              onPrevious={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() => setPage((current) => current + 1)}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function RoommateDiscoveryPage() {
  return (
    <RoommateTenantBoundary>
      <DiscoveryContent />
    </RoommateTenantBoundary>
  );
}
