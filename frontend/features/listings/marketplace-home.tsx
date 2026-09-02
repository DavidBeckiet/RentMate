"use client";

import Link from "next/link";
import { Badge } from "../../components/ui/badge";
import { EmptyState, ErrorState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
import { Reveal } from "../../components/ui/reveal";
import { SectionHeader } from "../../components/ui/section-header";
import { BusinessStatusBadge } from "../../components/ui/status-badge";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, PropertyType, PublicListingSummary } from "../../types/api";
import { FavoriteSaveControl } from "../favorites/favorite-save-control";
import { ListingCardSkeleton } from "./listing-card";
import { formatAreaSqm, formatVnd } from "./format";
import { HeroSearch } from "./hero-search";
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

function ListingPreview({ listing }: { readonly listing: PublicListingSummary }) {
  return (
    <article className={styles.listingCard}>
      <Link href={"/listings/" + listing.id} className={styles.listingLink}>
        <div className={styles.listingImage}>
          <MediaImage
            src={listing.coverImage.url}
            alt={listing.coverImage.altText ?? "Ảnh của " + listing.title}
            fill
            sizes="(min-width: 1100px) 25vw, (min-width: 640px) 50vw, 100vw"
            className={styles.listingImageAsset}
            fallback={
              <div className={styles.listingImageFallback}>
                <Icon name="home" className="h-8 w-8" />
                <span>Chưa có ảnh</span>
              </div>
            }
          />
          <Badge variant="primary" className={styles.listingType}>
            {listing.propertyType.label}
          </Badge>
          <span className={styles.listingStatus}>
            <BusinessStatusBadge status={listing.businessStatus} />
          </span>
        </div>

        <div className={styles.listingBody}>
          <div>
            <div className={styles.listingTitleRow}>
              <p className={styles.listingPrice}>{formatVnd(listing.monthlyRent)}</p>
              <Icon name="arrowUpRight" className="h-5 w-5 shrink-0" />
            </div>
            <h3 className={styles.listingTitle}>{listing.title}</h3>
          </div>
          <div className={styles.listingMeta}>
            <p className={styles.listingLocation}>
              <Icon name="pin" className="h-4 w-4 shrink-0" />
              <span className="truncate">{listing.areaName}</span>
            </p>
            <span className={styles.listingFact}>
              <Icon name="ruler" className="h-4 w-4 shrink-0" />
              {formatAreaSqm(listing.roomAreaSqm)}
            </span>
            {listing.maxOccupants !== null ? (
              <span className={styles.listingFact}>
                <Icon name="users" className="h-4 w-4 shrink-0" />
                {listing.maxOccupants} người
              </span>
            ) : null}
          </div>
        </div>
      </Link>
      <div className={styles.listingActions}>
        <FavoriteSaveControl listingId={String(listing.id)} compact />
      </div>
    </article>
  );
}

function HeroEditorialVisual() {
  return (
    <div className={styles.heroVisual}>
      <MediaImage
        src="/images/rentmate-home-hero.png"
        alt="Minh hoạ khu nhà đô thị ấm áp cho trải nghiệm tìm chỗ ở RentMate"
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 100vw"
        className={styles.heroImage}
        fallback={
          <div className={styles.heroImageFallback}>
            <Icon name="home" className="h-14 w-14" />
            <span>Khám phá nơi ở phù hợp với nhịp sống của bạn.</span>
          </div>
        }
      />
      <div className={styles.heroVisualShade} aria-hidden="true" />
      <div className={styles.heroVisualNote}>
        <Badge variant="verified" showIndicator>
          Thông tin rõ ràng hơn
        </Badge>
        <p>Vị trí công khai được mô tả là vị trí xấp xỉ.</p>
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
  tone
}: {
  readonly href: string;
  readonly icon: "search" | "users";
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
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
        <span>{description}</span>
      </span>
      <Icon name="arrowUpRight" className={styles.journeyArrow} />
    </Link>
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
                <span>Tìm người ở ghép.</span>
                <em>Sống đúng nhịp.</em>
              </h1>
              <p className={styles.heroDescription}>
                Tìm một nơi vừa túi tiền, đúng khu vực và phù hợp với cách bạn muốn sống — với thông tin được trình bày
                dễ hiểu.
              </p>
              <div className={styles.heroLinks}>
                <Link href="/search" className={styles.heroPrimaryLink}>
                  Khám phá tin đăng <Icon name="arrow" className="h-5 w-5" />
                </Link>
                <Link href="/roommates" className={styles.heroSecondaryLink}>
                  Tìm người ở ghép <Icon name="users" className="h-4 w-4" />
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
            description="Những lựa chọn công khai được tải trực tiếp từ RentMate."
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
                  <ListingPreview listing={listing} />
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
            <h2 id="journey-heading">Chọn điều đang cần hôm nay.</h2>
            <p>
              RentMate kết nối những nhu cầu thật trong một không gian dễ đi qua, từ tìm phòng đến tìm người ở cùng.
            </p>
          </Reveal>
          <div className={styles.journeyCards}>
            <Reveal delay={1}>
              <JourneyCard
                href="/search"
                icon="search"
                eyebrow="Tôi đang tìm chỗ ở"
                title="Tìm phòng"
                description="Lọc theo khu vực, loại hình, ngân sách và tiện ích."
                tone="primary"
              />
            </Reveal>
            <Reveal delay={2}>
              <JourneyCard
                href="/roommates"
                icon="users"
                eyebrow="Tôi muốn ở cùng ai đó"
                title="Tìm người ở ghép"
                description="Khám phá luồng roommate dành cho nhu cầu ở cùng."
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
            description="Bắt đầu từ nơi bạn muốn sống, rồi điều chỉnh bộ lọc theo nhu cầu thực tế."
          />
          <div className={styles.areaGrid}>
            {["Thảo Điền", "Bình Thạnh", "Phú Nhuận", "Quận 3"].map((area, index) => (
              <Link key={area} href={"/search?q=" + encodeURIComponent(area)} className={styles.areaLink}>
                <span className={styles.areaNumber}>0{index + 1}</span>
                <span>{area}</span>
                <Icon name="arrowUpRight" className="h-4 w-4" />
              </Link>
            ))}
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

      <section className={styles.landlordSection} aria-labelledby="landlord-heading">
        <div className={"rm-page-container " + styles.landlordLayout}>
          <div>
            <p className={styles.sectionKicker}>Dành cho chủ nhà</p>
            <h2 id="landlord-heading">Có chỗ trống? Đưa thông tin đến đúng người.</h2>
            <p>Quản lý tin đăng theo quy trình RentMate và giữ quyền kiểm soát thông tin của bạn.</p>
          </div>
          <Link href={landlordHref} className={styles.landlordAction}>
            Đăng tin trên RentMate <Icon name="arrow" className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
