"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState, ErrorState } from "../../components/ui/feedback-states";
import { InputField, SelectField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { Skeleton } from "../../components/ui/skeleton";
import styles from "./roommate-discovery.module.css";
import { api, ApiError } from "../../lib/api/client";
import { formatAreaLabel } from "../../lib/area";
import { useAuth } from "../../lib/auth/auth-provider";
import type {
  ApiPage,
  RoommateAiRecommendationItem,
  RoommateAiRecommendations,
  RoommateDiscoveryQuery,
  RoommateRequest
} from "../../types/api";
import {
  formatMemberSince,
  formatRoommateDate,
  formatRoommateMoney,
  roommateCleanlinessLabels,
  roommateErrorMessage,
  roommateNoiseLabels,
  roommateRequestStatusLabels,
  roommateSmokingLabels
} from "./roommate-content";
import {
  RoommateAvatar,
  RoommatePageHeader,
  RoommateStatusPill,
  RoommateSubnav,
  RoommateTenantBoundary
} from "./roommate-shared";
import {
  roommateCompatibilityDimensionLabels,
  roommateCompatibilityExplanation,
  roommateCompatibilityOutcomeLabels,
  selectRoommateCompatibilityHighlights
} from "./roommate-v2";

interface DiscoveryForm {
  readonly area: string;
  readonly budgetMinPerPerson: string;
  readonly budgetMaxPerPerson: string;
  readonly moveInFrom: string;
  readonly moveInUntil: string;
  readonly listingMode: RoommateDiscoveryQuery["listingMode"];
}
interface DiscoveryUrlState {
  readonly form: DiscoveryForm;
  readonly page: number;
  readonly key: string;
}

const discoveryQueryKeys = [
  "area",
  "budgetMinPerPerson",
  "budgetMaxPerPerson",
  "moveInFrom",
  "moveInUntil",
  "listingMode",
  "page"
] as const;
const initialForm: DiscoveryForm = {
  area: "",
  budgetMinPerPerson: "",
  budgetMaxPerPerson: "",
  moveInFrom: "",
  moveInUntil: "",
  listingMode: "ALL"
};
const safeIntegerPattern = /^[1-9][0-9]*$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const maximumBudget = 999_999_999_999;

function safePositiveInteger(value: string | null): number | null {
  if (!value || !safeIntegerPattern.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximumBudget ? parsed : null;
}
function safeDate(value: string | null): string | null {
  if (!value || !datePattern.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

export function parseDiscoveryUrlState(params: Pick<URLSearchParams, "get" | "toString">): DiscoveryUrlState {
  const rawFrom = safeDate(params.get("moveInFrom"));
  const rawUntil = safeDate(params.get("moveInUntil"));
  const validDates =
    rawFrom && rawUntil && rawFrom > rawUntil
      ? { from: "", until: "" }
      : { from: rawFrom ?? "", until: rawUntil ?? "" };
  const rawMinimum = safePositiveInteger(params.get("budgetMinPerPerson"));
  const rawMaximum = safePositiveInteger(params.get("budgetMaxPerPerson"));
  const validBudget =
    rawMinimum !== null && rawMaximum !== null && rawMinimum > rawMaximum
      ? { min: "", max: "" }
      : { min: rawMinimum === null ? "" : String(rawMinimum), max: rawMaximum === null ? "" : String(rawMaximum) };
  const listingMode = params.get("listingMode");
  const page = safePositiveInteger(params.get("page")) ?? 1;
  const area = params.get("area")?.trim() ?? "";
  return {
    form: {
      area: area ? formatAreaLabel(area) : "",
      budgetMinPerPerson: validBudget.min,
      budgetMaxPerPerson: validBudget.max,
      moveInFrom: validDates.from,
      moveInUntil: validDates.until,
      listingMode: listingMode === "LINKED" || listingMode === "UNLINKED" ? listingMode : "ALL"
    },
    page,
    key: params.toString()
  };
}

function queryFromForm(form: DiscoveryForm, page: number): RoommateDiscoveryQuery {
  const minimum = safePositiveInteger(form.budgetMinPerPerson);
  const maximum = safePositiveInteger(form.budgetMaxPerPerson);
  const hasValidBudget = minimum === null || maximum === null || minimum <= maximum;
  return {
    ...(form.area.trim() ? { area: formatAreaLabel(form.area) } : {}),
    ...(hasValidBudget && minimum !== null ? { budgetMinPerPerson: minimum } : {}),
    ...(hasValidBudget && maximum !== null ? { budgetMaxPerPerson: maximum } : {}),
    ...(form.moveInFrom ? { moveInFrom: form.moveInFrom } : {}),
    ...(form.moveInUntil ? { moveInUntil: form.moveInUntil } : {}),
    listingMode: form.listingMode,
    page,
    pageSize: 8
  };
}

function discoveryUrl(
  pathname: string,
  current: Pick<URLSearchParams, "toString">,
  form: DiscoveryForm,
  page: number
): string {
  const params = new URLSearchParams(current.toString());
  for (const key of discoveryQueryKeys) params.delete(key);
  const query = queryFromForm(form, page);
  if (query.area) params.set("area", query.area);
  if (query.budgetMinPerPerson) params.set("budgetMinPerPerson", String(query.budgetMinPerPerson));
  if (query.budgetMaxPerPerson) params.set("budgetMaxPerPerson", String(query.budgetMaxPerPerson));
  if (query.moveInFrom) params.set("moveInFrom", query.moveInFrom);
  if (query.moveInUntil) params.set("moveInUntil", query.moveInUntil);
  if (query.listingMode && query.listingMode !== "ALL") params.set("listingMode", query.listingMode);
  if (page > 1) params.set("page", String(page));
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
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

function DiscoveryCompatibility({ request }: Readonly<{ request: RoommateRequest }>) {
  const compatibility = request.compatibility;
  const highlights = compatibility ? selectRoommateCompatibilityHighlights(compatibility.dimensions) : [];
  if (highlights.length === 0)
    return (
      <section className="rm-roommate-discovery-compatibility" aria-label="Mức độ phù hợp">
        <p className="text-ui-xs text-muted-foreground">Xem hồ sơ để tìm hiểu thêm về nhau.</p>
      </section>
    );
  return (
    <details className="rm-roommate-discovery-compatibility" aria-label="Mức độ phù hợp">
      <summary className={styles.compatibilityToggle}>Điểm phù hợp & cần trao đổi</summary>
      <ul className="mt-2 space-y-2">
        {highlights.map((item) => (
          <li className="flex gap-2 text-ui-xs leading-5 text-muted-foreground" key={item.dimension}>
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">
                {roommateCompatibilityDimensionLabels[item.dimension]}:{" "}
                {roommateCompatibilityOutcomeLabels[item.outcome]}.{" "}
              </strong>
              {roommateCompatibilityExplanation(item.explanationCode)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function resetRequestDetailScroll(event: MouseEvent<HTMLAnchorElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function DiscoveryCard({ request }: Readonly<{ request: RoommateRequest }>) {
  const profile = request.profile;
  const memberSince = formatMemberSince(profile?.memberSince ?? null);
  const lifestyle = profile
    ? [
        { label: "Gọn gàng", value: roommateCleanlinessLabels[profile.cleanlinessLevel] },
        { label: "Không gian", value: roommateNoiseLabels[profile.noisePreference] },
        { label: "Thuốc lá", value: roommateSmokingLabels[profile.smokingEnvironment] }
      ]
    : [];
  return (
    <article className={`rm-roommate-card rm-roommate-discovery-card ${styles.personCard}`}>
      <div className="rm-roommate-card-body space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <RoommateAvatar displayName={profile?.displayName ?? null} />
            <div className="min-w-0">
              <p className="rm-roommate-section-label">
                {request.listingMode === "LINKED" ? "Đã có phòng đang cân nhắc" : "Cùng tìm phòng phù hợp"}
              </p>
              <h2 className="mt-1 truncate font-display text-heading-sm font-bold text-foreground">
                {profile?.displayName ?? "Người thuê RentMate"}
              </h2>
            </div>
          </div>
          <RoommateStatusPill status={request.status} label={roommateRequestStatusLabels[request.status]} />
        </header>
        <div className="flex flex-wrap gap-2 text-ui-xs text-muted-foreground">
          {profile?.emailVerified || profile?.phoneVerified ? (
            <span className="rm-roommate-chip">
              <Icon name="shield" className="h-3.5 w-3.5" /> Đã xác minh
            </span>
          ) : null}
          {memberSince ? <span className="rm-roommate-chip">Thành viên từ {memberSince}</span> : null}
        </div>
        {profile?.intro ? <p className="rm-roommate-discovery-intro">{profile.intro}</p> : null}
        {lifestyle.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Phong cách sống">
            {lifestyle.map((item) => (
              <li className="rm-roommate-chip" key={item.label}>
                {item.label}: {item.value}
              </li>
            ))}
          </ul>
        ) : null}
        <dl className="rm-roommate-discovery-facts">
          <div>
            <dt>Ngân sách mỗi người</dt>
            <dd>
              {new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 6 }).format(
                request.budgetMinPerPerson / 1_000_000
              )}{" "}
              –{" "}
              {new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 6 }).format(
                request.budgetMaxPerPerson / 1_000_000
              )}{" "}
              triệu
            </dd>
          </div>
          <div>
            <dt>Chuyển vào</dt>
            <dd>
              {request.moveInFrom.split("-").reverse().join("/")} – {request.moveInUntil.split("-").reverse().join("/")}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt>Khu vực quan tâm</dt>
            <dd>
              {request.listing
                ? formatAreaLabel(request.listing.areaName)
                : request.preferredAreaKeys.map(formatAreaLabel).join(" · ")}
            </dd>
          </div>
        </dl>
        <DiscoveryCompatibility request={request} />
        {request.note ? (
          <details className={styles.note}>
            <summary>Lời nhắn từ người đăng</summary>
            <p>{request.note}</p>
          </details>
        ) : null}
        {request.listing ? (
          <div className="rm-roommate-discovery-listing">
            <div className="min-w-0">
              <p className="rm-roommate-section-label">Phòng đang cân nhắc</p>
              <p className="mt-1 truncate font-semibold text-foreground">{request.listing.title}</p>
              <p className="mt-1 text-ui-xs text-muted-foreground">
                {formatAreaLabel(request.listing.areaName)} · {formatRoommateMoney(request.listing.monthlyRent)}/tháng
              </p>
            </div>
            <Link
              className="shrink-0 text-ui-xs font-bold text-primary underline decoration-1 underline-offset-4"
              href={`/listings/${request.listing.id}`}
            >
              Xem tin đăng
            </Link>
          </div>
        ) : (
          <div className="rm-roommate-discovery-listing">
            <div>
              <p className="font-semibold text-foreground">Chưa chọn phòng cụ thể</p>
            </div>
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-ui-xs text-muted-foreground">Mở từ {formatRoommateDate(request.createdAt.slice(0, 10))}</p>
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-4 text-ui-sm font-bold text-primary-foreground shadow-surface transition-[background-color,transform] duration-fast hover:-translate-y-0.5 hover:bg-primary-hover"
            href={`/roommates/requests/${request.id}`}
            scroll
            onClick={resetRequestDetailScroll}
          >
            Xem yêu cầu <Icon name="arrow" className="h-4 w-4" />
          </Link>
        </footer>
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
          <Icon name="sparkles" className="h-4 w-4" /> Gợi ý AI
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={onDismiss}>
          Ẩn trong phiên này
        </Button>
      </div>
      <div className="space-y-4 p-4">
        <ul className="flex flex-wrap gap-2" aria-label="Lý do gợi ý">
          {item.recommendation.reasonCodes.map((code) => (
            <li className="rm-roommate-chip" key={code}>
              {recommendationReasonLabels[code]}
            </li>
          ))}
        </ul>
        <DiscoveryCard request={item.request} />
      </div>
    </div>
  );
}
function DiscoveryCardSkeleton() {
  return (
    <div className="rm-roommate-card rm-roommate-card-static space-y-4 p-5" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton rounded="card" className="h-12 w-12" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    </div>
  );
}

function DiscoveryContent() {
  const { status: authStatus, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tenantReady = authStatus === "authenticated" && user?.role === "TENANT" && user.isActive;
  const searchParamKey = searchParams.toString();
  const urlState = useMemo(() => parseDiscoveryUrlState(new URLSearchParams(searchParamKey)), [searchParamKey]);
  const appliedForm = urlState.form;
  const appliedPage = urlState.page;
  const [form, setForm] = useState<DiscoveryForm>(() => urlState.form);
  const [retryVersion, setRetryVersion] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [result, setResult] = useState<ApiPage<RoommateRequest> | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [recommendationCapability, setRecommendationCapability] = useState(false);
  const [recommendationOpen, setRecommendationOpen] = useState(false);
  const [recommendationState, setRecommendationState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [recommendationResult, setRecommendationResult] = useState<RoommateAiRecommendations | null>(null);
  const [recommendationError, setRecommendationError] = useState<ApiError | null>(null);
  const [dismissedRecommendationIds, setDismissedRecommendationIds] = useState<ReadonlySet<number>>(new Set());
  const query = useMemo(() => queryFromForm(appliedForm, appliedPage), [appliedForm, appliedPage]);
  useEffect(() => {
    setForm((current) => (JSON.stringify(current) === JSON.stringify(appliedForm) ? current : appliedForm));
  }, [appliedForm]);
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
  }, [query, retryVersion, tenantReady]);
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
  const navigate = (nextForm: DiscoveryForm, page: number) =>
    router.push(discoveryUrl(pathname, searchParams, nextForm, page));
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
    navigate(form, 1);
  };
  const reset = () => {
    setForm(initialForm);
    navigate(initialForm, 1);
  };
  return (
    <div className={`rm-roommate-page ${styles.page}`}>
      <RoommatePageHeader
        title="Cùng nhà. Cùng nhịp sống."
        description="Tìm người ở ghép hợp nhu cầu, bắt đầu từ một cuộc trò chuyện."
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
      <Card className={`rm-roommate-card-static ${styles.filters}`}>
        <button
          className={styles.filterToggle}
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="discovery-filter-form"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <span>
            <Icon name="sliders" className="h-5 w-5" /> Bộ lọc{appliedForm.area ? ` · ${appliedForm.area}` : ""}
          </span>
          <span>{filtersOpen ? "Thu gọn" : "Mở bộ lọc"}</span>
        </button>
        <form id="discovery-filter-form" data-expanded={filtersOpen} className={styles.filterForm} onSubmit={submit}>
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-subtle text-primary-hover">
                <Icon name="sliders" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-heading-sm font-bold text-foreground">Lọc yêu cầu ở ghép</h2>
                <p className="mt-1 text-ui-sm text-muted-foreground">Chọn những điều quan trọng với bạn.</p>
              </div>
            </div>
          </div>
          <div>
            <InputField
              id="roommate-discovery-area"
              name="area"
              label="Khu vực"
              value={form.area}
              maxLength={120}
              placeholder="Ví dụ: Quận 3"
              onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
            />
          </div>
          <fieldset className={styles.range}>
            <legend>Ngân sách mỗi người · đ/tháng</legend>
            <div className={styles.rangeInputs}>
              <InputField
                id="roommate-discovery-budget-min"
                name="budgetMinPerPerson"
                label="Từ"
                type="number"
                min="1"
                inputMode="numeric"
                placeholder="Không giới hạn"
                value={form.budgetMinPerPerson}
                onChange={(event) => setForm((current) => ({ ...current, budgetMinPerPerson: event.target.value }))}
              />
              <InputField
                id="roommate-discovery-budget-max"
                name="budgetMaxPerPerson"
                label="Đến"
                type="number"
                min="1"
                inputMode="numeric"
                placeholder="Không giới hạn"
                value={form.budgetMaxPerPerson}
                onChange={(event) => setForm((current) => ({ ...current, budgetMaxPerPerson: event.target.value }))}
              />
            </div>
          </fieldset>
          <div>
            <SelectField
              id="roommate-discovery-listing-mode"
              name="listingMode"
              label="Hình thức tìm phòng"
              value={form.listingMode}
              onChange={(event) =>
                setForm((current) => ({ ...current, listingMode: event.target.value as DiscoveryForm["listingMode"] }))
              }
            >
              <option value="ALL">Tất cả</option>
              <option value="LINKED">Đã có phòng đang cân nhắc</option>
              <option value="UNLINKED">Cùng tìm phòng phù hợp</option>
            </SelectField>
          </div>
          <fieldset className={styles.range}>
            <legend>Thời gian dự kiến chuyển vào</legend>
            <div className={styles.rangeInputs}>
              <InputField
                id="roommate-discovery-move-from"
                name="moveInFrom"
                label="Từ ngày"
                type="date"
                value={form.moveInFrom}
                onChange={(event) => setForm((current) => ({ ...current, moveInFrom: event.target.value }))}
              />
              <InputField
                id="roommate-discovery-move-until"
                name="moveInUntil"
                label="Đến ngày"
                type="date"
                value={form.moveInUntil}
                onChange={(event) => setForm((current) => ({ ...current, moveInUntil: event.target.value }))}
              />
            </div>
          </fieldset>
          <div className={styles.filterActions}>
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
        <Card className={`rm-roommate-ai-panel rm-roommate-card-static ${styles.ai}`}>
          <div className="space-y-5" role="region" aria-label="Gợi ý người ở ghép bằng AI">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="rm-roommate-ai-label">
                  <Icon name="sparkles" className="h-4 w-4" /> Gợi ý riêng
                </p>
                <h2 className="mt-3 font-display text-heading-md font-bold text-foreground">
                  Gợi ý người ở ghép bằng AI
                </h2>
                <p className="mt-1 text-ui-sm leading-6 text-muted-foreground">
                  Nhận một số gợi ý dựa trên nhu cầu và phong cách sống bạn đã cung cấp.
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
                {recommendationOpen ? "Ẩn gợi ý" : "Gợi ý cho tôi"}
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
                tone="neutral"
                title={
                  recommendationError?.status === 429 ? "Gợi ý AI đang tạm giới hạn" : "Hiện chưa thể tạo gợi ý AI"
                }
                message={
                  recommendationError?.status === 429
                    ? "Vui lòng thử lại sau."
                    : "Bạn vẫn có thể tiếp tục xem danh sách bên dưới."
                }
                action={<Button onClick={loadRecommendations}>Thử lại</Button>}
              />
            ) : null}
            {recommendationOpen &&
            recommendationState === "success" &&
            recommendationResult?.reason === "INSUFFICIENT_SEMANTIC_EVIDENCE" ? (
              <EmptyState
                title="Chưa có gợi ý phù hợp từ AI lúc này"
                description="Bạn vẫn có thể tiếp tục xem danh sách bên dưới."
                action={
                  <Link className="font-bold underline decoration-2 underline-offset-4" href="/roommates/my-request">
                    Chỉnh sửa nhu cầu ở ghép
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
                description="Bạn vẫn có thể tiếp tục xem danh sách bên dưới."
              />
            ) : null}
            {recommendationOpen ? (
              <Link
                className="inline-flex min-h-11 items-center font-bold underline decoration-2 underline-offset-4"
                href="/roommates/my-request"
              >
                Chỉnh sửa nhu cầu ở ghép
              </Link>
            ) : null}
          </div>
        </Card>
      ) : null}
      <section className={`space-y-4 ${styles.results}`} aria-labelledby="roommate-normal-discovery-heading">
        <div className={styles.resultsHeading}>
          <h2
            id="roommate-normal-discovery-heading"
            className="mt-1 font-display text-heading-lg font-bold text-foreground"
          >
            Các yêu cầu đang mở
          </h2>
          <p className="mt-1 text-ui-sm text-muted-foreground" role="status">
            {state === "success" && result
              ? `${result.data.length} yêu cầu trên trang này`
              : "Tìm một người bạn cùng nhà"}
          </p>
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
            action={<Button onClick={() => setRetryVersion((value) => value + 1)}>Thử lại</Button>}
          />
        ) : null}
        {state === "success" && result?.data.length === 0 ? (
          <EmptyState
            title="Chưa tìm thấy yêu cầu phù hợp"
            description="Thử điều chỉnh khu vực, ngân sách hoặc thời gian dự kiến chuyển vào."
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
            {result.pagination.page > 1 || result.pagination.hasNextPage ? (
              <Pagination
                compact
                ariaLabel="Phân trang yêu cầu ở ghép"
                page={result.pagination.page}
                hasNextPage={result.pagination.hasNextPage}
                onPrevious={() => navigate(urlState.form, Math.max(1, urlState.page - 1))}
                onNext={() => navigate(urlState.form, urlState.page + 1)}
              />
            ) : null}
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
