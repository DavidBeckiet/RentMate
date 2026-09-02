"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ListingNote, PublicListingDetail } from "../../types/api";
import { formatAreaSqm, formatVnd } from "../listings/format";
import { useComparisonSelection } from "./comparison-store";
import { ListingNoteEditor } from "./listing-note-editor";
import { ShareListingControl } from "./share-listing-control";
import styles from "./compare-page.module.css";

interface ComparisonResult {
  readonly listings: readonly PublicListingDetail[];
  readonly unavailableIds: readonly number[];
}

export function ComparePage() {
  const { listingIds, remove, clear, maximumSelections } = useComparisonSelection();
  const { status: authStatus, user } = useAuth();
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
        const listings: PublicListingDetail[] = [];
        const unavailableIds: number[] = [];
        let recoverableFailure = false;
        settled.forEach((item, index) => {
          if (item.status === "fulfilled") listings.push(item.value);
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

  if (listingIds.length === 0) {
    return (
      <section className="rm-workspace" aria-labelledby="compare-heading">
        <EmptyState
          title="Chưa có tin nào để so sánh"
          description={`Chọn từ 2 đến ${maximumSelections} tin ở trang tìm phòng hoặc trang chi tiết.`}
          action={
            <Link className="font-semibold text-primary-hover underline decoration-2 underline-offset-4" href="/search">
              Chọn tin đăng
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <section className="rm-workspace space-y-8" aria-labelledby="compare-heading">
      <header className="rounded-overlay border border-border bg-primary-subtle p-6 shadow-surface sm:p-8">
        <span className="rm-eyebrow">BỘ SO SÁNH</span>
        <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1
              id="compare-heading"
              className="font-display text-heading-lg font-bold tracking-tight sm:text-[2.75rem]"
            >
              So sánh tin đăng
            </h1>
            <p className="mt-3 max-w-2xl text-ui-base leading-7 text-muted-foreground">
              Đang chọn {listingIds.length}/{maximumSelections} tin. Ghi chú bên dưới là riêng tư và chỉ tài khoản người
              thuê của bạn nhìn thấy.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/search"
              className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-strong bg-surface px-4 py-2 text-ui-sm font-semibold shadow-surface"
            >
              <Icon name="plus" className="h-4 w-4" /> Chọn thêm
            </Link>
            <Button variant="danger" onClick={clear}>
              Xóa danh sách
            </Button>
          </div>
        </div>
      </header>

      {listingIds.length === 1 ? (
        <p className="rounded-card border border-border bg-info-subtle p-4 text-ui-sm font-semibold text-info-foreground">
          Chọn thêm ít nhất một tin để thấy sự khác biệt rõ hơn.
        </p>
      ) : null}

      {status === "loading" ? <LoadingState message="Đang tải các tin để so sánh…" /> : null}
      {status === "error" ? (
        <ErrorState
          message="Một số tin chưa tải được. Vui lòng kiểm tra kết nối và thử lại."
          action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}

      {result.unavailableIds.map((id) => (
        <div
          key={id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger/25 bg-danger-subtle p-4"
        >
          <p className="text-sm font-bold">Tin #{id} không còn công khai hoặc không còn khả dụng.</p>
          <Button variant="danger" onClick={() => remove(id)}>
            Bỏ khỏi so sánh
          </Button>
        </div>
      ))}

      {orderedListings.length > 0 ? (
        <div className={styles.comparisonGrid} aria-label="Các tin đang so sánh">
          {orderedListings.map((listing) => {
            const image = [...listing.images].sort((left, right) => left.displayOrder - right.displayOrder)[0];
            return (
              <article key={listing.id} className={styles.comparisonCard}>
                <div className={styles.comparisonMedia}>
                  {image ? (
                    <MediaImage
                      src={image.url}
                      alt={image.altText ?? `Ảnh của ${listing.title}`}
                      fill
                      sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
                      className="object-cover"
                      fallback={
                        <div
                          role="img"
                          aria-label={image.altText ?? "Ảnh của " + listing.title}
                          className={styles.comparisonMediaFallback}
                        >
                          <Icon name="home" className="h-8 w-8" />
                        </div>
                      }
                    />
                  ) : (
                    <div className="grid h-full place-items-center p-4 text-center text-ui-sm font-semibold text-muted-foreground">
                      Chưa có ảnh
                    </div>
                  )}
                </div>
                <div className={styles.comparisonBody}>
                  <div className={styles.comparisonIdentity}>
                    <p className={styles.comparisonPrice}>{formatVnd(listing.monthlyRent)}</p>
                    <h2 className={styles.comparisonTitle}>{listing.title}</h2>
                  </div>
                  <dl className={styles.comparisonFacts}>
                    {[
                      ["Khu vực", listing.areaName],
                      ["Diện tích", formatAreaSqm(listing.roomAreaSqm)],
                      ["Loại hình", listing.propertyType.label],
                      ["Tiện ích", listing.amenities.map((item) => item.label).join(", ") || "Chưa cập nhật"]
                    ].map(([label, value]) => (
                      <div key={label} className={styles.comparisonFact}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className={styles.comparisonActions}>
                    <Link
                      href={`/listings/${listing.id}`}
                      className="inline-flex min-h-10 items-center rounded-control border border-primary bg-primary px-3 text-ui-sm font-semibold text-primary-foreground shadow-surface"
                    >
                      Xem chi tiết
                    </Link>
                    <ShareListingControl listingId={listing.id} title={listing.title} compact />
                    <Button variant="danger" onClick={() => remove(listing.id)} className="!min-h-10 !px-3">
                      Bỏ tin
                    </Button>
                  </div>
                  <div className={styles.noteArea}>
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
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
