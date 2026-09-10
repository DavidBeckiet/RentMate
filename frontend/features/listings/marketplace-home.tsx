"use client";

import Link from "next/link";
import { Badge } from "../../components/ui/badge";
import { EmptyState, ErrorState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
import { Reveal } from "../../components/ui/reveal";
import { SectionHeader } from "../../components/ui/section-header";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, PropertyType, PublicListingSummary } from "../../types/api";
import { ListingCard, ListingCardSkeleton } from "./listing-card";
import { HeroSearch } from "./hero-search";
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

function HeroEditorialVisual() {
  return (
    <div className={styles.heroVisual}>
      <MediaImage
        src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=85"
        alt="Căn studio sáng với nội thất gỗ và cửa sổ lớn"
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 100vw"
        className={styles.heroImage}
        fallback={
          <div className={styles.heroImageFallback}>
            <Icon name="home" className="h-14 w-14" />
            <span>Khám phá một không gian ở phù hợp với nhịp sống của bạn.</span>
          </div>
        }
      />
      <div className={styles.heroVisualShade} aria-hidden="true" />
      <div className={styles.heroVisualNote}>
        <Badge variant="verified" showIndicator>
          Không gian thật
        </Badge>
        <p>Hình ảnh phòng ở giúp bạn hình dung nơi mình sẽ sống.</p>
      </div>
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
  readonly icon: "search" | "users";
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly cta: string;
  readonly tone: "primary" | "accent";
}) {
  return (
    <Link
      href={href}
      className={styles.journeyCard + " " + (tone === "primary" ? styles.journeyCardPrimary : styles.journeyCardAccent)}
    >
      <span className={styles.journeyIcon}>
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
    new Set(liveListings.map((listing) => listing.areaName.trim()).filter((area) => area.length > 0))
  ).slice(0, homepageAreaLimit);

  return (
    <div className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={"rm-page-container " + styles.heroGrid}>
          <div className={styles.heroLayout}>
            <div className={styles.heroCopy}>
              <p className={styles.heroKicker}>
                <Icon name="home" className="h-4 w-4" /> RentMate · nơi ở rõ ràng hơn
              </p>
              <h1 id="home-title" className={styles.heroTitle}>
                Tìm phòng.
                <span>Tìm bạn.</span>
                <em>Sống đúng nhịp.</em>
              </h1>
              <p className={styles.heroDescription}>Tìm nơi ở vừa túi tiền, đúng khu vực và hợp với bạn.</p>
              <div className={styles.heroLinks}>
                <Link href="/search" className={styles.heroPrimaryLink}>
                  Xem phòng <Icon name="arrow" className="h-5 w-5" />
                </Link>
                <Link href="/roommates" className={styles.heroSecondaryLink}>
                  Tìm bạn ở ghép <Icon name="users" className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <HeroEditorialVisual />
          </div>

          <div className={styles.heroSearchBand}>
            <HeroSearch
              propertyTypes={propertyTypes}
              loading={propertyTypesLoading && propertyTypes.length === 0}
              onSearch={onSearch}
            />
          </div>

          <div className={styles.heroTrustRow} aria-label="Thông tin đáng chú ý khi tìm phòng">
            <span>
              <Icon name="map" className="h-4 w-4" /> Vị trí công khai là vị trí xấp xỉ
            </span>
            <span>
              <Icon name="shield" className="h-4 w-4" /> Tin đăng đi qua quy trình duyệt
            </span>
            <span>
              <Icon name="message" className="h-4 w-4" /> Kết nối theo quyền truy cập
            </span>
          </div>
        </div>
      </section>

      <section className={styles.featuredSection} aria-label="Tin đăng mới nhất">
        <div className="rm-page-container">
          <SectionHeader
            title="Tin đăng mới nhất"
            description="Những lựa chọn công khai mới nhất từ RentMate. Chọn tin để so sánh khi cần."
            action={
              <Link href="/search" className={styles.sectionAction}>
                Xem tất cả <Icon name="arrowUpRight" className="h-4 w-4" />
              </Link>
            }
          />
          <div className={styles.listingStatusRow} aria-live="polite">
            {listingsStatus === "success" && liveListings.length > 0 ? (
              <span>Đang hiển thị các tin đăng công khai mới nhất.</span>
            ) : null}
            {listingsStatus === "error" ? <span>{listingsError ?? "Chưa thể tải danh sách phòng."}</span> : null}
            {listingsStatus === "error" ? (
              <button type="button" onClick={onRetryListings}>
                Thử tải lại
              </button>
            ) : null}
          </div>

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
              description="Kho tin đang được cập nhật. Hãy mở trang tìm kiếm để lọc khu vực hoặc thử lại sau."
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
              {liveListings.slice(0, 4).map((listing, index) => (
                <Reveal key={listing.id} delay={(index % 4) as 0 | 1 | 2 | 3}>
                  <ListingCard listing={listing} showFavorite showCompare />
                </Reveal>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className={styles.journeySection} aria-labelledby="journey-heading">
        <div className={"rm-page-container " + styles.journeyLayout}>
          <Reveal className={styles.journeyIntro}>
            <p className={styles.sectionKicker}>Hai cách bắt đầu</p>
            <h2 id="journey-heading">Bạn đang tìm gì?</h2>
            <p>Chọn hành trình phù hợp với nhu cầu hiện tại của bạn.</p>
          </Reveal>
          <div className={styles.journeyCards}>
            <Reveal delay={1}>
              <JourneyCard
                href="/search"
                icon="search"
                eyebrow="Tôi đang tìm chỗ ở"
                title="Tìm phòng"
                description="Khám phá phòng trọ và căn hộ theo khu vực, mức giá và nhu cầu của bạn."
                cta="Khám phá phòng"
                tone="primary"
              />
            </Reveal>
            <Reveal delay={2}>
              <JourneyCard
                href="/roommates"
                icon="users"
                eyebrow="Tôi muốn ở cùng ai đó"
                title="Tìm người ở ghép"
                description="Tìm người có nhu cầu ở ghép và nhịp sống phù hợp với bạn."
                cta="Tìm người ở ghép"
                tone="accent"
              />
            </Reveal>
          </div>
        </div>
      </section>

      <section className={styles.exploreSection} aria-label="Khám phá theo khu vực">
        <div className="rm-page-container">
          <SectionHeader
            title="Khám phá theo khu vực"
            description="Bắt đầu từ những khu vực đang xuất hiện trong các tin mới nhất."
          />
          {homepageAreas.length > 0 ? (
            <div className={styles.areaGrid} aria-label="Các khu vực đang có tin mới">
              {homepageAreas.map((area, index) => (
                <Link key={area} href={"/search?areaName=" + encodeURIComponent(area)} className={styles.areaLink}>
                  <span className={styles.areaNumber}>{String(index + 1).padStart(2, "0")}</span>
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
      </section>

      <section className={styles.landlordSection} aria-labelledby="landlord-heading">
        <div className={"rm-page-container " + styles.landlordLayout}>
          <div className={styles.landlordCopy}>
            <p className={styles.sectionKicker}>Dành cho chủ trọ</p>
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
                <small>Không gian chủ trọ</small>
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
      </section>

      <section className={styles.trustSection} aria-labelledby="trust-heading">
        <div className={"rm-page-container " + styles.trustLayout}>
          <div>
            <p className={styles.sectionKicker}>Rõ ràng ngay từ đầu</p>
            <h2 id="trust-heading">Tìm chỗ ở với đủ ngữ cảnh để quyết định.</h2>
          </div>
          <div className={styles.trustGrid}>
            <article>
              <Icon name="map" className="h-5 w-5" />
              <h3>Vị trí xấp xỉ</h3>
              <p>Thông tin công khai không hiển thị địa chỉ và tọa độ chính xác.</p>
            </article>
            <article>
              <Icon name="shield" className="h-5 w-5" />
              <h3>Trạng thái rõ ràng</h3>
              <p>Chỉ tin đăng đủ điều kiện công khai mới xuất hiện trong khám phá.</p>
            </article>
            <article>
              <Icon name="message" className="h-5 w-5" />
              <h3>Liên hệ đúng quyền</h3>
              <p>Thông tin liên hệ được mở theo ngữ cảnh tài khoản và tin đăng.</p>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}
