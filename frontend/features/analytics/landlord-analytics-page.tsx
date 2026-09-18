"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
import { BusinessStatusBadge } from "../../components/ui/status-badge";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AnalyticsDailyPoint, AnalyticsPeriod, LandlordAnalytics, OwnerListingSummary } from "../../types/api";
import styles from "./landlord-analytics-page.module.css";

const periods: readonly { readonly value: AnalyticsPeriod; readonly label: string; readonly days: number }[] = [
  { value: "7D", label: "7 ngày", days: 7 },
  { value: "30D", label: "30 ngày", days: 30 },
  { value: "90D", label: "90 ngày", days: 90 }
];

function formatMinutes(value: number | null): string {
  if (value === null) return "Chưa có";
  if (value < 60) return `${value} phút`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours} giờ` : `${hours} giờ ${minutes} phút`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1_000) / 10;
}

function comparison(
  current: number,
  previous: number
): { readonly label: string; readonly tone: "up" | "down" | "flat" } {
  if (previous === 0) {
    return current === 0
      ? { label: "Không đổi so với kỳ trước", tone: "flat" }
      : { label: "Có dữ liệu mới", tone: "up" };
  }
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return { label: "Không đổi so với kỳ trước", tone: "flat" };
  return { label: `${change > 0 ? "+" : ""}${change}% so với kỳ trước`, tone: change > 0 ? "up" : "down" };
}

async function loadOwnerListings(signal: AbortSignal): Promise<readonly OwnerListingSummary[]> {
  const listings: OwnerListingSummary[] = [];
  for (let pageNumber = 1; !signal.aborted; pageNumber += 1) {
    const page = await api.listings.listOwned({ page: pageNumber, pageSize: 100 }, signal);
    if (signal.aborted) return [];
    listings.push(...page.data);
    if (!page.pagination.hasNextPage || page.data.length === 0) return listings;
  }
  return listings;
}

function MetricCard({
  icon,
  label,
  value,
  description,
  change,
  tone
}: Readonly<{
  icon: "eye" | "message" | "refresh";
  label: string;
  value: string;
  description: string;
  change?: ReturnType<typeof comparison>;
  tone: "green" | "blue" | "amber";
}>) {
  return (
    <article className={styles.metric} data-tone={tone}>
      <div className={styles.metricTop}>
        <span className={styles.metricIcon}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
        {change ? (
          <span className={styles.change} data-tone={change.tone}>
            {change.tone === "up" ? <Icon name="arrowUpRight" className="h-3.5 w-3.5" /> : null}
            {change.label}
          </span>
        ) : null}
      </div>
      <p className={styles.metricLabel}>{label}</p>
      <p className={styles.metricValue}>{value}</p>
      <p className={styles.metricDescription}>{description}</p>
    </article>
  );
}

function linePoints(data: readonly AnalyticsDailyPoint[], key: "inquiries" | "firstResponses", maximum: number) {
  const width = 880;
  const height = 220;
  const xPadding = 24;
  const yPadding = 20;
  return data
    .map((point, index) => {
      const x = data.length <= 1 ? width / 2 : xPadding + (index / (data.length - 1)) * (width - xPadding * 2);
      const y = height - yPadding - (point[key] / maximum) * (height - yPadding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function TrendChart({ data }: Readonly<{ data: readonly AnalyticsDailyPoint[] }>) {
  const maximum = Math.max(1, ...data.flatMap((point) => [point.inquiries, point.firstResponses]));
  const labels = data.length === 0 ? [] : [data[0], data[Math.floor((data.length - 1) / 2)], data[data.length - 1]];
  return (
    <section className={styles.panel} aria-labelledby="analytics-trend-heading">
      <header className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Xu hướng theo ngày</span>
          <h2 id="analytics-trend-heading">Yêu cầu và phản hồi theo ngày</h2>
          <p>Theo dõi số yêu cầu mới cùng số yêu cầu được phản hồi đầu tiên mỗi ngày.</p>
        </div>
        <div className={styles.legend} aria-label="Chú giải biểu đồ">
          <span>
            <i data-series="inquiry" /> Yêu cầu mới
          </span>
          <span>
            <i data-series="response" /> Phản hồi đầu
          </span>
        </div>
      </header>
      <div className={styles.chartFrame}>
        {data.length === 0 ? <p className={styles.chartEmpty}>Chưa đủ dữ liệu để hiển thị xu hướng.</p> : null}
        {data.length > 0 ? (
          <svg viewBox="0 0 880 250" role="img" aria-label="Biểu đồ yêu cầu mới và phản hồi đầu tiên theo ngày">
            {[0, 1, 2, 3, 4].map((line) => (
              <line
                key={line}
                x1="24"
                x2="856"
                y1={20 + line * 45}
                y2={20 + line * 45}
                stroke="currentColor"
                strokeOpacity="0.1"
              />
            ))}
            <polyline
              fill="none"
              stroke="#087a5b"
              strokeWidth="6"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={linePoints(data, "inquiries", maximum)}
            />
            <polyline
              fill="none"
              stroke="#d97706"
              strokeWidth="5"
              strokeDasharray="12 9"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={linePoints(data, "firstResponses", maximum)}
            />
            {labels.map((point, index) => (
              <text
                key={`${point?.date}-${index}`}
                x={index === 0 ? 24 : index === 1 ? 440 : 856}
                y="244"
                textAnchor={index === 0 ? "start" : index === 1 ? "middle" : "end"}
                className={styles.chartLabel}
              >
                {point
                  ? new Date(`${point.date}T00:00:00+07:00`).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit"
                    })
                  : ""}
              </text>
            ))}
          </svg>
        ) : null}
      </div>
      <details className={styles.dataDetails}>
        <summary>Xem bảng dữ liệu</summary>
        <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Yêu cầu mới</th>
                <th>Phản hồi đầu</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.date}>
                  <th>{new Date(`${point.date}T00:00:00+07:00`).toLocaleDateString("vi-VN")}</th>
                  <td>{point.inquiries}</td>
                  <td>{point.firstResponses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function PerformanceTable({
  data,
  listings
}: Readonly<{ data: LandlordAnalytics; listings: ReadonlyMap<number, OwnerListingSummary> }>) {
  return (
    <section className={styles.panel} aria-labelledby="listing-performance-heading">
      <header className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Hiệu quả từng tin</span>
          <h2 id="listing-performance-heading">Tin nào đang tạo ra cơ hội?</h2>
          <p>So sánh lượt xem, lượt lưu và số yêu cầu để biết tin nào đang được quan tâm.</p>
        </div>
        <Link href="/landlord" className={styles.textLink}>
          Quản lý tin cho thuê <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </header>
      {data.topListings.length === 0 ? (
        <div className={styles.performanceEmpty}>
          <span>
            <Icon name="chart" className="h-6 w-6" />
          </span>
          <strong>Chưa có tương tác trong khoảng này</strong>
          <p>Khi tin bắt đầu có lượt xem hoặc yêu cầu, hiệu quả từng tin sẽ xuất hiện ở đây.</p>
        </div>
      ) : (
        <div className={styles.performanceList}>
          <div className={styles.performanceHead} aria-hidden="true">
            <span>Tin cho thuê</span>
            <span>Lượt xem</span>
            <span>Lượt lưu</span>
            <span>Yêu cầu</span>
            <span>Tỷ lệ liên hệ</span>
            <span />
          </div>
          {data.topListings.map((item, index) => {
            const listing = listings.get(item.listingId);
            const directActions = item.callClicks + item.emailClicks;
            return (
              <article className={styles.performanceRow} key={item.listingId}>
                <div className={styles.listingIdentity}>
                  <span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span>
                  <div className={styles.listingThumb}>
                    {listing?.coverImage ? (
                      <MediaImage
                        src={listing.coverImage.url}
                        alt={listing.coverImage.altText ?? listing.title ?? `Tin ${listing.id}`}
                        fill
                        sizes="64px"
                      />
                    ) : (
                      <Icon name="home" className="h-5 w-5" />
                    )}
                  </div>
                  <div className={styles.listingCopy}>
                    <strong>{listing?.title ?? `Tin #${item.listingId}`}</strong>
                    <span>
                      {listing?.areaName ?? `Mã tin ${item.listingId}`}
                      {listing ? <BusinessStatusBadge status={listing.businessStatus} /> : null}
                    </span>
                  </div>
                </div>
                <div className={styles.performanceValue} data-label="Lượt xem">
                  <Icon name="eye" className="h-4 w-4" />
                  <strong>{formatNumber(item.views)}</strong>
                </div>
                <div className={styles.performanceValue} data-label="Lượt lưu">
                  <Icon name="heart" className="h-4 w-4" />
                  <strong>{formatNumber(item.favorites)}</strong>
                </div>
                <div className={styles.performanceValue} data-label="Yêu cầu">
                  <Icon name="message" className="h-4 w-4" />
                  <span className={styles.performancePrimary}>
                    <strong>{formatNumber(item.inquiries)}</strong>
                    {directActions > 0 ? (
                      <small>
                        {item.callClicks} gọi · {item.emailClicks} email
                      </small>
                    ) : null}
                  </span>
                </div>
                <div className={styles.conversionValue} data-label="Tỷ lệ liên hệ">
                  <strong>{rate(item.inquiries, item.views)}%</strong>
                  <span>
                    <i style={{ width: `${Math.min(100, rate(item.inquiries, item.views))}%` }} />
                  </span>
                </div>
                <Link href={`/landlord/listings/${item.listingId}`} className={styles.rowAction}>
                  Mở tin <Icon name="arrow" className="h-4 w-4" />
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function LandlordAnalyticsPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const [mounted, setMounted] = useState(false);
  const allowed = mounted && authStatus === "authenticated" && user?.role === "LANDLORD";
  const [period, setPeriod] = useState<AnalyticsPeriod>("30D");
  const [data, setData] = useState<LandlordAnalytics | null>(null);
  const [ownerListings, setOwnerListings] = useState<readonly OwnerListingSummary[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    void loadOwnerListings(controller.signal)
      .then((listings) => {
        if (!controller.signal.aborted) setOwnerListings(listings);
      })
      .catch(() => {
        if (!controller.signal.aborted) setOwnerListings([]);
      });
    return () => controller.abort();
  }, [allowed]);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    void api.analytics
      .getLandlord(period, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setStatus("success");
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof ApiError ? caught : null);
          setStatus("error");
        }
      });
    return () => controller.abort();
  }, [allowed, period, retryKey]);

  const listingsById = useMemo(
    () => new Map(ownerListings.map((listing) => [listing.id, listing] as const)),
    [ownerListings]
  );
  const selectedPeriod = periods.find((item) => item.value === period) ?? periods[1];

  if (!mounted || authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous")
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản chủ trọ."
        action={
          <Link className="font-bold underline" href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  if (authStatus === "error")
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  if (!allowed) return <ErrorState message="Trang này dành cho tài khoản chủ trọ." />;

  return (
    <section className={styles.analytics} aria-labelledby="landlord-analytics-heading">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.heroBadge}>
            <Icon name="chart" className="h-4 w-4" /> Trung tâm hiệu quả
          </span>
          <h1 id="landlord-analytics-heading">Phân tích hoạt động cho thuê</h1>
          <p>Theo dõi lượt xem, yêu cầu và hiệu quả từng tin để biết việc nào cần xử lý trước.</p>
        </div>
        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.miniChart}>
            <span style={{ height: "35%" }} />
            <span style={{ height: "52%" }} />
            <span style={{ height: "44%" }} />
            <span style={{ height: "76%" }} />
            <span style={{ height: "62%" }} />
            <span style={{ height: "92%" }} />
          </div>
          <div className={styles.heroPulse}>
            <Icon name="arrowUpRight" className="h-4 w-4" />
            <span>
              <strong>Dễ xem, dễ xử lý</strong>
              <small>Chỉ giữ số liệu cần thiết</small>
            </span>
          </div>
        </div>
      </header>

      <nav className={styles.periodBar} aria-label="Khoảng thời gian thống kê">
        <div>
          <span>Xem dữ liệu trong</span>
          <div className={styles.periods}>
            {periods.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={period === item.value}
                onClick={() => setPeriod(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {data ? (
          <time>
            <Icon name="refresh" className="h-3.5 w-3.5" /> Cập nhật {new Date(data.measuredAt).toLocaleString("vi-VN")}
          </time>
        ) : null}
      </nav>

      {status === "loading" || status === "idle" ? <LoadingState message="Đang tổng hợp số liệu…" /> : null}
      {status === "error" ? (
        <ErrorState
          message={error?.status === 401 ? "Phiên đăng nhập đã hết hạn." : "Không thể tải thống kê lúc này."}
          requestId={error?.requestId}
          action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}

      {status === "success" && data ? (
        <div className={styles.dashboard}>
          <section
            className={styles.attentionCard}
            data-tone={data.needsReplyNow > 0 ? "warning" : "success"}
            aria-label="Việc cần xử lý hiện tại"
          >
            <div className={styles.attentionIcon}>
              <Icon name={data.needsReplyNow > 0 ? "bell" : "check"} className="h-6 w-6" />
            </div>
            <div>
              <span>Hiện tại · không phụ thuộc {selectedPeriod.days} ngày</span>
              <strong>
                {data.needsReplyNow > 0
                  ? `${data.needsReplyNow} yêu cầu đang chờ phản hồi`
                  : "Bạn đã xử lý hết yêu cầu mới"}
              </strong>
              <p>
                {data.needsReplyNow > 0
                  ? "Tin nhắn cuối đến từ người thuê. Phản hồi sớm để giữ cơ hội liên hệ."
                  : "Hộp khách quan tâm hiện không có yêu cầu nào cần trả lời ngay."}
              </p>
            </div>
            <Link href="/landlord/leads">
              {data.needsReplyNow > 0 ? "Xử lý ngay" : "Xem khách quan tâm"}
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </section>

          <section className={styles.metrics} aria-label="Tổng quan hiệu quả">
            <MetricCard
              icon="eye"
              label="Lượt xem tin"
              value={formatNumber(data.views)}
              description="Tổng lượt mở chi tiết tin đăng"
              change={data.previousPeriod ? comparison(data.views, data.previousPeriod.views) : undefined}
              tone="blue"
            />
            <MetricCard
              icon="message"
              label="Yêu cầu mới"
              value={formatNumber(data.inquiries)}
              description={`${data.uniqueTenants} người thuê khác nhau`}
              change={data.previousPeriod ? comparison(data.inquiries, data.previousPeriod.inquiries) : undefined}
              tone="green"
            />
            <MetricCard
              icon="refresh"
              label="Phản hồi đầu trung bình"
              value={formatMinutes(data.averageFirstResponseMinutes)}
              description={
                data.respondedInquiries > 0
                  ? `Dựa trên ${data.respondedInquiries} yêu cầu đã phản hồi`
                  : "Chưa có yêu cầu được phản hồi trong kỳ"
              }
              tone="amber"
            />
          </section>

          <TrendChart data={data.daily} />
          <PerformanceTable data={data} listings={listingsById} />
          <p className={styles.disclaimer}>
            <Icon name="info" className="h-4 w-4" /> Lượt xem được ghi nhận khi mở chi tiết tin; lượt gọi, email và lưu
            tin là số lần thao tác trong khoảng đã chọn. Số liệu hỗ trợ đánh giá mức độ quan tâm, không đại diện cho hợp
            đồng hoặc doanh thu.
          </p>
        </div>
      ) : null}
    </section>
  );
}
