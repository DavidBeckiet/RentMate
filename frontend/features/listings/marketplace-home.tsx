"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "../../components/ui/icon";
import { Reveal } from "../../components/ui/reveal";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, PropertyType, PublicListingSummary } from "../../types/api";
import { FavoriteSaveControl } from "../favorites/favorite-save-control";
import { formatAreaSqm, formatVnd } from "./format";
import { HeroSearch } from "./hero-search";
import {
  demoListings,
  demoPropertyTypes,
  faqItems,
  landlordBenefits,
  neighborhoods,
  productSteps,
  userReviews
} from "./homepage-content";
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
  const href = demo ? "/?sort=newest" : `/listings/${listing.id}`;

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
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const liveListings = listings?.data ?? [];
  const usingDemo = liveListings.length === 0;
  const displayListings = (usingDemo ? demoListings : liveListings).slice(0, 4);
  const displayPropertyTypes = propertyTypes.length > 0 ? propertyTypes : demoPropertyTypes;
  const landlordHref = status === "authenticated" && user?.role === "LANDLORD" ? "/landlord" : "/register/landlord";

  return (
    <div className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={`rm-page-container ${styles.heroGrid}`}>
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
                <span>Đừng chỉ</span>
              </span>
              <span className={styles.heroLine}>
                <span className={styles.highlight}>tìm phòng.</span>
              </span>
              <span className={styles.heroLine}>
                <span>Tìm nhịp sống.</span>
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-base font-semibold leading-7 text-rent-secondary sm:text-lg">
              Chọn khu phố, cảm nhận không gian và lọc đúng thứ bạn cần — không cò, không phí, không lộ vị trí chính
              xác.
            </p>

            <div className="mt-8 max-w-3xl">
              <HeroSearch
                propertyTypes={displayPropertyTypes}
                loading={propertyTypesLoading && propertyTypes.length === 0}
                onSearch={onSearch}
              />
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-bold">
              <span className="inline-flex items-center gap-2">
                <Icon name="check" className="h-4 w-4" /> Không phí môi giới
              </span>
              <span className="inline-flex items-center gap-2">
                <Icon name="shield" className="h-4 w-4" /> Vị trí xấp xỉ
              </span>
              <span className="inline-flex items-center gap-2">
                <Icon name="map" className="h-4 w-4" /> Tìm trên bản đồ
              </span>
            </div>
          </div>

          <div className={styles.heroVisual} aria-label="Minh họa không gian sống tại thành phố">
            <div className={styles.imageFrame}>
              <Image
                src="/images/rentmate-home-hero.png"
                alt="Khu dân cư hiện đại với nhiều mảng xanh tại Thành phố Hồ Chí Minh"
                fill
                priority
                sizes="(min-width: 1024px) 44vw, 100vw"
                className="object-cover"
              />
              <span className={styles.scanLine} aria-hidden="true" />
              <div className="absolute bottom-5 left-5 z-[3] max-w-[15rem] border-2 border-heroDark-950 bg-rent-surface p-3 shadow-glass">
                <div className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.12em]">
                  <span className="h-2.5 w-2.5 bg-brandBlue-500" />
                  Neighborhood signal
                </div>
                <p className="mt-2 text-sm font-bold">Nhiều cây xanh · Đi bộ thuận tiện · 12 phòng mới</p>
              </div>
            </div>
            <span className={`${styles.heroSticker} ${styles.stickerTop}`}>Tin mới mỗi ngày</span>
            <span className={`${styles.heroSticker} ${styles.stickerBottom}`}>100% trực tiếp</span>
          </div>
        </div>
      </section>

      <section aria-label="Thông tin nổi bật" className={styles.statGrid}>
        {[
          ["01", "Vị trí", "Hiển thị xấp xỉ, ưu tiên riêng tư"],
          ["02", "Tìm kiếm", "Lọc theo đúng nhịp sống của bạn"],
          ["03", "Kết nối", "Liên hệ trực tiếp khi đủ quyền"],
          ["04", "Chủ nhà", "Workspace theo dõi từng trạng thái"]
        ].map(([number, title, note]) => (
          <div key={number} className={styles.stat}>
            <span className="font-display text-xs font-bold text-rent-coral">/{number}</span>
            <h2 className="mt-4 font-display text-2xl font-bold tracking-[-0.04em]">{title}</h2>
            <p className="mt-2 max-w-xs text-sm font-semibold leading-6 text-rent-secondary">{note}</p>
          </div>
        ))}
      </section>

      <section className="rm-section">
        <div className="rm-page-container">
          <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <span className="rm-eyebrow">Fresh drop · chỗ ở mới</span>
              <h2 className={styles.sectionHeading}>Không gian đáng để dừng lại.</h2>
            </div>
            <Link
              href="/?sort=newest"
              className="group inline-flex min-h-12 w-fit items-center gap-3 border-2 border-heroDark-950 bg-rent-surface px-5 font-display text-sm font-bold shadow-glass-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-glass"
            >
              Xem tất cả tin
              <Icon name="arrowUpRight" className="h-5 w-5 transition-transform group-hover:rotate-45" />
            </Link>
          </Reveal>

          <div className="mt-5 flex min-h-8 flex-wrap items-center gap-3 text-xs font-semibold text-rent-secondary">
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

          <div className={`mt-9 ${styles.listingGrid}`}>
            {displayListings.map((listing, index) => (
              <Reveal key={listing.id} delay={(index % 4) as 0 | 1 | 2 | 3}>
                <ListingPreview listing={listing} demo={usingDemo} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y-2 border-heroDark-950 bg-rent-accent py-16 sm:py-20">
        <div className="rm-page-container">
          <Reveal className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <span className="font-display text-xs font-bold uppercase tracking-[0.16em]">Pick a neighborhood</span>
              <h2 className={`${styles.sectionHeading} mt-5`}>Chọn khu. Chọn mood.</h2>
            </div>
            <p className="max-w-xl text-base font-semibold leading-7 lg:justify-self-end">
              Đừng bắt đầu bằng bốn bức tường. Hãy bắt đầu bằng quãng đường đi làm, quán cà phê quen và nhịp sống bạn
              muốn.
            </p>
          </Reveal>

          <div className={`mt-12 ${styles.neighborhoodGrid}`}>
            {neighborhoods.map((place, index) => (
              <Reveal key={place.name} delay={(index % 3) as 0 | 1 | 2}>
                <button
                  type="button"
                  onClick={() => onSearch({ q: place.name, amenities: [] })}
                  className={`${styles.neighborhood} group block w-full text-left`}
                >
                  <Image
                    src={place.image}
                    alt={`Không gian sống tại ${place.name}`}
                    fill
                    sizes="(min-width: 768px) 34vw, 100vw"
                    className="object-cover"
                  />
                  <span className="absolute inset-x-0 bottom-0 z-[2] p-5 text-white">
                    <span className="font-display text-xs font-bold uppercase tracking-[0.14em]">{place.count}</span>
                    <span className="mt-1 flex items-end justify-between gap-4">
                      <strong className="font-display text-3xl font-bold tracking-[-0.05em] sm:text-4xl">
                        {place.name}
                      </strong>
                      <Icon name="arrowUpRight" className="h-7 w-7 transition-transform group-hover:rotate-45" />
                    </span>
                    <span className="mt-2 block text-sm font-semibold text-[#d8e5df]">{place.note}</span>
                  </span>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="rm-section">
        <div className="rm-page-container grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <Reveal>
            <span className="rm-eyebrow">Map mode · Privacy first</span>
            <h2 className={`${styles.sectionHeading} mt-6`}>Ở gần điều quan trọng.</h2>
            <p className="mt-6 max-w-lg text-base font-semibold leading-7 text-rent-secondary">
              Chọn một tâm điểm, đặt bán kính và chủ động bấm tìm. RentMate chỉ hiển thị vị trí công khai đã được làm
              tròn.
            </p>
            <div className="mt-8 space-y-4">
              {[
                ["shield", "Không công khai địa chỉ chính xác"],
                ["target", "Bán kính tìm kiếm linh hoạt"],
                ["map", "Map di chuyển không tự gửi yêu cầu"]
              ].map(([icon, label]) => (
                <div
                  key={label}
                  className="flex items-center gap-3 border-b-2 border-heroDark-950 pb-3 font-display text-sm font-bold"
                >
                  <span className="grid h-10 w-10 place-items-center border-2 border-heroDark-950 bg-rent-coral shadow-glass-sm">
                    <Icon name={icon as "shield" | "target" | "map"} className="h-5 w-5" />
                  </span>
                  {label}
                </div>
              ))}
            </div>
            <Link
              href="/near-me"
              className="mt-8 inline-flex min-h-12 items-center gap-3 border-2 border-heroDark-950 bg-rent-accent px-5 font-display text-sm font-bold shadow-glass transition-transform hover:-translate-x-1 hover:-translate-y-1"
            >
              Mở bản đồ
              <Icon name="arrow" />
            </Link>
          </Reveal>

          <Reveal delay={1}>
            <div className={styles.mapStage} aria-label="Mô phỏng bản đồ tìm phòng theo bán kính">
              <span className={styles.mapPin} style={{ left: "46%", top: "44%" }}>
                <Icon name="pin" />
              </span>
              <span
                className={styles.mapPin}
                style={{ left: "22%", top: "25%", background: "#ff7657", animationDelay: "-1s" }}
              >
                <Icon name="home" />
              </span>
              <span
                className={styles.mapPin}
                style={{ right: "16%", bottom: "19%", background: "#ffd34e", animationDelay: "-2s" }}
              >
                <Icon name="building" />
              </span>
              <div className="absolute bottom-5 left-5 z-[3] border-2 border-heroDark-950 bg-rent-surface p-4 shadow-glass">
                <p className="font-display text-xs font-bold uppercase tracking-[0.12em]">Quanh bạn · 3 km</p>
                <p className="mt-2 text-3xl font-display font-bold">24 chỗ ở</p>
                <p className="mt-1 text-xs font-semibold text-rent-secondary">Vị trí hiển thị là xấp xỉ</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-y-2 border-heroDark-950 bg-heroDark-950 py-16 text-white sm:py-24">
        <div className="rm-page-container">
          <Reveal>
            <span className="inline-flex border-2 border-white bg-rent-coral px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.14em] text-heroDark-950 shadow-[4px_4px_0_#fff]">
              Quy trình 03 bước
            </span>
            <h2 className={`${styles.sectionHeading} mt-7 max-w-5xl text-white`}>Từ “đang tìm” đến “đã hẹn xem”.</h2>
          </Reveal>
          <div className="mt-12 grid border-2 border-white md:grid-cols-3">
            {productSteps.map((step, index) => (
              <Reveal key={step.number} delay={(index % 3) as 0 | 1 | 2}>
                <article className="flex min-h-72 h-full flex-col justify-between border-b-2 border-white p-6 last:border-b-0 md:border-b-0 md:border-r-2 md:last:border-r-0 sm:p-8">
                  <div className="flex items-start justify-between">
                    <span className="font-display text-sm font-bold text-rent-accent">/{step.number}</span>
                    <Icon name={step.icon} className="h-8 w-8 text-rent-coral" />
                  </div>
                  <div>
                    <h3 className="font-display text-2xl font-bold tracking-[-0.04em]">{step.title}</h3>
                    <p className="mt-4 text-sm font-semibold leading-6 text-[#b9cbc6]">{step.description}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="rm-section">
        <div className="rm-page-container">
          <Reveal className="grid overflow-hidden border-2 border-heroDark-950 bg-rent-coral shadow-card-elevated lg:grid-cols-[1.15fr_0.85fr]">
            <div className="p-7 sm:p-10 lg:p-14">
              <span className="font-display text-xs font-bold uppercase tracking-[0.16em]">Dành cho chủ nhà</span>
              <h2 className={`${styles.sectionHeading} mt-5`}>Có chỗ trống? Biến nó thành một lời mời.</h2>
              <p className="mt-6 max-w-xl text-base font-semibold leading-7">
                Workspace dành riêng cho chủ nhà giúp bạn tạo bản nháp, quản lý ảnh và theo dõi vòng đời tin đăng.
              </p>
              <Link
                href={landlordHref}
                className="mt-8 inline-flex min-h-12 items-center gap-3 border-2 border-heroDark-950 bg-rent-accent px-5 font-display text-sm font-bold shadow-glass transition-transform hover:-translate-x-1 hover:-translate-y-1"
              >
                Bắt đầu đăng tin
                <Icon name="arrowUpRight" />
              </Link>
            </div>
            <div className="border-t-2 border-heroDark-950 bg-rent-surface p-7 lg:border-l-2 lg:border-t-0 sm:p-10">
              {landlordBenefits.map((benefit, index) => (
                <div
                  key={benefit.title}
                  className="flex gap-4 border-b-2 border-heroDark-950 py-5 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center border-2 border-heroDark-950 bg-[#e5eefc] shadow-glass-sm">
                    <Icon name={benefit.icon} />
                  </span>
                  <div>
                    <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-rent-coral">
                      0{index + 1}
                    </span>
                    <h3 className="font-display text-lg font-bold">{benefit.title}</h3>
                    <p className="mt-1 text-sm font-semibold leading-6 text-rent-secondary">{benefit.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-y-2 border-heroDark-950 bg-[#e5eefc] py-16 sm:py-20">
        <div className="rm-page-container">
          <Reveal className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <span className="font-display text-xs font-bold uppercase tracking-[0.16em]">Voice notes</span>
              <h2 className={`${styles.sectionHeading} mt-4`}>Người thật nói gì?</h2>
            </div>
            <span className="w-fit border-2 border-heroDark-950 bg-rent-yellow px-3 py-1 font-display text-xs font-bold shadow-glass-sm">
              4.9 / 5
            </span>
          </Reveal>
          <div className={`mt-10 ${styles.quoteRail}`}>
            {userReviews.map((review, index) => (
              <Reveal key={review.name} delay={(index % 3) as 0 | 1 | 2}>
                <article
                  className={`${styles.quote} ${index === 1 ? "bg-rent-accent" : index === 2 ? "bg-rent-coral" : "bg-rent-surface"}`}
                >
                  <div>
                    <Icon name="star" filled className="h-6 w-6" />
                    <blockquote className="mt-6 font-display text-xl font-bold leading-7 tracking-[-0.025em]">
                      “{review.quote}”
                    </blockquote>
                  </div>
                  <div className="mt-8 flex items-center gap-3 border-t-2 border-heroDark-950 pt-4">
                    <Image
                      src={review.avatar}
                      alt={review.name}
                      width={48}
                      height={48}
                      className="h-12 w-12 border-2 border-heroDark-950 object-cover"
                    />
                    <div>
                      <p className="font-display text-sm font-bold">{review.name}</p>
                      <p className="text-xs font-semibold text-rent-secondary">{review.role}</p>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="rm-section">
        <div className="rm-page-container grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
          <Reveal>
            <span className="rm-eyebrow">FAQ · Hỏi nhanh</span>
            <h2 className={`${styles.sectionHeading} mt-6`}>Trước khi bạn bắt đầu.</h2>
          </Reveal>
          <Reveal delay={1}>
            <div>
              {faqItems.map((faq, index) => {
                const open = activeFaq === index;
                return (
                  <div key={faq.q} className={styles.faqItem}>
                    <button
                      type="button"
                      className="flex min-h-20 w-full items-center justify-between gap-5 py-5 text-left font-display text-lg font-bold sm:text-xl"
                      aria-expanded={open}
                      onClick={() => setActiveFaq(open ? null : index)}
                    >
                      <span>
                        <span className="mr-3 text-sm text-rent-coral">0{index + 1}</span>
                        {faq.q}
                      </span>
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center border-2 border-heroDark-950 transition-colors ${open ? "bg-rent-coral" : "bg-rent-accent"}`}
                      >
                        <Icon name={open ? "minus" : "plus"} className="h-5 w-5" />
                      </span>
                    </button>
                    {open ? (
                      <p className="max-w-2xl pb-6 pr-14 text-sm font-semibold leading-7 text-rent-secondary">
                        {faq.a}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
