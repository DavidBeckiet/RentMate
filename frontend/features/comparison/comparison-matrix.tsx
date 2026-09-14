"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
import { formatAreaLabel } from "../../lib/area";
import { formatAreaSqm } from "../listings/format";
import { amenityLabel, propertyTypeLabel } from "../listings/room-type-label";
import type { ComparisonCriterionResult, ComparisonNeeds } from "./comparison-needs-evaluator";
import type { ComparisonListing } from "./comparison-data";
import { ShareListingControl } from "./share-listing-control";
import { RoommateListingCta } from "../roommate/roommate-listing-cta";
import { isRoommateListingEligible } from "../roommate/roommate-listing-selection";
import styles from "./compare-page.module.css";

interface MatrixRow {
  readonly key: string;
  readonly label: string;
  readonly values: readonly string[];
  readonly renderValue?: (value: string, index: number) => ReactNode;
}

function formatRent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Chưa cập nhật";
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu/tháng`;
  }
  return `${value.toLocaleString("vi-VN")} ₫/tháng`;
}

function listingImage(listing: ComparisonListing) {
  return listing.coverImage ? (
    <MediaImage
      src={listing.coverImage.url}
      alt={listing.coverImage.altText ?? `Ảnh của ${listing.title}`}
      width={480}
      height={240}
      sizes="(max-width: 699px) 190px, 300px"
      className={styles.matrixImage}
      fallback={
        <div
          role="img"
          aria-label={listing.coverImage.altText ?? `Ảnh của ${listing.title}`}
          className={styles.matrixImageFallback}
        >
          <Icon name="home" className="h-5 w-5" />
        </div>
      }
    />
  ) : (
    <div role="img" aria-label={`Chưa có ảnh cho ${listing.title}`} className={styles.matrixImageFallback}>
      <Icon name="home" className="h-5 w-5" />
    </div>
  );
}

function coreRows(listings: readonly ComparisonListing[]): readonly MatrixRow[] {
  return [
    { key: "price", label: "Giá", values: listings.map((listing) => formatRent(listing.monthlyRent)) },
    {
      key: "room-area",
      label: "Diện tích",
      values: listings.map((listing) =>
        listing.roomAreaSqm === null ? "Chưa cập nhật" : formatAreaSqm(listing.roomAreaSqm)
      )
    },
    {
      key: "property-type",
      label: "Loại phòng",
      values: listings.map((listing) =>
        listing.propertyType ? propertyTypeLabel(listing.propertyType) : "Chưa cập nhật"
      )
    },
    {
      key: "area",
      label: "Khu vực",
      values: listings.map((listing) => (listing.areaName ? formatAreaLabel(listing.areaName) : "Chưa cập nhật"))
    },
    {
      key: "occupancy",
      label: "Sức chứa",
      values: listings.map((listing) =>
        listing.maxOccupants === null ? "Chưa cập nhật" : `${listing.maxOccupants} người tối đa`
      )
    }
  ];
}

function amenityRows(listings: readonly ComparisonListing[], needs: ComparisonNeeds | null): readonly MatrixRow[] {
  const requiredCodes = new Set((needs?.amenities ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean));
  const listingCodes = new Set(
    listings.flatMap((listing) => listing.amenities.map((item) => item.code.trim().toUpperCase()))
  );
  const candidateCodes = [...new Set([...requiredCodes, ...listingCodes])].filter((code) => {
    const present = listings.map((listing) =>
      listing.amenities.some((item) => item.code.trim().toUpperCase() === code)
    );
    return requiredCodes.has(code) || new Set(present).size > 1;
  });
  return candidateCodes.map((code) => ({
    key: `amenity-${code}`,
    label: amenityLabel({ code, label: code }) === "Tiện ích" ? "Tiện ích khác" : amenityLabel({ code, label: code }),
    values: listings.map((listing) =>
      listing.amenities.some((item) => item.code.trim().toUpperCase() === code) ? "Có" : "Không"
    )
  }));
}

function hasDifference(values: readonly string[]): boolean {
  return new Set(values).size > 1;
}

function statusIcon(result: ComparisonCriterionResult): ReactNode {
  if (result.status === "MATCH") return <Icon name="check" className="h-4 w-4" aria-hidden="true" />;
  if (result.status === "MISMATCH") return <Icon name="close" className="h-4 w-4" aria-hidden="true" />;
  return (
    <span className={styles.evaluationUnknownIcon} aria-hidden="true">
      ?
    </span>
  );
}

export function ComparisonMatrix({
  listings,
  needs,
  onRemove
}: Readonly<{
  listings: readonly ComparisonListing[];
  needs: ComparisonNeeds | null;
  onRemove: (listingId: number) => void;
}>) {
  const [scrollHintVisible, setScrollHintVisible] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => [...coreRows(listings), ...amenityRows(listings, needs)], [listings, needs]);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const update = () => setScrollHintVisible(element.scrollWidth > element.clientWidth + 1);
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [listings.length]);

  return (
    <section
      className={styles.matrixSection}
      aria-labelledby="comparison-matrix-heading"
      style={{ "--listing-count": listings.length } as CSSProperties}
    >
      <div className={styles.matrixHeader}>
        <div>
          <h2 id="comparison-matrix-heading" className={styles.sectionTitle}>
            So sánh các tiêu chí
          </h2>
          <p className={styles.sectionDescription}>Các hàng tô nhạt là những điểm khác nhau giữa các phòng.</p>
        </div>
        {scrollHintVisible && listings.length > 1 ? (
          <span className={styles.scrollHint} role="status">
            Vuốt ngang để xem thêm
          </span>
        ) : null}
      </div>
      <div
        ref={scrollerRef}
        className={styles.matrixScroller}
        role="region"
        aria-label="Bảng so sánh tin đăng"
        tabIndex={0}
        onScroll={() => setScrollHintVisible(false)}
      >
        <table className={styles.matrixTable}>
          <caption className="sr-only">So sánh giá, diện tích, loại phòng, khu vực, sức chứa và tiện ích</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.matrixCriterionHeader}>
                Tiêu chí
              </th>
              {listings.map((listing) => (
                <th scope="col" key={listing.id} className={styles.listingColumnHeader}>
                  <div className={styles.matrixListingIdentity}>
                    <button
                      type="button"
                      className={styles.removeListing}
                      aria-label="Bỏ khỏi so sánh"
                      aria-describedby={`comparison-title-${listing.id}`}
                      onClick={() => onRemove(listing.id)}
                    >
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                    {listingImage(listing)}
                    <div className={styles.matrixListingText}>
                      <h3 id={`comparison-title-${listing.id}`}>{listing.title}</h3>
                      <p>{formatRent(listing.monthlyRent)}</p>
                      <span>{listing.areaName ? formatAreaLabel(listing.areaName) : "Khu vực chưa cập nhật"}</span>
                      {listing.landlordVerified ? <small>Đã xác minh</small> : null}
                    </div>
                  </div>
                  <div className={styles.matrixHeaderActions}>
                    <Link href={`/listings/${listing.id}`} className={styles.matrixDetailLink}>
                      Xem chi tiết <Icon name="arrow" className="h-4 w-4" />
                    </Link>
                    <ShareListingControl listingId={listing.id} title={listing.title} compact />
                    <RoommateListingCta
                      listingId={listing.id}
                      eligible={isRoommateListingEligible(listing)}
                      compact
                      label="Cân nhắc ở ghép"
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const different = hasDifference(row.values);
              return (
                <tr key={row.key} data-different={different ? "true" : undefined}>
                  <th scope="row" className={styles.matrixCriterionCell}>
                    {row.label}
                    {different ? <span className={styles.differenceLabel}>Khác biệt</span> : null}
                  </th>
                  {row.values.map((value, index) => (
                    <td key={`${row.key}-${listings[index]?.id ?? index}`} className={styles.matrixValueCell}>
                      <span>{value}</span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {needs ? (
        <p className={styles.matrixFootnote}>
          Các dấu hiệu phù hợp/không phù hợp nằm ở phần “Đối chiếu nhu cầu”; bảng này vẫn giữ giá trị thực tế của từng
          tin.
        </p>
      ) : (
        <p className={styles.matrixFootnote}>Chọn nhu cầu bên dưới để xem phòng nào đáp ứng từng tiêu chí của bạn.</p>
      )}
    </section>
  );
}

export function ComparisonEvaluation({
  listings,
  evaluations,
  onChooseNeeds
}: Readonly<{
  listings: readonly ComparisonListing[];
  evaluations: ReadonlyMap<number, readonly ComparisonCriterionResult[]>;
  onChooseNeeds: () => void;
}>) {
  const hasEvaluation = listings.some((listing) => (evaluations.get(listing.id)?.length ?? 0) > 0);
  if (!hasEvaluation) {
    return (
      <section className={styles.evaluationEmpty} aria-labelledby="comparison-evaluation-heading">
        <div>
          <p className="rm-eyebrow">ĐỐI CHIẾU THEO TIÊU CHÍ</p>
          <h2 id="comparison-evaluation-heading" className={styles.sectionTitle}>
            Chưa áp dụng nhu cầu riêng
          </h2>
          <p className={styles.sectionDescription}>
            Chọn nhu cầu ở trên nếu bạn muốn biết mỗi tin đáp ứng tiêu chí nào.
          </p>
        </div>
        <Button variant="outline" onClick={onChooseNeeds}>
          Thiết lập nhu cầu
        </Button>
      </section>
    );
  }

  return (
    <section className={styles.evaluationSection} aria-labelledby="comparison-evaluation-heading">
      <div>
        <p className="rm-eyebrow">ĐỐI CHIẾU THEO TIÊU CHÍ</p>
        <h2 id="comparison-evaluation-heading" className={styles.sectionTitle}>
          Những điểm cần lưu ý
        </h2>
        <p className={styles.sectionDescription}>
          Kết quả chỉ phản ánh các tiêu chí bạn đã chọn, không xếp hạng tin nào.
        </p>
      </div>
      <div className={styles.evaluationGrid}>
        {listings.map((listing) => {
          const results = evaluations.get(listing.id) ?? [];
          return (
            <article key={listing.id} className={styles.evaluationCard}>
              <p className={styles.evaluationTitle}>{listing.title}</p>
              {results.length > 0 ? (
                <ul>
                  {results.map((item) => (
                    <li key={item.criterion} data-status={item.status}>
                      <span className={styles.evaluationIcon}>{statusIcon(item)}</span>
                      <span>{item.explanation}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Chưa có tiêu chí cụ thể để đối chiếu.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
