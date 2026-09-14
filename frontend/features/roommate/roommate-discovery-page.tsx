"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { MotionConfig, motion } from "framer-motion";
import { CalendarDays, MapPin, CigaretteOff, PawPrint, Moon, MessageCircle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState, ErrorState } from "../../components/ui/feedback-states";
import { InputField, SelectField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
import { Skeleton } from "../../components/ui/skeleton";
import { cx } from "../../components/ui/class-names";
import styles from "./roommate-discovery.module.css";
import { DiscoveryFilters } from "./roommate-discovery-filters";
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
  formatRoommateMoney,
  formatRoommateDate,
  roommateErrorMessage,
  roommateRequestStatusLabels,
  roommateSmokingLabels,
  roommatePetLabels,
  roommateSleepScheduleLabels
} from "./roommate-content";
import { RoommateAvatar, RoommatePageHeader, RoommateStatusPill, RoommateTenantBoundary } from "./roommate-shared";
import {
  roommateCompatibilityDimensionLabels,
  roommateCompatibilityCategoryLabels,
  roommateCompatibilityExplanation,
  roommateCompatibilityOutcomeLabels,
  selectRoommateCompatibilityHighlights
} from "./roommate-v2";

const revealViewport = {
  once: true,
  amount: 0.18,
  margin: "0px 0px -60px 0px"
} as const;

type DiscoveryNextStep = "profile" | "interests" | "request" | "create";

const revealTransition = {
  duration: 0.25,
  ease: [0.22, 1, 0.36, 1]
} as const;

const revealVariants = {
  hidden: { opacity: 1, y: 8, scale: 1 },
  visible: { opacity: 1, y: 0, scale: 1, transition: revealTransition }
} as const;

const staggerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035 } }
} as const;

function useScrollRevealEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(typeof IntersectionObserver !== "undefined");
  }, []);

  return enabled;
}

function revealMotionProps(enabled: boolean) {
  return enabled
    ? {
        initial: "hidden" as const,
        whileInView: "visible" as const,
        viewport: revealViewport,
        variants: revealVariants
      }
    : {
        initial: false as const,
        animate: "visible" as const,
        variants: revealVariants
      };
}

