"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
import { api, ApiError } from "../../lib/api/client";
import { formatAreaLabel } from "../../lib/area";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ListingNote } from "../../types/api";
import { ComparisonEvaluation, ComparisonMatrix } from "./comparison-matrix";
import { projectComparisonListing, type ComparisonListing } from "./comparison-data";
import { evaluateComparisonNeeds, type ComparisonCriterionResult } from "./comparison-needs-evaluator";
import { ComparisonNeedsPanel } from "./comparison-needs-panel";
import { useComparisonNeeds } from "./comparison-needs-state";
import { useComparisonSelection } from "./comparison-store";
import { ListingNoteEditor } from "./listing-note-editor";
import { SimilarListings } from "../listings/similar-listings";
import { RoommateListingCta } from "../roommate/roommate-listing-cta";
import { isRoommateListingEligible } from "../roommate/roommate-listing-selection";
import styles from "./compare-page.module.css";

interface ComparisonResult {
  readonly listings: readonly ComparisonListing[];
  readonly unavailableIds: readonly number[];
}

function SingleListingPreview({ listing, onRemove }: Readonly<{ listing: ComparisonListing; onRemove: () => void }>) {
  return (
    <article className={styles.preparationCard}>
      {listing.coverImage ? (
        <MediaImage
          src={listing.coverImage.url}
          alt={listing.coverImage.altText ?? `Ảnh của ${listing.title}`}
          width={112}
          height={88}
          className={styles.preparationImage}
          fallback={
            <div
              role="img"
              aria-label={listing.coverImage.altText ?? `Ảnh của ${listing.title}`}
              className={styles.preparationImageFallback}
            >
              <Icon name="home" className="h-6 w-6" />
            </div>
          }
        />
      ) : (
        <div role="img" aria-label={`Chưa có ảnh cho ${listing.title}`} className={styles.preparationImageFallback}>
          <Icon name="home" className="h-6 w-6" />
        </div>
      )}
      <div className={styles.preparationContent}>
        <p className={styles.comparisonPrice}>
          {listing.monthlyRent === null
            ? "Giá chưa cập nhật"
            : `${listing.monthlyRent.toLocaleString("vi-VN")} ₫/tháng`}
        </p>
        <h2>{listing.title}</h2>
        <p>{listing.areaName ? formatAreaLabel(listing.areaName) : "Khu vực chưa cập nhật"}</p>
      </div>
      <div className={styles.preparationActions}>
        <Link href={`/listings/${listing.id}`} className={styles.matrixDetailLink}>
          Xem chi tiết <Icon name="arrow" className="h-4 w-4" />
        </Link>
        <RoommateListingCta
          listingId={listing.id}
          eligible={isRoommateListingEligible(listing)}
          compact
          label="Cân nhắc ở ghép"
        />
        <Button variant="danger" size="sm" onClick={onRemove}>
          Bỏ khỏi so sánh
        </Button>
      </div>
    </article>
  );
}

function PreparationState({
  listings,
  selectedCount,
  onRemove
}: Readonly<{
  listings: readonly ComparisonListing[];
  selectedCount: number;
  onRemove: (listingId: number) => void;
}>) {
  if (listings.length === 1) {
    return (
      <section className={styles.preparationSection} aria-labelledby="comparison-preparation-heading">
        <div>
          <p className="rm-eyebrow">ĐÃ CHỌN {selectedCount} TIN</p>
          <h2 id="comparison-preparation-heading" className={styles.sectionTitle}>
            Chọn thêm ít nhất 1 tin để bắt đầu so sánh.
          </h2>
        </div>
        <SingleListingPreview listing={listings[0]!} onRemove={() => onRemove(listings[0]!.id)} />
        <div className="mt-8 border-t border-border pt-6">
          <SimilarListings listingId={listings[0]!.id} />
        </div>
      </section>
    );
  }
  return (
    <section className={styles.preparationSection} aria-labelledby="comparison-preparation-heading">
      <p className="rm-eyebrow">CHƯA ĐỦ DỮ LIỆU</p>
      <h2 id="comparison-preparation-heading" className={styles.sectionTitle}>
        Chưa có đủ 2 tin còn khả dụng để so sánh.
      </h2>
      <p className={styles.sectionDescription}>Bạn có thể bỏ tin không còn công khai rồi chọn thêm một tin khác.</p>
    </section>
  );
}

