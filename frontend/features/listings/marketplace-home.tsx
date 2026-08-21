"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Reveal } from "../../components/ui/reveal";
import { FavoriteSaveControl } from "../favorites/favorite-save-control";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, PropertyType, PublicListingSummary } from "../../types/api";
import { formatAreaSqm, formatVnd } from "./format";
import { HeroSearch } from "./hero-search";
import styles from "./marketplace-home.module.css";
import {
  blogPosts,
  faqItems,
  landlordBenefits,
  popularLocations,
  threeStepsGuide,
  userReviews
} from "./homepage-content";
import type { SearchFilterValues } from "./search-query";

export interface MarketplaceHomeProps {
  readonly propertyTypes: readonly PropertyType[];
  readonly propertyTypesLoading: boolean;
  readonly listings: ApiPage<PublicListingSummary> | null;
  readonly listingsStatus: "idle" | "loading" | "success" | "error";
  readonly listingsError: string | null;
  readonly onSearch: (filters: SearchFilterValues) => void;
  readonly onRetryListings: () => void;
}

const fallbackImage = "/images/rentmate-home-hero.png";

function HomeIcon({
  kind
}: {
  readonly kind:
    | "home"
    | "building"
    | "users"
    | "target"
    | "shield"
    | "camera"
    | "search"
    | "arrow"
    | "star"
    | "checkCircle"
    | "zap"
    | "plus"
    | "mapPin";
}) {
  const paths = {
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" />
        <path d="M9 21v-7h6v7" />
      </>
    ),
    building: (
      <>
        <path d="M5 21V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v17" />
        <path d="M3 21h18M9 6h2M13 6h2M9 10h2M13 10h2M9 14h2M13 14h2" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3V1M21 12h2M12 21v2M3 12H1" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" />
        <path d="m8.5 12 2.3 2.3 4.7-5" />
      </>
    ),
    camera: (
      <>
        <path d="M3 7h3l2-3h8l2 3h3v12H3V7Z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    ),
    checkCircle: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12 2.5 2.5 5-5" />
      </>
    ),
    zap: (
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    ),
    plus: (
      <path d="M12 5v14M5 12h14" />
    ),
    mapPin: (
      <>
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </>
    )
  } as const;

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      {paths[kind]}
    </svg>
  );
}

function DiscoveryMark({ type }: { readonly type: PropertyType }) {
  const kind = type.code.toLowerCase().includes("room")
    ? "home"
    : type.code.toLowerCase().includes("share")
    ? "users"
    : "building";
  return (
    <span className={styles.discoveryMark}>
      <HomeIcon kind={kind} />
    </span>
  );
}