function staggerMotionProps(enabled: boolean) {
  return enabled
    ? {
        initial: "hidden" as const,
        whileInView: "visible" as const,
        viewport: revealViewport,
        variants: staggerVariants
      }
    : {
        initial: false as const,
        animate: "visible" as const,
        variants: staggerVariants
      };
}

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
    pageSize: 6
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
  const categoryLabel = compatibility?.category ? roommateCompatibilityCategoryLabels[compatibility.category] : null;
  if (highlights.length === 0) return null;
  return (
    <details
      className={cx(
        "rm-roommate-discovery-compatibility",
        styles.matchSignal,
        compatibility?.category === "HIGH_ALIGNMENT" && styles.matchSignalPositive,
        compatibility?.category === "IMPORTANT_DIFFERENCE" && styles.matchSignalCaution
      )}
      aria-label="Mức độ phù hợp"
    >
      <summary className={styles.compatibilityToggle}>
        <span className={styles.matchSignalSummary}>
          <span className={styles.matchSignalIcon} aria-hidden="true">
            <Icon name="compare" className="h-4 w-4" />
          </span>
          <span className={styles.matchSignalCopy}>
            <strong>{categoryLabel ?? "Điểm phù hợp"}</strong>
          </span>
        </span>
        <Icon name="chevronDown" className={styles.matchSignalChevron} />
      </summary>
      <ul className={styles.matchSignalList}>
        {highlights.map((item) => (
          <li className={styles.matchSignalItem} key={item.dimension}>
            <span className={styles.matchSignalItemIcon} aria-hidden="true">
              <Icon name={item.outcome === "ALIGNED" ? "check" : "message"} className="h-3.5 w-3.5" />
            </span>
            <span className={styles.matchSignalItemCopy}>
              <strong>{roommateCompatibilityDimensionLabels[item.dimension]}</strong>
              <span className="sr-only">{roommateCompatibilityOutcomeLabels[item.outcome]}</span>
              <em>{roommateCompatibilityExplanation(item.explanationCode)}</em>
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

function DiscoveryCard({
  request,
  featured = false,
  revealEnabled = false
}: Readonly<{ request: RoommateRequest; featured?: boolean; revealEnabled?: boolean }>) {
  const profile = request.profile;
  const isGeneratedCopy = (value: string) => /^(?:QA\s*\d{8,}|O?\d{10,}(?:[-_]|$))/i.test(value.trim());
  const displayName =
    profile?.displayName && !isGeneratedCopy(profile.displayName) ? profile.displayName : "Bạn tìm ở ghép";
  const intro = profile?.intro && !isGeneratedCopy(profile.intro) ? profile.intro : null;
  const isLinked = request.listingMode === "LINKED";
  const lifestyle = profile
    ? [
        { label: "Thuốc lá", value: roommateSmokingLabels[profile.smokingEnvironment], icon: CigaretteOff },
        { label: "Thú cưng", value: roommatePetLabels[profile.petEnvironment], icon: PawPrint },
        { label: "Giờ giấc", value: roommateSleepScheduleLabels[profile.sleepSchedule], icon: Moon }
      ]
    : [];
  const cardVariant = isLinked ? styles.linkedCard : styles.openCard;
  const cardRevealProps = revealMotionProps(revealEnabled);
  return (
    <motion.article
      className={cx(
        "rm-roommate-card rm-roommate-discovery-card",
        styles.personCard,
        cardVariant,
        featured && styles.featuredCard
      )}
      {...cardRevealProps}
      data-card-variant={isLinked ? "linked" : "open"}
      data-featured={featured ? "true" : undefined}
      variants={revealVariants}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {isLinked && request.listing ? (
        <div className={styles.cardMedia}>
          <MediaImage
            src={request.listing.coverImage.url}
            alt={request.listing.coverImage.altText ?? `Ảnh của ${request.listing.title}`}
            fill
            sizes="(min-width: 1280px) 42vw, (min-width: 768px) 70vw, 100vw"
            className={styles.cardMediaImage}
            fallback={
              <div role="img" aria-label={`Ảnh của ${request.listing.title}`} className={styles.cardMediaFallback}>
                <Icon name="home" className="h-8 w-8" />
                <span>Hình ảnh phòng</span>
              </div>
            }
          />
          <div className={styles.cardMediaOverlay}>
            <span>
              <Icon name="home" className="h-3.5 w-3.5" /> Phòng đang cân nhắc
            </span>
          </div>
        </div>
      ) : null}
      <div className="rm-roommate-card-body">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={styles.avatarFrame} data-tone={request.id % 4}>
              <RoommateAvatar displayName={displayName} />
            </span>
            <div className="min-w-0">
              <p className={styles.intentLabel}>
                <Icon name={isLinked ? "home" : "users"} className="h-3.5 w-3.5" />
                {isLinked ? "Đã có phòng đang cân nhắc" : "Cùng tìm phòng phù hợp"}
              </p>
              <h2 className="mt-1 truncate font-display text-heading-sm font-bold text-foreground">{displayName}</h2>
            </div>
          </div>
          <RoommateStatusPill status={request.status} label={roommateRequestStatusLabels[request.status]} />
        </header>
        {profile?.emailVerified || profile?.phoneVerified ? (
          <div className={styles.identityMeta}>
            <span className={cx("rm-roommate-chip", styles.verifiedChip)}>
              <Icon name="shield" className="h-3.5 w-3.5" /> Đã xác minh
            </span>
          </div>
        ) : null}
        {intro ? (
          <div className={styles.introBlock}>
            <p className="rm-roommate-discovery-intro">{intro}</p>
          </div>
        ) : null}
        {lifestyle.length > 0 ? (
          <ul className={styles.lifestyleGroup} aria-label="Phong cách sống">
            {lifestyle.map((item) => (
              <li className="rm-roommate-chip" key={item.label}>
                <item.icon size={14} aria-hidden="true" />
                <span className="sr-only">{item.label}: </span>
                {item.value}
              </li>
            ))}
          </ul>
        ) : null}
        <dl className={cx("rm-roommate-discovery-facts", styles.factsGrid)}>
          <div>
            <dt>
              <Icon name="ruler" className="h-3.5 w-3.5" /> Ngân sách mỗi người
            </dt>
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
            <dt>
              <Icon name="map" className="h-3.5 w-3.5" /> Khu vực quan tâm
            </dt>
            <dd>
              {request.listing
                ? formatAreaLabel(request.listing.areaName)
                : request.preferredAreaKeys.map(formatAreaLabel).join(" · ")}
            </dd>
          </div>
        </dl>
        <DiscoveryCompatibility request={request} />
        {request.listing ? (
          <div className={cx("rm-roommate-discovery-listing", styles.listingContext)}>
            <div className="min-w-0">
              <p className={styles.microLabel}>Phòng đang cân nhắc</p>
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
        ) : null}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className={styles.cardActions}>
            <Link
              href={`/roommates/requests/${request.id}#roommate-interest-heading`}
              className={styles.contactAction}
              aria-label={`Gửi lời quan tâm tới ${displayName}`}
              title="Gửi lời quan tâm"
            >
              <MessageCircle size={19} aria-hidden="true" />
            </Link>
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-4 text-ui-sm font-bold text-primary-foreground shadow-surface transition-[background-color,transform] duration-fast hover:-translate-y-0.5 hover:bg-primary-hover"
              href={`/roommates/requests/${request.id}`}
              scroll
              onClick={resetRequestDetailScroll}
            >
              Xem yêu cầu <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        </footer>
      </div>
    </motion.article>
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
  onDismiss,
  revealEnabled
}: Readonly<{ item: RoommateAiRecommendationItem; onDismiss: () => void; revealEnabled: boolean }>) {
  return (
    <motion.div
      className="rm-roommate-card rm-roommate-card-static"
      aria-label="Gợi ý bằng AI"
      variants={revealVariants}
    >
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
        <DiscoveryCard request={item.request} revealEnabled={revealEnabled} />
      </div>
    </motion.div>
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
  const scrollRevealEnabled = useScrollRevealEnabled();
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
  const resultsRef = useRef<HTMLElement>(null);
  const scrollAfterNavigation = useRef<string | null>(null);
  const [result, setResult] = useState<ApiPage<RoommateRequest> | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [recommendationCapability, setRecommendationCapability] = useState(false);
  const [recommendationOpen, setRecommendationOpen] = useState(false);
  const [recommendationState, setRecommendationState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [recommendationResult, setRecommendationResult] = useState<RoommateAiRecommendations | null>(null);
  const [recommendationError, setRecommendationError] = useState<ApiError | null>(null);
  const [dismissedRecommendationIds, setDismissedRecommendationIds] = useState<ReadonlySet<number>>(new Set());
  const [nextStep, setNextStep] = useState<DiscoveryNextStep | null>(null);
  const query = useMemo(() => queryFromForm(appliedForm, appliedPage), [appliedForm, appliedPage]);
  useEffect(() => {
    if (scrollAfterNavigation.current === null || scrollAfterNavigation.current === searchParamKey) return;
    scrollAfterNavigation.current = null;
    resultsRef.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
    document.getElementById("roommate-normal-discovery-heading")?.focus({ preventScroll: true });
  }, [searchParamKey]);
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
  useEffect(() => {
    if (!tenantReady || !user?.id) {
      setNextStep(null);
      return;
    }
    const controller = new AbortController();
    setNextStep(null);
    const profilePromise = api.roommates.getProfile(controller.signal).then(
      (profile) => ({ kind: "ready" as const, complete: profile.profileCompleted }),
      (caught: unknown) => ({ kind: "error" as const, missing: caught instanceof ApiError && caught.status === 404 })
    );
    const openRequestPromise = api.roommates
      .listMine({ status: "OPEN", page: 1, pageSize: 1 }, controller.signal)
      .catch(() => null);
    const incomingInterestPromise = api.roommates
      .listInterests({ direction: "INCOMING", status: "PENDING", page: 1, pageSize: 1 }, controller.signal)
      .catch(() => null);
    void Promise.all([profilePromise, openRequestPromise, incomingInterestPromise]).then(
      ([profileResult, openRequests, incomingInterests]) => {
        if (controller.signal.aborted) return;
        if (profileResult.kind === "error" && !profileResult.missing) return;
        if (profileResult.kind === "error" || !profileResult.complete) {
          setNextStep("profile");
          return;
        }
        if (incomingInterests?.data.length) {
          setNextStep("interests");
          return;
        }
        setNextStep(openRequests?.data.length ? "request" : "create");
      }
    );
    return () => controller.abort();
  }, [tenantReady, user?.id]);
  const navigate = (nextForm: DiscoveryForm, page: number) =>
    router.push(discoveryUrl(pathname, searchParams, nextForm, page));
  const changePage = (page: number) => {
    scrollAfterNavigation.current = searchParamKey;
    navigate(appliedForm, page);
  };
  const loadRecommendations = () => {
    setRecommendationState("loading");
    setRecommendationResult(null);
    setRecommendationError(null);
    void api.roommates
      .getAiRecommendations({ filters: recommendationFilters(query), limit: 6, locale: "vi" })
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
  const featuredRequestId =
    result?.data.find((request) => request.compatibility?.category === "HIGH_ALIGNMENT")?.id ?? null;
  const revealProps = revealMotionProps(scrollRevealEnabled);
  const staggerProps = staggerMotionProps(scrollRevealEnabled);
  const sliderMax = Math.max(15_000_000, Number(form.budgetMinPerPerson) || 0, Number(form.budgetMaxPerPerson) || 0);
  const sliderLow = Number(form.budgetMinPerPerson) || 0;
  const sliderHigh = Number(form.budgetMaxPerPerson) || sliderMax;
  const hasFilters = [form, appliedForm].some((value) =>
    Object.entries(initialForm).some(([key, emptyValue]) => value[key as keyof DiscoveryForm] !== emptyValue)
  );
  const activeFilters: { key: string; label: string; cleared: Partial<DiscoveryForm> }[] = [];
  if (appliedForm.area) activeFilters.push({ key: "area", label: appliedForm.area, cleared: { area: "" } });
  if (appliedForm.budgetMinPerPerson || appliedForm.budgetMaxPerPerson) {
    const min = appliedForm.budgetMinPerPerson;
    const max = appliedForm.budgetMaxPerPerson;
    activeFilters.push({
      key: "budget",
      label:
        min && max
          ? `${formatRoommateMoney(Number(min))} – ${formatRoommateMoney(Number(max))}/người`
          : `${min ? "Từ" : "Đến"} ${formatRoommateMoney(Number(min || max))}/người`,
      cleared: { budgetMinPerPerson: "", budgetMaxPerPerson: "" }
    });
  }
  if (appliedForm.listingMode !== "ALL")
    activeFilters.push({
      key: "mode",
      label: appliedForm.listingMode === "LINKED" ? "Đã có phòng đang cân nhắc" : "Cùng tìm phòng phù hợp",
      cleared: { listingMode: "ALL" }
    });
  if (appliedForm.moveInFrom || appliedForm.moveInUntil)
    activeFilters.push({
      key: "date",
      label: [
        appliedForm.moveInFrom ? `Từ ${formatRoommateDate(appliedForm.moveInFrom)}` : "",
        appliedForm.moveInUntil ? `đến ${formatRoommateDate(appliedForm.moveInUntil)}` : ""
      ]
        .filter(Boolean)
        .join(" "),
      cleared: { moveInFrom: "", moveInUntil: "" }
    });
  return (
    <MotionConfig reducedMotion="user">
      <div className={`rm-roommate-page ${styles.page}`}>
        <motion.div className={styles.heroReveal} {...revealProps}>
          <RoommatePageHeader
            title="Cùng nhà. Cùng nhịp sống."
            description="Tìm người ở ghép hợp nhu cầu, bắt đầu từ một cuộc trò chuyện."
          />
        </motion.div>
        {nextStep ? (
          <motion.section className={styles.nextStep} aria-labelledby="roommate-next-step-title" {...revealProps}>
            <div className={styles.nextStepCopy}>
              <p className="rm-roommate-section-label">Bước tiếp theo</p>
              <h2 id="roommate-next-step-title">
                {nextStep === "profile"
                  ? "Hoàn thiện hồ sơ ở ghép"
                  : nextStep === "interests"
                    ? "Xem lời quan tâm đang chờ"
                    : nextStep === "request"
                      ? "Yêu cầu của bạn đang mở"
                      : "Bạn đã sẵn sàng tìm người ở ghép"}
              </h2>
              <p>
                {nextStep === "profile"
                  ? "Chia sẻ thói quen sống để mọi người hiểu bạn hơn trước khi kết nối."
                  : nextStep === "interests"
                    ? "Có người muốn tìm hiểu thêm về nhu cầu ở ghép của bạn."
                    : nextStep === "request"
                      ? "Xem lại khu vực, ngân sách và thời gian chuyển vào bạn đã chia sẻ."
                      : "Cho mọi người biết khu vực, ngân sách và thời gian bạn đang tìm."}
              </p>
            </div>
            <Link
              className={styles.nextStepAction}
              href={
                nextStep === "profile"
                  ? "/roommates/profile"
                  : nextStep === "interests"
                    ? "/roommates/interests"
                    : "/roommates/my-request"
              }
            >
              {nextStep === "profile"
                ? "Hoàn thiện hồ sơ"
                : nextStep === "interests"
                  ? "Xem lời quan tâm"
                  : nextStep === "request"
                    ? "Xem yêu cầu"
                    : "Tạo yêu cầu"}
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </motion.section>
        ) : null}
        <DiscoveryFilters count={activeFilters.length} hasFilters={hasFilters} onReset={reset}>
          <form id="discovery-filter-form" className={styles.filterForm} onSubmit={submit}>
            <div className={styles.filterHeading}>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-subtle text-primary-hover">
                  <Icon name="sliders" className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-heading-sm font-bold text-foreground">Lọc yêu cầu ở ghép</h2>
                </div>
              </div>
            </div>
            <div>
              <InputField
                id="roommate-discovery-area"
                name="area"
                label="Khu vực"
                leadingIcon={<MapPin size={18} aria-hidden="true" />}
                value={form.area}
                maxLength={120}
                placeholder="Ví dụ: Quận 3"
                onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
              />
            </div>
            <fieldset className={styles.range}>
              <legend>Ngân sách mỗi người · đ/tháng</legend>
              <div className={styles.budgetSlider}>
                <div className={styles.sliderTrack} aria-hidden="true">
                  <span
                    style={{
                      left: `${(sliderLow / sliderMax) * 100}%`,
                      right: `${100 - (sliderHigh / sliderMax) * 100}%`
                    }}
                  />
                </div>
                <input
                  aria-label="Ngân sách tối thiểu"
                  type="range"
                  min={0}
                  max={sliderMax}
                  step={sliderLow % 100000 === 0 ? 100000 : 1}
                  value={sliderLow}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      budgetMinPerPerson: String(Math.min(Number(event.target.value), sliderHigh)).replace(/^0$/, "")
                    }))
                  }
                />
                <input
                  aria-label="Ngân sách tối đa"
                  type="range"
                  min={0}
                  max={sliderMax}
                  step={sliderHigh % 100000 === 0 ? 100000 : 1}
                  value={sliderHigh}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      budgetMaxPerPerson: String(Math.max(100000, sliderLow, Number(event.target.value)))
                    }))
                  }
                />
              </div>
              <details className={styles.budgetEditor}>
                <summary aria-label="Nhập ngân sách chính xác" className={styles.budgetSummary}>
                  <span>{form.budgetMinPerPerson ? formatRoommateMoney(sliderLow) : "Không giới hạn"}</span>
                  <span aria-hidden="true"> — </span>
                  <span>{form.budgetMaxPerPerson ? formatRoommateMoney(sliderHigh) : "Không giới hạn"}</span>
                </summary>
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
              </details>
              <p className={styles.sliderHint}>Kéo để chọn, bấm mức tiền để nhập chính xác.</p>
            </fieldset>
            <div>
              <SelectField
                id="roommate-discovery-listing-mode"
                name="listingMode"
                label="Hình thức tìm phòng"
                value={form.listingMode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    listingMode: event.target.value as DiscoveryForm["listingMode"]
                  }))
                }
              >
                <option value="ALL">Tất cả</option>
                <option value="LINKED">Đã có phòng đang cân nhắc</option>
                <option value="UNLINKED">Cùng tìm phòng phù hợp</option>
              </SelectField>
            </div>
            <details
              className={styles.moreFilters}
              key={`${appliedForm.moveInFrom}:${appliedForm.moveInUntil}`}
              open={Boolean(appliedForm.moveInFrom || appliedForm.moveInUntil)}
            >
              <summary>Bộ lọc thêm{form.moveInFrom || form.moveInUntil ? " · Có lọc ngày" : ""}</summary>
              <fieldset className={styles.range}>
                <legend>Thời gian dự kiến chuyển vào</legend>
                <div className={styles.rangeInputs}>
                  <InputField
                    id="roommate-discovery-move-from"
                    name="moveInFrom"
                    label="Từ ngày"
                    type="date"
                    leadingIcon={<CalendarDays size={16} aria-hidden="true" />}
                    value={form.moveInFrom}
                    onChange={(event) => setForm((current) => ({ ...current, moveInFrom: event.target.value }))}
                  />
                  <InputField
                    id="roommate-discovery-move-until"
                    name="moveInUntil"
                    label="Đến ngày"
                    type="date"
                    leadingIcon={<CalendarDays size={16} aria-hidden="true" />}
                    value={form.moveInUntil}
                    onChange={(event) => setForm((current) => ({ ...current, moveInUntil: event.target.value }))}
                  />
                </div>
              </fieldset>
            </details>
            <div className={styles.filterActions}>
              <Button type="submit" className="w-full sm:w-auto">
                Lọc yêu cầu
              </Button>
              {hasFilters ? (
                <button type="button" className={styles.resetFilters} onClick={reset}>
                  Xóa bộ lọc
                </button>
              ) : null}
            </div>
          </form>
        </DiscoveryFilters>
        {recommendationCapability ? (
          <motion.div className={styles.aiSlot} {...revealProps}>
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
                      <Link
                        className="font-bold underline decoration-2 underline-offset-4"
                        href="/roommates/my-request"
                      >
                        Chỉnh sửa nhu cầu ở ghép
                      </Link>
                    }
                  />
                ) : null}
                {recommendationOpen &&
                recommendationState === "success" &&
                recommendationResult &&
                recommendationResult.items.filter((item) => !dismissedRecommendationIds.has(item.request.id)).length >
                  0 ? (
                  <motion.div className="grid gap-5 xl:grid-cols-2" {...staggerProps}>
                    {recommendationResult.items
                      .filter((item) => !dismissedRecommendationIds.has(item.request.id))
                      .map((item) => (
                        <RecommendationCard
                          key={item.request.id}
                          item={item}
                          revealEnabled={scrollRevealEnabled}
                          onDismiss={() =>
                            setDismissedRecommendationIds((current) => new Set([...current, item.request.id]))
                          }
                        />
                      ))}
                  </motion.div>
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
          </motion.div>
        ) : null}
        <motion.section
          ref={resultsRef}
          className={`space-y-4 ${styles.results}`}
          aria-labelledby="roommate-normal-discovery-heading"
          {...revealProps}
        >
          <div className={styles.resultsHeading}>
            <h2
              id="roommate-normal-discovery-heading"
              tabIndex={-1}
              className="mt-1 font-display text-heading-lg font-bold text-foreground"
            >
              Các yêu cầu đang mở
            </h2>
            <div className={styles.resultMeta}>
              <p className="text-ui-sm text-muted-foreground" role="status" aria-live="polite">
                {state === "success" && result
                  ? `${result.data.length} yêu cầu trên trang này`
                  : state === "error"
                    ? "Chưa tải được kết quả"
                    : "Đang tìm người bạn cùng nhà…"}
              </p>
              <span className={styles.sortLabel}>
                <CalendarDays size={14} aria-hidden="true" /> Mới nhất trước
              </span>
            </div>
          </div>
          {activeFilters.length > 0 ? (
            <div className={styles.activeFilters} role="group" aria-label="Bộ lọc đang áp dụng">
              {activeFilters.map((filter) => (
                <motion.button
                  key={filter.key}
                  type="button"
                  className={styles.filterChip}
                  initial={{ y: 4 }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.18 }}
                  aria-label={`Bỏ lọc: ${filter.label}`}
                  onClick={() => {
                    const next = { ...appliedForm, ...filter.cleared };
                    setForm(next);
                    navigate(next, 1);
                  }}
                >
                  <span>{filter.label}</span>
                  <Icon name="close" className="h-3.5 w-3.5" />
                </motion.button>
              ))}
            </div>
          ) : null}
          {state === "idle" || state === "loading" ? (
            <div className="grid gap-5 xl:grid-cols-2" role="status" aria-label="Đang tìm yêu cầu ở ghép">
              {Array.from({ length: 6 }, (_, index) => (
                <DiscoveryCardSkeleton key={index} />
              ))}
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
                activeFilters.length > 0 ? (
                  <Button onClick={reset}>Xóa điều kiện lọc</Button>
                ) : (
                  <Link className="font-bold underline decoration-2 underline-offset-4" href="/roommates/my-request">
                    Tạo yêu cầu của bạn
                  </Link>
                )
              }
            />
          ) : null}
          {state === "success" && result && result.data.length > 0 ? (
            <div className="space-y-5">
              <motion.div className={`grid gap-5 xl:grid-cols-2 ${styles.resultsGrid}`} {...staggerProps}>
                {result.data.map((request) => (
                  <DiscoveryCard
                    key={request.id}
                    request={request}
                    featured={request.id === featuredRequestId}
                    revealEnabled={scrollRevealEnabled}
                  />
                ))}
              </motion.div>
              {result.pagination.page > 1 || result.pagination.hasNextPage ? (
                <nav className={styles.pagination} aria-label="Phân trang yêu cầu ở ghép">
                  <button
                    type="button"
                    aria-label="Trang trước"
                    title="Trang trước"
                    disabled={result.pagination.page <= 1}
                    onClick={() => changePage(Math.max(1, urlState.page - 1))}
                  >
                    <Icon name="arrow" className="h-4 w-4 rotate-180" />
                  </button>
                  <span className={styles.pageIndicator} aria-live="polite" aria-atomic="true">
                    Trang <strong>{result.pagination.page}</strong>
                  </span>
                  <button
                    type="button"
                    aria-label="Trang sau"
                    title="Trang sau"
                    disabled={!result.pagination.hasNextPage}
                    onClick={() => changePage(urlState.page + 1)}
                  >
                    <Icon name="arrow" className="h-4 w-4" />
                  </button>
                </nav>
              ) : null}
            </div>
          ) : null}
        </motion.section>
      </div>
    </MotionConfig>
  );
}

export function RoommateDiscoveryPage() {
  return (
    <RoommateTenantBoundary>
      <DiscoveryContent />
    </RoommateTenantBoundary>
  );
}
