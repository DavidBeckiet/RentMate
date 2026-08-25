"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon } from "../../components/ui/icon";
import { Reveal } from "../../components/ui/reveal";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, PropertyType, PublicListingSummary } from "../../types/api";
import { FavoriteSaveControl } from "../favorites/favorite-save-control";
import { formatAreaSqm, formatVnd } from "./format";
import { HeroSearch } from "./hero-search";
import { demoListings, demoPropertyTypes } from "./homepage-content";
import type { SearchFilterValues } from "./search-query";
import styles from "./marketplace-home.module.css";

export interface MarketplaceHomeProps {
  readonly propertyTypes: readonly PropertyType[];
  readonly propertyTypesLoading: boolean;
  readonly listings: ApiPage<PublicListingSummary> | null;
  readonly listingsStatus: "idle" | "loading" | "success" | "error";
  readonly listingsError: string | null;
  readonly onSearch: (filters: SearchFilterValues) => void;
  readonly onRetryListings: () => void;
}

function ListingPreview({ listing, demo }: { readonly listing: PublicListingSummary; readonly demo: boolean }) {
  const href = demo ? "/search" : `/listings/${listing.id}`;

  return (
    <article className={styles.listingCard}>
      <Link href={href} className="flex h-full flex-1 flex-col focus-visible:outline-none">
        <div className={styles.listingImage}>
          <Image
            src={listing.coverImage.url}
            alt={listing.coverImage.altText ?? `Ảnh của ${listing.title}`}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
          <span className="absolute left-3 top-3 z-10 border-2 border-heroDark-950 bg-rent-yellow px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.1em] shadow-glass-sm">
            {listing.propertyType.label}
          </span>
          {demo ? (
            <span className="absolute bottom-3 left-3 z-10 border-2 border-heroDark-950 bg-rent-surface px-2.5 py-1 font-display text-[9px] font-bold uppercase tracking-[0.12em]">
              Preview
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col justify-between gap-5 p-4">
          <div>
            <div className="flex items-start justify-between gap-3">
              <p className="font-display text-xl font-bold tracking-[-0.04em] text-brandBlue-600">
                {formatVnd(listing.monthlyRent)}
              </p>
              <Icon name="arrowUpRight" className="h-5 w-5 shrink-0" />
            </div>
            <h3 className="rm-listing-title mt-2 font-display text-base font-bold leading-5">{listing.title}</h3>
          </div>
          <div className="space-y-3 border-t-2 border-heroDark-950 pt-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-rent-secondary">
              <Icon name="pin" className="h-4 w-4 shrink-0" />
              <span className="truncate">{listing.areaName}</span>
            </p>
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5">
                <Icon name="ruler" className="h-4 w-4" />
                {formatAreaSqm(listing.roomAreaSqm)}
              </span>
              <span>
                {listing.amenities
                  .slice(0, 1)
                  .map((amenity) => amenity.label)
                  .join("")}
              </span>
            </div>
          </div>
        </div>
      </Link>
      {!demo ? (
        <div className="absolute right-3 top-3 z-20">
          <FavoriteSaveControl listingId={String(listing.id)} compact />
        </div>
      ) : null}
    </article>
  );
}

function HeroListingPreview({ listing, demo }: { readonly listing: PublicListingSummary; readonly demo: boolean }) {
  const href = demo ? "/search" : `/listings/${listing.id}`;
  const firstAmenity = listing.amenities[0]?.label;

  return (
    <article className={styles.heroListingCard}>
      <Link
        href={href}
        className={`${styles.heroListingLink} group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4`}
      >
        <div className={styles.heroListingImage}>
          <Image
            src={listing.coverImage.url}
            alt={listing.coverImage.altText ?? `Ảnh của ${listing.title}`}
            fill
            priority
            sizes="(min-width: 1024px) 220px, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          <span className={styles.heroListingType}>{listing.propertyType.label}</span>
          <span className={styles.heroListingStatus}>{demo ? "Dữ liệu demo" : "Phòng mới"}</span>
        </div>

        <div className={styles.heroListingBody}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-rent-subtle">
                Phòng nổi bật
              </p>
              <p className="mt-1 font-display text-xl font-bold tracking-[-0.04em] text-brandBlue-600">
                {formatVnd(listing.monthlyRent)}
              </p>
            </div>
            <span className="grid h-8 w-8 shrink-0 place-items-center border-2 border-heroDark-950 bg-rent-accent transition-colors group-hover:bg-rent-coral">
              <Icon name="arrowUpRight" className="h-4 w-4 transition-transform group-hover:rotate-45" />
            </span>
          </div>

          <h2 className={styles.heroListingTitle}>{listing.title}</h2>

          <div className={styles.heroListingMeta}>
            <span>
              <Icon name="pin" className="h-4 w-4" />
              <span className="truncate">{listing.areaName}</span>
            </span>
            <span>
              <Icon name="ruler" className="h-4 w-4" />
              {formatAreaSqm(listing.roomAreaSqm)}
            </span>
            {firstAmenity ? <span>{firstAmenity}</span> : null}
          </div>
        </div>
      </Link>
    </article>
  );
}

export function MarketplaceHome({
  propertyTypes,
  propertyTypesLoading,
  listings,
  listingsStatus,
  listingsError,
  onSearch,
  onRetryListings
}: MarketplaceHomeProps) {
  const { status, user } = useAuth();
  const liveListings = listings?.data ?? [];
  const usingDemo = liveListings.length === 0;
  const listingSource = usingDemo ? demoListings : liveListings;
  const featuredListing = liveListings[0] ?? demoListings[0]!;
  const displayListings = listingSource.length > 1 ? listingSource.slice(1, 4) : listingSource.slice(0, 1);
  const displayPropertyTypes = propertyTypes.length > 0 ? propertyTypes : demoPropertyTypes;
  const landlordHref = status === "authenticated" && user?.role === "LANDLORD" ? "/landlord" : "/register/landlord";

  return (
    <div className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={`rm-page-container ${styles.heroGrid}`}>
          <div className={styles.heroTop}>
            <div className={styles.heroCopy}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rm-eyebrow">
                  <Icon name="sparkles" className="h-4 w-4" />
                  Urban living OS
                </span>
                <span className="font-display text-[11px] font-bold uppercase tracking-[0.14em]">TP.HCM · 2026</span>
              </div>

              <h1 id="home-title" className={styles.heroTitle}>
                <span className={styles.heroLine}>
                  <span>
                    Tìm phòng <em className={styles.highlight}>đúng khu.</em>
                  </span>
                </span>
                <span className={styles.heroLine}>
                  <span>Sống đúng nhịp.</span>
                </span>
              </h1>

              <p className="mt-4 max-w-xl text-[15px] font-semibold leading-6 text-rent-secondary sm:text-base">
                Lọc đúng điều cần thiết, xem vị trí xấp xỉ và kết nối trực tiếp với chủ nhà.
              </p>
            </div>

            <div className={styles.heroVisual} aria-label={usingDemo ? "Phòng mẫu nổi bật" : "Phòng công khai nổi bật"}>
              <div className={styles.heroListingWrap}>
                <span className={styles.heroVisualLabel}>{usingDemo ? "Phòng demo" : "Vừa cập nhật"}</span>
                <HeroListingPreview listing={featuredListing} demo={usingDemo} />
              </div>
            </div>
          </div>

          <div className={styles.heroSearchBand}>
            <HeroSearch
              propertyTypes={displayPropertyTypes}
              loading={propertyTypesLoading && propertyTypes.length === 0}
              onSearch={onSearch}
            />
          </div>

          <div className={styles.heroTrustRow} aria-label="Lợi ích khi tìm phòng">
            <span>
              <Icon name="check" className="h-4 w-4" /> Không phí môi giới
            </span>
            <span>
              <Icon name="shield" className="h-4 w-4" /> Vị trí công khai xấp xỉ
            </span>
            <span>
              <Icon name="map" className="h-4 w-4" /> Có chế độ bản đồ
            </span>
          </div>
        </div>
      </section>

      <section className="py-10 sm:py-12 lg:py-14">
        <div className="rm-page-container">
          <Reveal className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <span className="rm-eyebrow">Fresh drop · chỗ ở mới</span>
              <h2 className={styles.sectionHeading}>Phòng mới, xem nhanh.</h2>
            </div>
            <Link
              href="/search"
              className="group inline-flex min-h-12 w-fit items-center gap-3 border-2 border-heroDark-950 bg-rent-surface px-5 font-display text-sm font-bold shadow-glass-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-glass"
            >
              Xem tất cả tin
              <Icon name="arrowUpRight" className="h-5 w-5 transition-transform group-hover:rotate-45" />
            </Link>
          </Reveal>

          <div className="mt-4 flex min-h-8 flex-wrap items-center gap-3 text-xs font-semibold text-rent-secondary">
            {usingDemo ? (
              <span className="border-2 border-heroDark-950 bg-rent-yellow px-3 py-1 font-display font-bold uppercase tracking-[0.1em]">
                Dữ liệu mẫu để preview
              </span>
            ) : (
              <span>Đang hiển thị dữ liệu công khai mới nhất.</span>
            )}
            {listingsStatus === "error" ? (
              <>
                <span>{listingsError ?? "Máy chủ dữ liệu tạm thời chưa phản hồi."}</span>
                <button
                  type="button"
                  onClick={onRetryListings}
                  className="font-bold underline decoration-2 underline-offset-4"
                >
                  Thử kết nối lại
                </button>
              </>
            ) : null}
          </div>

          <div className={`mt-7 ${styles.listingGrid}`}>
            {displayListings.map((listing, index) => (
              <Reveal key={listing.id} delay={(index % 3) as 0 | 1 | 2}>
                <ListingPreview listing={listing} demo={usingDemo} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y-2 border-heroDark-950 bg-heroDark-950 py-8 text-white sm:py-10">
        <div className="rm-page-container grid gap-5 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
          <Reveal>
            <span className="font-display text-xs font-bold uppercase tracking-[0.16em] text-rent-accent">
              Chọn bước tiếp theo
            </span>
            <h2 className="mt-3 max-w-xl font-display text-3xl font-bold leading-[0.96] tracking-[-0.05em] sm:text-4xl">
              Một điểm bắt đầu. Hai lối đi rõ ràng.
            </h2>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            <Reveal delay={1}>
              <Link
                href="/search"
                className="group flex min-h-36 flex-col justify-between border-2 border-white bg-rent-accent p-4 text-heroDark-950 shadow-[5px_5px_0_#fff] transition-transform hover:-translate-x-1 hover:-translate-y-1"
              >
                <Icon name="search" className="h-6 w-6" />
                <span className="flex items-end justify-between gap-4">
                  <span>
                    <span className="block text-xs font-bold uppercase tracking-[0.12em]">Người thuê</span>
                    <strong className="mt-1 block font-display text-xl font-bold">Tìm phòng ngay</strong>
                  </span>
                  <Icon name="arrowUpRight" className="h-6 w-6 transition-transform group-hover:rotate-45" />
                </span>
              </Link>
            </Reveal>
            <Reveal delay={2}>
              <Link
                href={landlordHref}
                className="group flex min-h-36 flex-col justify-between border-2 border-white bg-rent-coral p-4 text-heroDark-950 shadow-[5px_5px_0_#fff] transition-transform hover:-translate-x-1 hover:-translate-y-1"
              >
                <Icon name="building" className="h-6 w-6" />
                <span className="flex items-end justify-between gap-4">
                  <span>
                    <span className="block text-xs font-bold uppercase tracking-[0.12em]">Chủ nhà</span>
                    <strong className="mt-1 block font-display text-xl font-bold">Đăng chỗ trống</strong>
                  </span>
                  <Icon name="arrowUpRight" className="h-6 w-6 transition-transform group-hover:rotate-45" />
                </span>
              </Link>
            </Reveal>
          </div>
        </div>
      </section>
    </div>
  );
}
