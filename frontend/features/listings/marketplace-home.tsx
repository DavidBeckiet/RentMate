"use client";

import Link from "next/link";
import { EmptyState, ErrorState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
import { Reveal } from "../../components/ui/reveal";
import { SectionHeader } from "../../components/ui/section-header";
import { useAuth } from "../../lib/auth/auth-provider";
import { formatAreaLabel } from "../../lib/area";
import type { ApiPage, PropertyType, PublicListingSummary } from "../../types/api";
import { formatVnd } from "./format";
import { HeroSearch } from "./hero-search";
import { ListingCard, ListingCardSkeleton } from "./listing-card";
import { serializeSearchState } from "./search-query";
import type { SearchFilterValues } from "./search-query";
import styles from "./marketplace-home.module.css";

const homepageAreaLimit = 8;

const landlordBenefits = [
  {
    icon: "building",
    title: "Đăng và cập nhật tin phòng",
    description: "Giữ thông tin tin đăng rõ ràng và luôn đúng với thực tế."
  },
  {
    icon: "clipboard",
    title: "Quản lý các phòng đang đăng",
    description: "Theo dõi các tin đăng trong cùng một không gian quản lý."
  },
  {
    icon: "message",
    title: "Theo dõi yêu cầu liên hệ",
    description: "Biết khách thuê nào đang chờ phản hồi để tiếp tục trao đổi."
  },
  {
    icon: "chart",
    title: "Theo dõi hiệu quả tin đăng",
    description: "Xem thông tin hỗ trợ bạn điều chỉnh cách đăng tin."
  }
] as const;

export interface MarketplaceHomeProps {
  readonly propertyTypes: readonly PropertyType[];
  readonly propertyTypesLoading: boolean;
  readonly listings: ApiPage<PublicListingSummary> | null;
  readonly listingsStatus: "idle" | "loading" | "success" | "error";
  readonly listingsError: string | null;
  readonly onSearch: (filters: SearchFilterValues) => void;
  readonly onRetryListings: () => void;
}

function areaSearchHref(areaName: string): string {
  const query = serializeSearchState({
    mode: "ordinary",
    areaName: formatAreaLabel(areaName),
    amenities: [],
    page: 1,
    pageSize: 20,
    sort: "newest"
  }).toString();
  return query ? `/search?${query}` : "/search";
}

function HeroEditorialVisual({ listing }: { readonly listing?: PublicListingSummary }) {
  return (
    <div className={styles.heroVisual}>
      <div className={styles.heroRoomStage} aria-hidden="true">
        <svg className={styles.heroRoomIllustration} viewBox="0 0 640 540" fill="none">
          <defs>
            <linearGradient id="room-wall" x1="90" y1="32" x2="572" y2="480" gradientUnits="userSpaceOnUse">
              <stop stopColor="#F5EBD7" />
              <stop offset="1" stopColor="#E9D9BB" />
            </linearGradient>
            <linearGradient id="room-light" x1="108" y1="72" x2="394" y2="427" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFF7D9" stopOpacity=".95" />
              <stop offset="1" stopColor="#E6AF68" stopOpacity=".16" />
            </linearGradient>
            <linearGradient id="room-sofa" x1="239" y1="324" x2="522" y2="444" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4F8277" />
              <stop offset="1" stopColor="#1C554D" />
            </linearGradient>
          </defs>
          <rect width="640" height="540" fill="url(#room-wall)" />
          <path d="M0 404 640 347v193H0V404Z" fill="#D6B58B" />
          <path d="m0 404 640-57v11L0 415v-11Z" fill="#C69C6E" />
          <path d="M52 70c0-30 24-54 54-54h117c30 0 54 24 54 54v226H52V70Z" fill="#174A43" />
          <path d="M66 72c0-23 19-42 42-42h111c23 0 42 19 42 42v207H66V72Z" fill="#D8E8D9" />
          <path d="M67 204c36-43 65-28 96 4 32-39 65-56 98-20v92H67v-76Z" fill="#9BBDA5" />
          <path d="M67 231c34-27 61-18 89 6 32-28 66-36 105-7v50H67v-49Z" fill="#6E9B7F" />
          <path d="M164 30v248M67 171h194" stroke="#174A43" strokeWidth="9" />
          <path d="m260 292 179 118H172l88-118Z" fill="url(#room-light)" />
          <circle cx="491" cy="92" r="39" fill="#EBC66E" />
          <path d="M0 454c104-43 205-57 305-32 91 23 180 25 335-11v129H0V454Z" fill="#CBA47A" />
          <ellipse cx="352" cy="455" rx="178" ry="24" fill="#9C795A" fillOpacity=".2" />
          <path d="M221 347c0-19 15-34 34-34h220c25 0 45 20 45 45v82H221v-93Z" fill="url(#room-sofa)" />
          <path d="M240 350c0-13 10-23 23-23h87v71H240v-48ZM360 327h89c13 0 23 10 23 23v48H360v-71Z" fill="#82A79A" />
          <path d="M222 391h299v21c0 18-14 32-32 32H254c-18 0-32-14-32-32v-21Z" fill="#16483F" />
          <path d="M252 444v21m234-21v21" stroke="#704C35" strokeWidth="10" strokeLinecap="round" />
          <path
            d="M540 259c-22-30-14-54 12-72-2 32 7 49 24 59-21-5-30-1-36 13Zm7 30c-8-32 5-51 36-58-13 26-12 46 1 64-18-12-29-12-37-6Zm-26-5c-2-30-19-46-49-45 20 20 26 38 19 60 14-17 25-20 36-15Z"
            fill="#58816B"
          />
          <path d="M526 296h58l-8 91h-42l-8-91Z" fill="#B86847" />
          <path d="M530 296h50v12h-50z" fill="#D37E59" />
          <path d="M432 434h100v54H432z" fill="#E8C99F" />
          <path d="M423 430h118v13H423z" fill="#C09060" />
          <path d="M456 443h51v5h-51z" fill="#F7E9D4" />
        </svg>
      </div>

      <div className={styles.heroMapCue} aria-hidden="true">
        <span className={styles.heroMapArt}>
          <svg viewBox="0 0 100 64" fill="none">
            <path d="M-2 22 29 8l26 13 27-18 22 9M4 52l24-11 22 12 25-17 26 8" stroke="currentColor" strokeWidth="2" />
            <path
              d="m16-4 8 25-8 19 8 27M52-4l-7 25 12 14-5 33M82-5l-8 22 7 16-8 29"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path d="M59 30c0 7-9 18-9 18s-9-11-9-18a9 9 0 1 1 18 0Z" fill="#D7F08A" stroke="#174A43" strokeWidth="2" />
            <circle cx="50" cy="30" r="3" fill="#174A43" />
          </svg>
        </span>
        <span>
          <strong>{listing ? formatAreaLabel(listing.areaName) : "Khu vực bạn quan tâm"}</strong>
          <small>Vị trí công khai ở mức xấp xỉ</small>
        </span>
      </div>

      <div className={styles.heroRoommateCue} aria-hidden="true">
        <span className={styles.heroRoommateIcon}>
          <Icon name="users" className="h-5 w-5" />
        </span>
        <span className={styles.heroRoommateEyebrow}>Ở GHÉP</span>
        <strong>Nhịp sống cũng quan trọng.</strong>
        <span className={styles.heroRoommateTopics}>
          Giờ giấc <i /> Không gian chung
        </span>
      </div>

      {listing ? (
        <Link
          href={`/listings/${listing.id}`}
          className={styles.heroListingCard}
          aria-label={`Xem tin ${listing.title}`}
        >
          <span className={styles.heroListingPhoto}>
            <MediaImage
              src={listing.coverImage.url}
              alt={listing.coverImage.altText ?? `Ảnh của ${listing.title}`}
              fill
              sizes="(min-width: 1024px) 20vw, (min-width: 640px) 34vw, 28vw"
              className={styles.heroListingImage}
              fallback={
                <span className={styles.heroListingImageFallback}>
                  <Icon name="home" className="h-7 w-7" />
                </span>
              }
            />
          </span>
          <span className={styles.heroListingCopy}>
            <span className={styles.heroListingEyebrow}>TIN ĐANG HIỂN THỊ</span>
            <strong title={listing.title}>{listing.title}</strong>
            <span className={styles.heroListingArea}>
              <Icon name="pin" className="h-3.5 w-3.5" />
              {formatAreaLabel(listing.areaName)}
            </span>
            <span className={styles.heroListingPrice}>{formatVnd(listing.monthlyRent)}</span>
            {listing.landlordVerified ? (
              <span className={styles.heroListingVerified}>
                <Icon name="check" className="h-3.5 w-3.5" />
                Chủ nhà đã xác minh
              </span>
            ) : null}
          </span>
        </Link>
      ) : (
        <div className={styles.heroListingFallback} aria-hidden="true">
          <Icon name="search" className="h-5 w-5" />
          <span>
            <strong>Chọn theo nhu cầu của bạn</strong>
            <small>Khu vực · Ngân sách · Loại phòng</small>
          </span>
        </div>
      )}
    </div>
  );
}

function JourneyCard({
  href,
  icon,
  eyebrow,
  title,
  description,
  cta,
  tone
}: {
  readonly href: string;
  readonly icon: "search" | "users" | "building";
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly cta: string;
  readonly tone: "primary" | "accent" | "neutral";
}) {
  const toneClass =
    tone === "primary"
      ? styles.journeyCardPrimary
      : tone === "accent"
        ? styles.journeyCardAccent
        : styles.journeyCardNeutral;

  return (
    <Link href={href} className={`${styles.journeyCard} ${toneClass}`}>
      <span className={styles.journeyIcon} aria-hidden="true">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <span className={styles.journeyContent}>
        <span className={styles.journeyEyebrow}>{eyebrow}</span>
        <strong>{title}</strong>
        <span className={styles.journeyDescription}>{description}</span>
        <span className={styles.journeyCta}>
          {cta}
          <Icon name="arrow" className="h-4 w-4" aria-hidden="true" />
        </span>
      </span>
      <Icon name="arrowUpRight" className={styles.journeyArrow} aria-hidden="true" />
    </Link>
  );
}

function LandlordBenefit({
  icon,
  title,
  description
}: Readonly<{
  readonly icon: (typeof landlordBenefits)[number]["icon"];
  readonly title: string;
  readonly description: string;
}>) {
  return (
    <li className={styles.landlordBenefit}>
      <span className={styles.landlordBenefitIcon} aria-hidden="true">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span>
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
    </li>
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
  const landlordHref = status === "authenticated" && user?.role === "LANDLORD" ? "/landlord" : "/register/landlord";
  const homepageAreas = Array.from(
    new Set(liveListings.map((listing) => formatAreaLabel(listing.areaName.trim())).filter((area) => area.length > 0))
  ).slice(0, homepageAreaLimit);

  return (
    <div className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={`rm-page-container ${styles.heroGrid}`}>
          <div className={styles.heroLayout}>
            <div className={styles.heroCopy}>
              <p className={styles.heroKicker}>
                <span className={styles.heroKickerMark} aria-hidden="true">
                  <Icon name="home" className="h-4 w-4" />
                </span>
                RentMate · nơi ở rõ ràng hơn
              </p>
              <h1 id="home-title" className={styles.heroTitle}>
                Tìm nơi ở hợp với <span>nhịp sống của bạn.</span>
              </h1>
              <p className={styles.heroDescription}>Tìm phòng theo ngân sách, hoặc tìm người hợp nhịp sống.</p>
              <div className={styles.heroLinks}>
                <Link href="/search" className={styles.heroPrimaryLink}>
                  Khám phá phòng <Icon name="arrow" className="h-5 w-5" />
                </Link>
                <Link href="/roommates" className={styles.heroSecondaryLink}>
                  Tìm người ở ghép <Icon name="users" className="h-4 w-4" />
                </Link>
              </div>
              <p className={styles.heroLandlordNote}>
                Có phòng cho thuê? <Link href={landlordHref}>Dành cho chủ trọ</Link>
              </p>
            </div>
            <div className={styles.heroVisualFrame}>
              <HeroEditorialVisual listing={liveListings[0]} />
            </div>
          </div>

          <div className={styles.heroSearchBand}>
            <HeroSearch
              propertyTypes={propertyTypes}
              loading={propertyTypesLoading && propertyTypes.length === 0}
              onSearch={onSearch}
            />
          </div>

          <div className={styles.heroTrustRow} aria-label="Thông tin về RentMate">
            <span>
              <Icon name="map" className="h-4 w-4" /> Vị trí công khai ở mức xấp xỉ
            </span>
            <span>
              <Icon name="compare" className="h-4 w-4" /> Lưu và so sánh lựa chọn
            </span>
            <span>
              <Icon name="message" className="h-4 w-4" /> Kết nối theo quyền truy cập
            </span>
          </div>
        </div>
      </section>

      <section className={styles.journeySection} aria-labelledby="journey-heading">
        <Reveal>
          <div className={`rm-page-container ${styles.journeyLayout}`}>
            <div className={styles.journeyIntro}>
              <p className={styles.sectionKicker}>BẮT ĐẦU TỪ ĐÂY</p>
              <h2 id="journey-heading">Bạn muốn làm gì hôm nay?</h2>
              <p>Chọn hành trình phù hợp với nhu cầu hiện tại của bạn.</p>
            </div>
            <div className={styles.journeyCards}>
              <JourneyCard
                href="/search"
                icon="search"
                eyebrow="Tôi đang tìm chỗ ở"
                title="Tìm phòng"
                description="Khám phá phòng trọ và căn hộ theo khu vực, mức giá và nhu cầu của bạn."
                cta="Khám phá phòng"
                tone="primary"
              />
              <JourneyCard
                href="/roommates"
                icon="users"
                eyebrow="Tôi muốn ở cùng ai đó"
                title="Tìm người ở ghép"
                description="Tìm người có nhu cầu ở ghép và nhịp sống phù hợp với bạn."
                cta="Tìm người ở ghép"
                tone="accent"
              />
              <JourneyCard
                href={landlordHref}
                icon="building"
                eyebrow="Tôi có phòng cho thuê"
                title="Dành cho chủ trọ"
                description="Đăng phòng, cập nhật tin và theo dõi yêu cầu liên hệ."
                cta="Quản lý tin đăng"
                tone="neutral"
              />
            </div>
          </div>
        </Reveal>
      </section>

      <section className={styles.featuredSection} aria-label="Tin đăng mới nhất">
        <Reveal>
          <div className="rm-page-container">
            <SectionHeader
              title="Tin đăng mới nhất"
              description="Khám phá những lựa chọn công khai vừa được cập nhật trên RentMate."
              action={
                <Link href="/search" className={styles.sectionAction}>
                  Xem tất cả phòng <Icon name="arrowUpRight" className="h-4 w-4" />
                </Link>
              }
            />

            {listingsStatus === "loading" && listings === null ? (
              <div className={styles.loadingResults} role="status" aria-live="polite">
                <span className="sr-only">Đang tìm những tin đăng mới nhất…</span>
                <div className={styles.listingGrid} aria-hidden="true">
                  {Array.from({ length: 4 }, (_, index) => (
                    <ListingCardSkeleton key={index} />
                  ))}
                </div>
              </div>
            ) : null}

            {listingsStatus === "error" ? (
              <ErrorState
                message={listingsError ?? "Danh sách phòng chưa sẵn sàng. Bạn vẫn có thể mở tìm kiếm để thử lại."}
                onRetry={onRetryListings}
                className={styles.featuredState}
              />
            ) : null}

            {listingsStatus === "success" && liveListings.length === 0 ? (
              <EmptyState
                title="Chưa có tin đăng công khai mới"
                description="Kho tin đang được cập nhật. Hãy thử tìm theo khu vực hoặc quay lại sau."
                visual={<Icon name="search" className="h-10 w-10" />}
                action={
                  <Link href="/search" className={styles.emptyAction}>
                    Mở tìm kiếm <Icon name="arrow" className="h-4 w-4" />
                  </Link>
                }
                className={styles.featuredState}
              />
            ) : null}

            {liveListings.length > 0 ? (
              <div className={styles.listingGrid}>
                {liveListings.slice(0, 4).map((listing) => (
                  <ListingCard key={listing.id} listing={listing} showFavorite showCompare />
                ))}
              </div>
            ) : null}
          </div>
        </Reveal>
      </section>

      <section className={styles.exploreSection} aria-label="Khám phá theo khu vực">
        <Reveal>
          <div className="rm-page-container">
            <SectionHeader
              title="Khám phá theo khu vực"
              description="Bắt đầu từ những khu vực đang xuất hiện trong các tin mới nhất."
            />
            {homepageAreas.length > 0 ? (
              <div className={styles.areaGrid} aria-label="Các khu vực đang có tin mới">
                {homepageAreas.map((area) => (
                  <Link key={area} href={areaSearchHref(area)} className={styles.areaLink}>
                    <span className={styles.areaIcon} aria-hidden="true">
                      <Icon name="pin" className="h-4 w-4" />
                    </span>
                    <span>{area}</span>
                    <Icon name="arrowUpRight" className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className={styles.areaEmpty}>Mở tìm kiếm để xem phòng theo khu vực.</p>
            )}
            <div className={styles.areaFooter}>
              <Link href="/search" className={styles.sectionAction}>
                Xem tất cả phòng <Icon name="arrowUpRight" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <section className={styles.roommateSection} aria-labelledby="roommate-heading">
        <Reveal>
          <div className={`rm-page-container ${styles.roommateLayout}`}>
            <div className={styles.roommateVisual} aria-hidden="true">
              <div className={styles.roommateVisualOrb} />
              <div className={styles.roommateVisualCard}>
                <div className={styles.roommateVisualHeader}>
                  <span className={styles.roommateVisualIcon}>
                    <Icon name="users" className="h-5 w-5" />
                  </span>
                  <span>
                    <small>Ở GHÉP CÙNG RENTMATE</small>
                    <strong>Hiểu nhau trước khi cùng tìm nhà.</strong>
                  </span>
                </div>
                <div className={styles.roommateSignalList}>
                  <span>
                    <Icon name="check" className="h-4 w-4" /> Nếp sinh hoạt
                  </span>
                  <span>
                    <Icon name="check" className="h-4 w-4" /> Nhu cầu thuê
                  </span>
                  <span>
                    <Icon name="message" className="h-4 w-4" /> Điều nên trao đổi
                  </span>
                </div>
              </div>
              <span className={styles.roommateVisualFootnote}>Mỗi người, một nhịp sống riêng.</span>
            </div>
            <div className={styles.roommateCopy}>
              <p className={styles.sectionKicker}>Ở GHÉP CŨNG CẦN HỢP CÁCH SỐNG</p>
              <h2 id="roommate-heading">Tìm được người hợp nếp sống quan trọng như tìm đúng căn phòng.</h2>
              <p>Khám phá nhu cầu của nhau, hiểu những điểm phù hợp và khác biệt cần trao đổi trước khi kết nối.</p>
              <ul className={styles.roommateBenefits}>
                <li>
                  <Icon name="home" className="h-4 w-4" /> Chia sẻ nhu cầu ở cùng
                </li>
                <li>
                  <Icon name="compare" className="h-4 w-4" /> Cùng hiểu các điểm hợp và khác biệt
                </li>
                <li>
                  <Icon name="message" className="h-4 w-4" /> Kết nối và nhắn tin trong RentMate
                </li>
              </ul>
              <Link href="/roommates" className={styles.roommateAction}>
                Tìm người ở ghép <Icon name="arrow" className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <section className={styles.trustSection} aria-labelledby="trust-heading">
        <Reveal>
          <div className={`rm-page-container ${styles.trustLayout}`}>
            <div className={styles.trustIntro}>
              <p className={styles.sectionKicker}>RÕ RÀNG NGAY TỪ ĐẦU</p>
              <h2 id="trust-heading">Đủ thông tin để chọn bước tiếp theo.</h2>
              <p>Khám phá, so sánh và kết nối với ngữ cảnh phù hợp.</p>
            </div>
            <div className={styles.trustGrid}>
              <article>
                <span className={styles.trustIcon} aria-hidden="true">
                  <Icon name="map" className="h-5 w-5" />
                </span>
                <h3>Vị trí xấp xỉ</h3>
                <p>Thông tin công khai không hiển thị địa chỉ và tọa độ chính xác.</p>
              </article>
              <article>
                <span className={styles.trustIcon} aria-hidden="true">
                  <Icon name="compare" className="h-5 w-5" />
                </span>
                <h3>Chọn theo nhu cầu</h3>
                <p>Lọc khu vực, ngân sách, kiểu phòng và so sánh những lựa chọn bạn quan tâm.</p>
              </article>
              <article>
                <span className={styles.trustIcon} aria-hidden="true">
                  <Icon name="message" className="h-5 w-5" />
                </span>
                <h3>Kết nối đúng quyền</h3>
                <p>Thông tin liên hệ được mở theo ngữ cảnh tài khoản và tin đăng.</p>
              </article>
            </div>
          </div>
        </Reveal>
      </section>

      <section className={styles.landlordSection} aria-labelledby="landlord-heading">
        <Reveal>
          <div className={`rm-page-container ${styles.landlordLayout}`}>
            <div className={styles.landlordCopy}>
              <p className={styles.sectionKicker}>DÀNH CHO CHỦ TRỌ</p>
              <h2 id="landlord-heading">Quản lý phòng trọ dễ dàng hơn với RentMate.</h2>
              <p className={styles.landlordDescription}>
                Từ đăng tin đến theo dõi yêu cầu liên hệ, mọi việc nằm trong không gian dành riêng cho chủ trọ.
              </p>
              <ul className={styles.landlordBenefits}>
                {landlordBenefits.map((benefit) => (
                  <LandlordBenefit key={benefit.title} {...benefit} />
                ))}
              </ul>
              <Link href={landlordHref} className={styles.landlordAction}>
                Đăng phòng trên RentMate <Icon name="arrow" className="h-5 w-5" />
              </Link>
            </div>
            <div className={styles.landlordVisual} aria-hidden="true">
              <div className={styles.landlordVisualHeader}>
                <span className={styles.landlordVisualIcon}>
                  <Icon name="building" className="h-5 w-5" />
                </span>
                <span>
                  <small>KHÔNG GIAN CHỦ TRỌ</small>
                  <strong>Quản lý tin đăng</strong>
                </span>
              </div>
              <div className={styles.landlordVisualList}>
                <div className={styles.landlordVisualItem}>
                  <span>
                    <Icon name="clipboard" className="h-4 w-4" /> Tin đăng
                  </span>
                  <Icon name="arrowUpRight" className="h-4 w-4" />
                </div>
                <div className={styles.landlordVisualItem}>
                  <span>
                    <Icon name="message" className="h-4 w-4" /> Yêu cầu liên hệ
                  </span>
                  <Icon name="arrowUpRight" className="h-4 w-4" />
                </div>
                <div className={styles.landlordVisualItem}>
                  <span>
                    <Icon name="chart" className="h-4 w-4" /> Hiệu quả tin đăng
                  </span>
                  <Icon name="arrowUpRight" className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className={styles.finalSection} aria-labelledby="final-heading">
        <Reveal>
          <div className={`rm-page-container ${styles.finalInner}`}>
            <span className={styles.finalMark} aria-hidden="true">
              <Icon name="home" className="h-5 w-5" />
            </span>
            <p className={styles.sectionKicker}>BẮT ĐẦU THEO CÁCH CỦA BẠN</p>
            <h2 id="final-heading">Nơi ở phù hợp đang chờ bạn khám phá.</h2>
            <div className={styles.finalActions}>
              <Link href="/search" className={styles.finalPrimaryAction}>
                Tìm phòng <Icon name="arrow" className="h-5 w-5" />
              </Link>
              <Link href="/roommates" className={styles.finalSecondaryAction}>
                Tìm người ở ghép <Icon name="users" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
