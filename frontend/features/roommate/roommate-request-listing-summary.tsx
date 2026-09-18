import Link from "next/link";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
import { formatAreaLabel } from "../../lib/area";
import type { RoommateRequest } from "../../types/api";
import { formatAreaSqm } from "../listings/format";
import { propertyTypeLabel } from "../listings/room-type-label";
import { formatRoommateMoney } from "./roommate-content";

export function RoommateRequestListingSummary({
  request,
  onChangeListing
}: Readonly<{ request: RoommateRequest; onChangeListing?: () => void }>) {
  if (request.listingMode === "UNLINKED") {
    return (
      <Card subtle className="rm-roommate-card-static space-y-2">
        <div className="flex items-center gap-2 text-primary-hover">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-subtle">
            <Icon name="home" className="h-4 w-4" />
          </span>
          <p className="rm-roommate-section-label">Phòng đang cân nhắc · không bắt buộc</p>
        </div>
        <h2 className="font-display text-ui-base font-bold text-foreground">Bạn chưa gắn phòng nào vào nhu cầu này.</h2>
        <p className="text-ui-sm leading-6 text-muted-foreground">
          Nhu cầu vẫn đầy đủ. Bạn có thể cùng người ở ghép tìm phòng sau, hoặc chọn một tin cụ thể để tiện trao đổi.
        </p>
      </Card>
    );
  }

  const listing = request.listing;
  const unavailable = request.signals.listingCurrentlyAvailable === false;

  if (!listing) {
    return (
      <Card className="rm-roommate-card-static space-y-3 border-warning/40 bg-warning/5">
        <p className="rm-roommate-section-label">Phòng đang cân nhắc</p>
        <h2 className="font-display text-ui-base font-bold text-foreground">
          Tin phòng đã liên kết không còn hiển thị.
        </h2>
        <p className="text-ui-sm leading-6 text-muted-foreground">
          RentMate giữ lại ngữ cảnh hiện có nhưng không thể tải chi tiết tin. Nếu nhu cầu còn mở, bạn có thể liên kết
          một phòng khác.
        </p>
        {onChangeListing ? (
          <Button variant="outline" onClick={onChangeListing}>
            <Icon name="refresh" className="h-4 w-4" /> Chọn phòng khác
          </Button>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="rm-roommate-card-static space-y-4" data-tone={unavailable ? "attention" : undefined}>
      <div className="grid gap-4 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(0,1.5fr)] sm:items-stretch">
        <div className="relative min-h-44 overflow-hidden rounded-card bg-surface-subtle sm:min-h-52">
          <MediaImage
            src={listing.coverImage.url}
            alt={listing.coverImage.altText ?? `Ảnh của ${listing.title}`}
            fill
            sizes="(max-width: 639px) 100vw, 320px"
            fallback={
              <div
                role="img"
                aria-label={`Ảnh của ${listing.title}`}
                className="grid h-full min-h-44 place-items-center text-muted-foreground"
              >
                <Icon name="home" className="h-9 w-9" />
              </div>
            }
          />
        </div>
        <div className="flex min-w-0 flex-col justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="rm-roommate-section-label">Phòng đang cân nhắc</p>
              {unavailable ? (
                <span className="rounded-full bg-warning/15 px-2.5 py-1 text-ui-xs font-bold text-warning-foreground">
                  Phòng không còn khả dụng
                </span>
              ) : null}
            </div>
            <h2 className="mt-1 break-words font-display text-heading-sm font-bold text-foreground">{listing.title}</h2>
            <p className="mt-2 flex items-center gap-1.5 text-ui-sm text-muted-foreground">
              <Icon name="pin" className="h-4 w-4 shrink-0" /> {formatAreaLabel(listing.areaName)}
            </p>
            <p className="mt-2 font-display text-ui-lg font-extrabold text-primary-hover">
              {formatRoommateMoney(listing.monthlyRent)} <span className="text-ui-sm font-semibold">/tháng</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-ui-xs font-semibold text-muted-foreground">
              <span className="rounded-full bg-surface-subtle px-2.5 py-1">
                {propertyTypeLabel(listing.propertyType)}
              </span>
              <span className="rounded-full bg-surface-subtle px-2.5 py-1">{formatAreaSqm(listing.roomAreaSqm)}</span>
              <span className="rounded-full bg-surface-subtle px-2.5 py-1">
                Tối đa {listing.maxOccupants ?? "—"} người
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!unavailable ? (
              <Link
                href={`/listings/${listing.id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-control border border-primary/30 bg-surface px-4 text-ui-sm font-bold text-primary-hover transition-colors hover:bg-primary-subtle"
              >
                <Icon name="arrowUpRight" className="h-4 w-4" /> Xem phòng
              </Link>
            ) : null}
            {onChangeListing ? (
              <Button variant="outline" onClick={onChangeListing}>
                <Icon name="refresh" className="h-4 w-4" /> Thay phòng
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <p className="rm-roommate-callout text-ui-sm leading-6 text-muted-foreground">
        {unavailable
          ? "Tin này không còn công khai. Thông tin hiện có được giữ lại làm bối cảnh; bạn có thể thay bằng phòng khác nếu nhu cầu vẫn mở."
          : "Phòng được liên kết chỉ làm bối cảnh trao đổi; thao tác này không giữ chỗ hay xác nhận thuê."}
      </p>
    </Card>
  );
}