function SourceListingCard({ listing }: { readonly listing: PublicListingSummary }) {
  return (
    <article className="rm-card group relative flex h-full flex-col justify-between overflow-hidden">
      <Link
        href={`/listings/${listing.id}`}
        className="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
      >
        <div className="relative h-48 overflow-hidden bg-slate-200">
          <Image
            src={listing.coverImage.url || fallbackImage}
            alt={listing.coverImage.altText ?? `Ảnh của ${listing.title}`}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute left-3 top-3 flex flex-col gap-1">
            <span className="rounded bg-sky-500 px-2 py-0.5 text-[9px] font-black uppercase text-white">
              {listing.propertyType.label}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between gap-3 p-4">
          <div>
            <p className="text-base font-black text-brandBlue-500">
              {formatVnd(listing.monthlyRent)}
              <span className="text-[10px] font-normal text-slate-400">/tháng</span>
            </p>
            <h3 className="rm-listing-title mt-1 text-xs font-bold leading-snug text-slate-900 transition-colors group-hover:text-brandBlue-500">
              {listing.title}
            </h3>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1 truncate max-w-[140px]">
              <HomeIcon kind="mapPin" />
              {listing.areaName}
            </span>
            <span className="shrink-0 font-semibold text-slate-700">
              {formatAreaSqm(listing.roomAreaSqm)}
            </span>
          </div>
        </div>
      </Link>
      <div className="absolute right-3 top-3 z-10">
        <FavoriteSaveControl listingId={String(listing.id)} compact />
      </div>
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
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const publicListings = listings?.data ?? [];
  const heroListing = publicListings[0] ?? null;
  const landlordHref =
    status === "authenticated" && user?.role === "LANDLORD"
      ? "/landlord"
      : "/register/landlord";
  const areaCount = new Set(publicListings.map((listing) => listing.areaName)).size;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* 1. HERO SECTION WITH DARK GRID BACKGROUND & WAVE DIVIDER */}
      <section className="bg-heroDark-950 bg-grid-pattern text-white py-10 sm:py-14 md:py-16 relative overflow-hidden">
        {/* Glow Accents */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brandBlue-500/10 rounded-full blur-3xl pointer-events-none animate-pulse-glow" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="rm-page-container relative z-10 grid items-center gap-8 lg:gap-10 lg:grid-cols-12">
          {/* Hero Left Content */}
          <div className="space-y-5 sm:space-y-6 lg:col-span-7">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-bold text-slate-200 backdrop-blur-md shadow-inner">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
              <span className="text-sky-300">#1 Nền tảng thuê nhà Việt Nam</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.15]">
              Tìm phòng trọ <br />
              <span className="bg-gradient-to-r from-sky-400 via-blue-400 to-cyan-300 bg-clip-text text-transparent">
                Nhanh • Đúng • Tin cậy
              </span>
            </h1>

            <p className="text-slate-300 text-xs sm:text-base leading-relaxed max-w-xl font-normal">
              Hàng nghìn phòng trọ, chung cư mini, nhà nguyên căn được cập nhật liên tục. Xem vị trí bản đồ xấp xỉ, liên hệ trực tiếp chính chủ — không qua trung gian.
            </p>

            {/* Hero Search Box */}
            <HeroSearch
              propertyTypes={propertyTypes}
              loading={propertyTypesLoading}
              onSearch={onSearch}
            />

            {/* Hero Quick Statistics */}
            <div className="pt-2 flex items-center gap-6 sm:gap-8 text-xs border-t border-slate-800">
              <div>
                <div className="text-xl sm:text-2xl font-black text-white">{publicListings.length}</div>
                <div className="text-slate-400 text-[11px] sm:text-xs">Tin đăng</div>
              </div>
              <div className="w-px h-7 bg-slate-800" />
              <div>
                <div className="text-xl sm:text-2xl font-black text-white">{areaCount}</div>
                <div className="text-slate-400 text-[11px] sm:text-xs">Khu vực phủ sóng</div>
              </div>
              <div className="w-px h-7 bg-slate-800" />
              <div>
                <div className="text-xl sm:text-2xl font-black text-brandBlue-500">Miễn phí</div>
                <div className="text-slate-400 text-[11px] sm:text-xs">Đăng tin</div>
              </div>
            </div>
          </div>

          {/* Hero Right Showcase Cards (Always Gorgeous & Balanced) */}
          <div className="lg:col-span-5 relative flex justify-center items-center py-6 sm:py-8">
            <div className="w-full max-w-sm rounded-2xl bg-white text-slate-900 p-2.5 shadow-2xl border border-slate-100 relative z-10 animate-float-slow">
              <Link href={heroListing ? `/listings/${heroListing.id}` : "/?sort=newest"}>
                <div className="relative h-48 rounded-xl overflow-hidden bg-slate-200">
                  <Image
                    src={heroListing ? heroListing.coverImage.url || fallbackImage : fallbackImage}
                    alt={heroListing ? heroListing.coverImage.altText ?? heroListing.title : "Phòng trọ nổi bật Rentmate"}
                    fill
                    priority
                    sizes="(min-width: 1024px) 34vw, 100vw"
                    className="object-cover"
                  />
                  <div className="absolute top-2 left-2 rounded-lg bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-sm">
                    {heroListing ? "Phòng nổi bật" : "Tin mẫu gợi ý"}
                  </div>
                </div>
                <div className="p-3 space-y-1.5">
                  <div className="text-lg font-black text-brandBlue-500">
                    {heroListing ? formatVnd(heroListing.monthlyRent) : "3.200.000 ₫"}
                    <span className="text-xs text-slate-400 font-medium">/tháng</span>
                  </div>
                  <h2 className="rm-listing-title text-xs font-bold leading-snug text-slate-900">
                    {heroListing ? heroListing.title : "Studio Full nội thất cao cấp — Gần trung tâm & Tiện ích"}
                  </h2>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
                    <span className="flex items-center gap-1">
                      <HomeIcon kind="mapPin" />
                      {heroListing ? heroListing.areaName : "TP. Hồ Chí Minh"}
                    </span>
                    <span>•</span>
                    <span>{heroListing ? formatAreaSqm(heroListing.roomAreaSqm) : "28 m²"}</span>
                  </div>
                </div>
              </Link>
            </div>

            {/* Floating Trust & Live Status Badges (Positioned cleanly outside the card) */}
            <div className="absolute -top-3 -right-2 sm:-right-4 z-20 px-3.5 py-2 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl border border-slate-100 flex items-center gap-2 text-xs font-bold text-slate-800 animate-float-reverse">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <div>
                <div className="text-[11px] font-black text-slate-900">Mới cập nhật</div>
                <div className="text-[9px] text-slate-500 font-normal">Hôm nay</div>
              </div>
            </div>

            <div className="absolute -bottom-6 -right-2 sm:-right-4 z-20 px-3.5 py-2 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl border border-slate-100 flex items-center gap-2 text-xs font-bold text-slate-800 animate-float-slow">
              <div className="text-emerald-600 shrink-0">
                <HomeIcon kind="shield" />
              </div>
              <div>
                <div className="text-[11px] font-black text-slate-900">Đã xác minh</div>
                <div className="text-[9px] text-slate-500 font-normal">Chủ nhà uy tín</div>
              </div>
            </div>

            <div className="absolute -bottom-6 -left-2 sm:-left-6 z-20 px-3.5 py-2 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl border border-slate-100 flex items-center gap-2 text-xs font-bold text-slate-800 animate-float-reverse">
              <div className="text-brandBlue-500 shrink-0">
                <HomeIcon kind="target" />
              </div>
              <div>
                <div className="text-[11px] font-black text-slate-900">
                  {publicListings.length > 0 ? `${publicListings.length} tin đăng` : "100% Xác thực"}
                </div>
                <div className="text-[9px] text-slate-500 font-normal">Trực tiếp chính chủ</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Curvy Wave Divider */}
        <div className="absolute bottom-0 left-0 right-0 w-full overflow-hidden leading-none pointer-events-none">
          <svg className="relative block w-full h-8 sm:h-12 text-slate-50 fill-current" viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path d="M0,0 C150,90 350,-40 500,40 C650,120 900,20 1200,60 L1200,120 L0,120 Z" />
          </svg>
        </div>
      </section>

      {/* 2. CATEGORY BAR SECTION */}
      <section className="rm-page-container relative z-20 -mt-2 mb-10">
        <Reveal>
          <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
            <Link
              href="/?sort=newest"
              className="px-5 py-3 rounded-2xl font-bold text-xs transition-all shadow-sm flex items-center gap-2 bg-brandBlue-500 text-white shadow-brandBlue-500/30 scale-105"
            >
              <HomeIcon kind="building" />
              <span>Tất cả</span>
            </Link>

            {propertyTypesLoading ? (
              <span className="px-4 text-xs text-slate-500">Đang tải loại hình…</span>
            ) : (
              propertyTypes.map((type) => (
                <button
                  key={type.code}
                  type="button"
                  onClick={() => onSearch({ propertyType: type.code, amenities: [] })}
                  className="px-5 py-3 rounded-2xl font-bold text-xs transition-all shadow-sm flex items-center gap-2 bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 hover:-translate-y-0.5"
                >
                  <DiscoveryMark type={type} />
                  <span>{type.label}</span>
                </button>
              ))
            )}
          </div>
        </Reveal>
      </section>

      {/* 3. FEATURED ROOMS SECTION */}
      <section className="rm-page-container space-y-8 pb-12 sm:pb-14">
        <Reveal className="flex justify-between items-end">
          <div>
            <span className="px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-[11px] font-black uppercase tracking-wider">
              NỔI BẬT
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
              Phòng trọ <span className="text-brandBlue-500">nổi bật</span>
            </h2>
          </div>
          <Link
            href="/?sort=newest"
            className="px-4 py-2 rounded-xl border border-brandBlue-500 text-brandBlue-500 hover:bg-brandBlue-500 hover:text-white transition-all font-bold text-xs flex items-center gap-1"
          >
            <span>Xem tất cả</span>
            <HomeIcon kind="arrow" />
          </Link>
        </Reveal>

        {listingsStatus === "error" ? (
          <ErrorState
            message={listingsError ?? "Không thể tải danh sách tin."}
            action={
              <button
                type="button"
                className="px-4 py-2 rounded-xl border border-brandBlue-500 text-brandBlue-500 hover:bg-brandBlue-500 hover:text-white font-bold text-xs"
                onClick={onRetryListings}
              >
                Thử lại
              </button>
            }
          />
        ) : null}

        {listingsStatus === "loading" || listingsStatus === "idle" ? (
          <LoadingState message="Đang tải tin phòng công khai…" />
        ) : null}

        {listingsStatus === "success" && publicListings.length === 0 ? (
          <div className="rounded-3xl border border-slate-200/90 bg-white p-8 sm:p-12 text-center shadow-sm max-w-2xl mx-auto space-y-4">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brandBlue-50 text-brandBlue-500">
              <HomeIcon kind="home" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-slate-900">
                Chưa có tin đăng phòng trọ mới
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                Bạn là chủ nhà hoặc có phòng trống cho thuê? Đăng tin ngay hôm nay hoàn toàn miễn phí để tiếp cận hàng nghìn khách thuê!
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                href={landlordHref}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brandBlue-500 to-sky-500 px-5 py-2.5 text-xs font-black text-white shadow-md shadow-brandBlue-500/25 transition hover:scale-105"
              >
                <span>+</span>
                <span>Đăng tin cho thuê miễn phí</span>
              </Link>
              <Link
                href="/near-me"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                <span>Tìm phòng gần bạn</span>
              </Link>
            </div>
          </div>
        ) : null}

        {publicListings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {publicListings.slice(0, 8).map((listing) => (
              <Reveal key={listing.id}>
                <SourceListingCard listing={listing} />
              </Reveal>
            ))}
          </div>
        ) : null}
      </section>

      {/* 4. LANDLORD RECRUITMENT & 4-STAT COUNTERS SECTION */}
      <section className="bg-heroDark-950 text-white py-12 md:py-14 border-t border-slate-800">
        <div className="rm-page-container space-y-12 md:space-y-14">
          {/* Top 4 Key Statistics Counters */}
          <Reveal className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center divide-y md:divide-y-0 md:divide-x divide-slate-800/80">
            <div className="pt-4 md:pt-0 space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-brandBlue-500/10 text-brandBlue-500 flex items-center justify-center mx-auto border border-brandBlue-500/20">
                <HomeIcon kind="home" />
              </div>
              <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">{publicListings.length}</div>
              <div className="text-xs text-slate-400 font-medium">Tin đăng hoạt động</div>
            </div>

            <div className="pt-4 md:pt-0 space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
                <HomeIcon kind="building" />
              </div>
              <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">{areaCount}</div>
              <div className="text-xs text-slate-400 font-medium">Tỉnh thành phủ sóng</div>
            </div>

            <div className="pt-4 md:pt-0 space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto border border-sky-500/20">
                <HomeIcon kind="zap" />
              </div>
              <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">100%</div>
              <div className="text-xs text-slate-400 font-medium">Miễn phí đăng tin</div>
            </div>

            <div className="pt-4 md:pt-0 space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
                <HomeIcon kind="star" />
              </div>
              <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">5.0</div>
              <div className="text-xs text-slate-400 font-medium">Đánh giá trung bình</div>
            </div>
          </Reveal>

          {/* Main Landlord Recruitment Banner Box */}
          <Reveal>
            <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8 md:p-10 shadow-2xl relative overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Glow Accent */}
              <div className="absolute top-0 right-0 w-80 h-80 bg-brandBlue-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* Left Info Column */}
              <div className="lg:col-span-7 space-y-6 relative z-10">
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Cho thuê phòng trọ trên Rentmate
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
                  Tiếp cận hàng nghìn người tìm phòng mỗi ngày — hoàn toàn miễn phí, không giới hạn số tin đăng.
                </p>

                <div className="space-y-4 pt-2">
                  {landlordBenefits.map((benefit) => (
                    <div key={benefit.title} className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-brandBlue-500 shrink-0">
                        <HomeIcon kind={benefit.icon} />
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-white">{benefit.title}</h4>
                        <p className="text-[11px] text-slate-400">{benefit.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Action Box Card */}
              <div className="lg:col-span-5 relative z-10">
                <div className="p-6 md:p-8 rounded-2xl bg-slate-950/80 border border-slate-800/80 text-center space-y-5 shadow-inner">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brandBlue-500/10 text-sky-400 text-xs font-bold border border-brandBlue-500/20">
                    <span className="w-2 h-2 rounded-full bg-brandBlue-500 animate-ping" />
                    <span>Bắt đầu cho thuê</span>
                  </div>

                  <p className="text-xs text-slate-300">
                    Tạo tin đăng đầu tiên và cho thuê phòng ngay hôm nay.
                  </p>

                  <Link
                    href={landlordHref}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-brandBlue-500 to-sky-500 hover:from-brandBlue-600 hover:to-sky-600 text-white font-black text-xs shadow-xl shadow-brandBlue-500/30 transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                  >
                    <HomeIcon kind="plus" />
                    <span>Đăng tin ngay</span>
                  </Link>

                  <div className="text-[11px] text-emerald-400 font-semibold flex items-center justify-center gap-1">
                    <HomeIcon kind="checkCircle" />
                    <span>Miễn phí • Không giới hạn • Duyệt trong 24h</span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 5. POPULAR LOCATIONS SECTION */}
      <section className="rm-page-container py-12 md:py-14 space-y-8">
        <Reveal className="text-center max-w-md mx-auto space-y-2">
          <span className="text-xs font-bold text-brandBlue-500 uppercase tracking-widest">Khu vực trong dữ liệu</span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Khám phá theo khu vực</h2>
        </Reveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {popularLocations.map((loc) => (
            <Reveal key={loc.city}>
              <button
                type="button"
                onClick={() => onSearch({ q: loc.city, amenities: [] })}
                className="w-full group relative rounded-2xl overflow-hidden h-48 cursor-pointer shadow-md hover:shadow-xl transition-all block text-left"
              >
                <Image
                  src={loc.image}
                  alt={loc.city}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent p-4 flex flex-col justify-end">
                  <h3 className="text-lg font-black text-white group-hover:text-sky-300 transition-colors">
                    {loc.city}
                  </h3>
                  <span className="text-xs text-slate-300 font-medium">{loc.count}</span>
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 6. 3 STEPS RENTAL GUIDE */}
      <section className="bg-white py-12 md:py-14 border-t border-slate-200">
        <div className="rm-page-container space-y-12">
          <Reveal className="text-center max-w-lg mx-auto space-y-2">
            <span className="text-xs font-bold text-brandBlue-500 uppercase tracking-widest">Đơn giản & Nhanh chóng</span>
            <h2 className="text-3xl font-black text-slate-900">Tìm phòng trọ chỉ với 3 bước</h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {threeStepsGuide.map((step) => (
              <Reveal key={step.step}>
                <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 space-y-3 relative group hover:bg-brandBlue-50/50 transition-all h-full">
                  <div className="w-10 h-10 rounded-2xl bg-brandBlue-500 text-white font-black text-sm flex items-center justify-center shadow-md shadow-brandBlue-500/20">
                    {step.step}
                  </div>
                  <h4 className="font-bold text-base text-slate-900">{step.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{step.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 7. SMART LOCATION & MAP FEATURE INTRO SECTION */}
      <section className="rm-page-container py-12 md:py-14">
        <Reveal>
          <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl lg:grid lg:grid-cols-12">
            {/* Left Description Column */}
            <div className="flex flex-col justify-between gap-8 bg-heroDark-950 p-6 sm:p-10 text-white lg:col-span-7">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brandBlue-500/30 bg-brandBlue-500/10 px-3.5 py-1 text-xs font-bold text-sky-400">
                  <HomeIcon kind="mapPin" />
                  <span>Bản đồ & Vị trí xấp xỉ</span>
                </span>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-snug">
                  Khám phá khu vực với <br />
                  <span className="text-brandBlue-500">Bản đồ thông minh</span>
                </h2>
                <p className="text-xs sm:text-sm leading-relaxed text-slate-300">
                  Rentmate hiển thị vị trí xấp xỉ an toàn của phòng trọ trên bản đồ trực quan, giúp bạn dễ dàng đo lường khoảng cách đến trường học, công ty hoặc trạm xe buýt mà vẫn bảo vệ quyền riêng tư tuyệt đối cho chủ nhà.
                </p>

                {/* Key Benefits */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-start gap-3">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-800 text-sky-400 border border-slate-700">
                      <HomeIcon kind="shield" />
                    </div>
                    <div>
                      <strong className="block text-xs font-bold text-white">Vị trí xấp xỉ an toàn</strong>
                      <span className="text-[11px] text-slate-400">Tọa độ được làm tròn bảo mật, tránh làm phiền chủ nhà trước khi hẹn.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-800 text-sky-400 border border-slate-700">
                      <HomeIcon kind="target" />
                    </div>
                    <div>
                      <strong className="block text-xs font-bold text-white">Bán kính tìm kiếm linh hoạt</strong>
                      <span className="text-[11px] text-slate-400">Dễ dàng khoanh vùng bán kính từ 1km – 10km quanh khu vực bạn cần.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-800 text-sky-400 border border-slate-700">
                      <HomeIcon kind="zap" />
                    </div>
                    <div>
                      <strong className="block text-xs font-bold text-white">Khám phá tiện ích lân cận</strong>
                      <span className="text-[11px] text-slate-400">Kiểm tra nhanh các trường đại học, chợ, siêu thị và tuyến đường thuận tiện.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <Link
                  href="/near-me"
                  className="inline-flex min-h-12 w-fit items-center gap-2 rounded-xl bg-gradient-to-r from-brandBlue-500 to-sky-500 px-6 py-3 text-xs font-black text-white shadow-lg shadow-brandBlue-500/25 transition hover:from-brandBlue-600 hover:to-sky-600 hover:scale-[1.02] active:scale-95"
                >
                  <span>Mở bản đồ tìm phòng gần bạn</span>
                  <HomeIcon kind="arrow" />
                </Link>
              </div>
            </div>

            {/* Right Visual Graphic Column */}
            <div className="relative min-h-[20rem] lg:min-h-full bg-slate-900 p-6 sm:p-8 flex flex-col justify-center items-center overflow-hidden lg:col-span-5 bg-grid-pattern">
              {/* Radial glow background */}
              <div className="absolute w-72 h-72 rounded-full bg-brandBlue-500/15 blur-3xl pointer-events-none" />

              {/* Mock Visual Radar Map Representation */}
              <div className="relative z-10 w-full max-w-xs rounded-2xl bg-slate-950/90 border border-slate-800 p-6 text-center space-y-4 shadow-2xl backdrop-blur-md">
                {/* Central Radar Pulse */}
                <div className="relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-brandBlue-500/10 border border-brandBlue-500/30">
                  <div className="absolute inset-0 rounded-full bg-brandBlue-500/20 animate-ping" />
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-brandBlue-500 text-white shadow-lg shadow-brandBlue-500/40">
                    <HomeIcon kind="mapPin" />
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Độ chính xác khu vực: 98%
                  </span>
                  <h3 className="text-sm font-black text-white">Vị trí phòng xấp xỉ</h3>
                  <p className="text-[11px] text-slate-400">Bán kính quét bảo mật quanh khu vực</p>
                </div>

                {/* Nearby Point Badges */}
                <div className="space-y-2 text-left pt-2 border-t border-slate-800/80 text-[11px]">
                  <div className="flex items-center justify-between rounded-xl bg-slate-900/90 px-3 py-1.5 border border-slate-800">
                    <span className="flex items-center gap-2 text-slate-200 font-bold">
                      <HomeIcon kind="building" />
                      <span>ĐH Bách Khoa TP.HCM</span>
                    </span>
                    <span className="font-bold text-sky-400">~1.2 km</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-900/90 px-3 py-1.5 border border-slate-800">
                    <span className="flex items-center gap-2 text-slate-200 font-bold">
                      <HomeIcon kind="target" />
                      <span>Tòa nhà Văn phòng</span>
                    </span>
                    <span className="font-bold text-sky-400">~800 m</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-900/90 px-3 py-1.5 border border-slate-800">
                    <span className="flex items-center gap-2 text-slate-200 font-bold">
                      <HomeIcon kind="zap" />
                      <span>Siêu thị & Tiện ích</span>
                    </span>
                    <span className="font-bold text-sky-400">~300 m</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* 8. USER TESTIMONIALS REVIEWS SECTION */}
      <section className="py-12 md:py-14 bg-slate-50 border-t border-slate-200">
        <div className="rm-page-container space-y-10">
          <Reveal className="text-center max-w-md mx-auto space-y-2">
            <span className="text-xs font-bold text-brandBlue-500 uppercase tracking-widest">Đánh giá thực tế</span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Cộng đồng nói gì về Rentmate</h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {userReviews.map((rev) => (
              <Reveal key={rev.name}>
                <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4 h-full flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-1 text-amber-400">
                      {[...Array(rev.rating)].map((_, i) => (
                        <HomeIcon key={i} kind="star" />
                      ))}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed italic">&ldquo;{rev.content}&rdquo;</p>
                  </div>

                  <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                    <Image
                      src={rev.avatar}
                      alt={rev.name}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div>
                      <div className="font-bold text-xs text-slate-900">{rev.name}</div>
                      <div className="text-[10px] text-slate-500">{rev.role}</div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 9. HELPFUL BLOG & GUIDES SECTION */}
      <section className="py-12 md:py-14 bg-white border-t border-slate-200">
        <div className="rm-page-container space-y-10">
          <Reveal className="flex justify-between items-end">
            <div>
              <span className="text-xs font-bold text-brandBlue-500 uppercase tracking-widest">Cẩm nang thuê phòng</span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">Kinh nghiệm & Mẹo thuê nhà</h2>
            </div>
            <Link
              href="/?sort=newest"
              className="text-xs font-bold text-brandBlue-500 hover:text-brandBlue-600 flex items-center gap-1"
            >
              <span>Xem tất cả bài viết</span>
              <HomeIcon kind="arrow" />
            </Link>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {blogPosts.map((post) => (
              <Reveal key={post.title}>
                <div className="rm-card overflow-hidden cursor-pointer group h-full flex flex-col">
                  <div className="relative h-44 overflow-hidden bg-slate-200">
                    <Image
                      src={post.image}
                      alt={post.title}
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-slate-900/80 text-white font-bold text-[10px]">
                      {post.category}
                    </span>
                  </div>

                  <div className="p-5 space-y-2 flex-1 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span>{post.date}</span>
                        <span>•</span>
                        <span>{post.readTime}</span>
                      </div>
                      <h4 className="font-bold text-xs text-slate-900 group-hover:text-brandBlue-500 transition-colors line-clamp-2">
                        {post.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                        {post.excerpt}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 text-[11px] font-bold text-brandBlue-500 flex items-center gap-1">
                      <span>Đọc chi tiết</span>
                      <HomeIcon kind="arrow" />
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 10. FAQ ACCORDION SECTION */}
      <section className="py-12 md:py-14 bg-slate-50 border-t border-slate-200">
        <div className="mx-auto max-w-4xl space-y-8 px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center space-y-2">
            <span className="text-xs font-bold text-brandBlue-500 uppercase tracking-widest">Giải đáp câu hỏi</span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Thắc mắc thường gặp (FAQ)</h2>
          </Reveal>

          <div className="space-y-3">
            {faqItems.map((faq, i) => (
              <div key={faq.q} className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2 shadow-sm">
                <button
                  type="button"
                  onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                  className="w-full font-bold text-xs text-slate-900 flex justify-between items-center text-left"
                >
                  <span>{faq.q}</span>
                  <span className="text-brandBlue-500 font-extrabold text-base">{activeFaq === i ? "−" : "+"}</span>
                </button>
                {activeFaq === i && (
                  <p className="text-xs text-slate-600 pt-2 border-t border-slate-100 leading-relaxed">
                    {faq.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