export function ComparePage() {
  const { listingIds, remove, clear, maximumSelections } = useComparisonSelection();
  const { status: authStatus, user } = useAuth();
  const { snapshot: needsSnapshot, applyManual, applySaved, clear: clearNeeds } = useComparisonNeeds();
  const [result, setResult] = useState<ComparisonResult>({ listings: [], unavailableIds: [] });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [notes, setNotes] = useState<ReadonlyMap<number, ListingNote>>(new Map());
  const [notesReady, setNotesReady] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (listingIds.length === 0) {
      setResult({ listings: [], unavailableIds: [] });
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    void Promise.allSettled(listingIds.map((id) => api.listings.getPublicDetail(id, controller.signal))).then(
      (settled) => {
        if (controller.signal.aborted) return;
        const listings: ComparisonListing[] = [];
        const unavailableIds: number[] = [];
        let recoverableFailure = false;
        settled.forEach((item, index) => {
          if (item.status === "fulfilled") listings.push(projectComparisonListing(item.value));
          else if (item.reason instanceof ApiError && item.reason.status === 404)
            unavailableIds.push(listingIds[index]!);
          else recoverableFailure = true;
        });
        setResult({ listings: Object.freeze(listings), unavailableIds: Object.freeze(unavailableIds) });
        setStatus(recoverableFailure ? "error" : "success");
      }
    );
    return () => controller.abort();
  }, [listingIds, retryKey]);

  useEffect(() => {
    if (authStatus !== "authenticated" || user?.role !== "TENANT" || listingIds.length === 0) {
      setNotes(new Map());
      setNotesReady(false);
      return;
    }
    const controller = new AbortController();
    setNotesReady(false);
    void api.listingNotes
      .list(listingIds, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setNotes(new Map(items.map((item) => [item.listingId, item])));
        setNotesReady(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setNotesReady(true);
      });
    return () => controller.abort();
  }, [authStatus, listingIds, user?.role]);

  const orderedListings = useMemo(() => {
    const byId = new Map(result.listings.map((listing) => [listing.id, listing]));
    return listingIds.flatMap((id) => {
      const listing = byId.get(id);
      return listing ? [listing] : [];
    });
  }, [listingIds, result.listings]);

  const evaluations = useMemo(() => {
    const byId = new Map<number, readonly ComparisonCriterionResult[]>();
    if (!needsSnapshot) return byId;
    orderedListings.forEach((listing) =>
      byId.set(listing.id, evaluateComparisonNeeds(listing, needsSnapshot.criteria))
    );
    return byId;
  }, [needsSnapshot, orderedListings]);

  const focusNeeds = () => {
    document.getElementById("comparison-needs-heading")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center"
    });
  };

  if (listingIds.length === 0) {
    return (
      <section className="rm-workspace" aria-labelledby="compare-heading">
        <EmptyState
          title="Chưa có tin đăng để so sánh"
          description={`Chọn ít nhất 2 tin đăng để bắt đầu so sánh, tối đa ${maximumSelections} tin.`}
          action={
            <Link className="font-semibold text-primary-hover underline decoration-2 underline-offset-4" href="/search">
              Tìm phòng
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <section className={`rm-workspace ${styles.comparePage}`} aria-labelledby="compare-heading">
      <header className={styles.compareHeader}>
        <div>
          <Link href="/search" className={styles.backLink}>
            <Icon name="arrow" className="h-4 w-4 rotate-180" /> Quay lại tìm phòng
          </Link>
          <h1 id="compare-heading" className={styles.pageTitle}>
            So sánh phòng
          </h1>
          <p className={styles.pageSubtitle}>
            {listingIds.length} tin đang so sánh · Tối đa {maximumSelections} tin. Đặt cạnh nhau để chọn phòng phù hợp
            với bạn.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/search" className={styles.secondaryAction}>
            <Icon name="plus" className="h-4 w-4" /> Chọn thêm
          </Link>
          <Button variant="outline" onClick={clear}>
            Xóa tất cả
          </Button>
        </div>
      </header>

      {listingIds.length === 1 ? (
        <PreparationState listings={orderedListings} selectedCount={listingIds.length} onRemove={remove} />
      ) : null}

      {status === "loading" ? <LoadingState message="Đang tải các tin để so sánh…" /> : null}
      {status === "error" ? (
        <ErrorState
          message="Một số tin chưa tải được. Các tin đã tải vẫn được giữ lại; bạn có thể thử lại."
          action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}

      {result.unavailableIds.map((id) => (
        <div key={id} className={styles.unavailableNotice}>
          <p>Tin #{id} không còn công khai hoặc không còn khả dụng.</p>
          <Button variant="danger" size="sm" onClick={() => remove(id)}>
            Bỏ khỏi so sánh
          </Button>
        </div>
      ))}

      {listingIds.length >= 2 && orderedListings.length < 2 && status !== "loading" ? (
        <PreparationState listings={orderedListings} selectedCount={listingIds.length} onRemove={remove} />
      ) : null}

      {listingIds.length >= 2 && orderedListings.length >= 2 ? (
        <>
          <ComparisonMatrix listings={orderedListings} needs={needsSnapshot?.criteria ?? null} onRemove={remove} />
          <ComparisonNeedsPanel
            snapshot={needsSnapshot}
            canUseSavedSearch={authStatus === "authenticated" && user?.role === "TENANT"}
            authResolved={authStatus !== "loading"}
            onApplyManual={applyManual}
            onApplySaved={applySaved}
            onClear={clearNeeds}
          />
          <ComparisonEvaluation listings={orderedListings} evaluations={evaluations} onChooseNeeds={focusNeeds} />
          <section className={styles.notesSection} aria-labelledby="comparison-notes-heading">
            <div>
              <p className="rm-eyebrow">RIÊNG TƯ</p>
              <h2 id="comparison-notes-heading" className={styles.sectionTitle}>
                Ghi chú riêng
              </h2>
              <p className={styles.sectionDescription}>
                Ghi chú không tham gia đánh giá và chỉ tài khoản người thuê của bạn nhìn thấy.
              </p>
            </div>
            <div className={styles.notesGrid}>
              {orderedListings.map((listing) => (
                <article key={listing.id} className={styles.noteCard}>
                  <p className={styles.noteTitle}>{listing.title}</p>
                  {authStatus === "authenticated" && user?.role === "TENANT" && !notesReady ? (
                    <p className="text-ui-sm font-semibold text-muted-foreground">Đang tải ghi chú…</p>
                  ) : (
                    <ListingNoteEditor
                      listingId={listing.id}
                      initialNote={notesReady ? (notes.get(listing.id) ?? null) : undefined}
                      onChanged={(note) => {
                        setNotes((current) => {
                          const next = new Map(current);
                          if (note) next.set(listing.id, note);
                          else next.delete(listing.id);
                          return next;
                        });
                      }}
                    />
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
