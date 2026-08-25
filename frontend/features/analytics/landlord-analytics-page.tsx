"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AnalyticsDailyPoint, AnalyticsPeriod, LandlordAnalytics } from "../../types/api";

const periods: readonly { readonly value: AnalyticsPeriod; readonly label: string }[] = [
  { value: "7D", label: "7 ngày" },
  { value: "30D", label: "30 ngày" },
  { value: "90D", label: "90 ngày" }
];

function formatMinutes(value: number | null): string {
  if (value === null) return "Chưa có";
  if (value < 60) return `${value} phút`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours} giờ` : `${hours} giờ ${minutes} phút`;
}

function metric(label: string, value: string | number, description: string, accent: string) {
  return (
    <article className={`border-2 border-heroDark-950 p-5 shadow-glass-sm ${accent}`}>
      <p className="text-xs font-extrabold uppercase tracking-wider text-slate-700">{label}</p>
      <p className="mt-3 font-display text-4xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 text-xs font-bold leading-5 text-slate-600">{description}</p>
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
    <section
      className="border-2 border-heroDark-950 bg-white p-5 shadow-glass"
      aria-labelledby="analytics-trend-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="rm-eyebrow">XU HƯỚNG THEO NGÀY</span>
          <h2 id="analytics-trend-heading" className="mt-3 font-display text-2xl font-bold">
            Inquiry và phản hồi đầu tiên
          </h2>
        </div>
        <div className="flex flex-wrap gap-4 text-xs font-extrabold" aria-label="Chú giải biểu đồ">
          <span className="inline-flex items-center gap-2">
            <span className="h-1 w-8 bg-[#176b4d]" /> Inquiry mới
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-1 w-8 border-t-4 border-dashed border-[#d34b31]" /> Phản hồi đầu
          </span>
        </div>
      </div>
      <div className="mt-5 overflow-x-auto border-2 border-heroDark-950 bg-[#f4f1e8] p-3">
        <svg
          viewBox="0 0 880 250"
          className="min-w-[44rem]"
          role="img"
          aria-label="Biểu đồ inquiry mới và phản hồi đầu tiên theo ngày"
        >
          {[0, 1, 2, 3, 4].map((line) => (
            <line
              key={line}
              x1="24"
              x2="856"
              y1={20 + line * 45}
              y2={20 + line * 45}
              stroke="#092b27"
              strokeOpacity="0.16"
            />
          ))}
          <polyline
            fill="none"
            stroke="#176b4d"
            strokeWidth="6"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={linePoints(data, "inquiries", maximum)}
          />
          <polyline
            fill="none"
            stroke="#d34b31"
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
              className="fill-slate-700 text-[13px] font-bold"
            >
              {point
                ? new Date(`${point.date}T00:00:00Z`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })
                : ""}
            </text>
          ))}
        </svg>
      </div>
      <details className="mt-4 border-t-2 border-heroDark-950 pt-4">
        <summary className="cursor-pointer text-sm font-extrabold underline decoration-2 underline-offset-4 focus-visible:ring-4 focus-visible:ring-blue-300">
          Xem bảng dữ liệu biểu đồ
        </summary>
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="border-2 border-heroDark-950 bg-rent-accent p-2">Ngày</th>
                <th className="border-2 border-heroDark-950 bg-rent-accent p-2">Inquiry mới</th>
                <th className="border-2 border-heroDark-950 bg-rent-accent p-2">Phản hồi đầu</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.date}>
                  <th className="border-2 border-heroDark-950 p-2 font-bold">
                    {new Date(`${point.date}T00:00:00Z`).toLocaleDateString("vi-VN")}
                  </th>
                  <td className="border-2 border-heroDark-950 p-2">{point.inquiries}</td>
                  <td className="border-2 border-heroDark-950 p-2">{point.firstResponses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function LandlordAnalyticsPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const allowed = authStatus === "authenticated" && user?.role === "LANDLORD";
  const [period, setPeriod] = useState<AnalyticsPeriod>("30D");
  const [data, setData] = useState<LandlordAnalytics | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

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

  const topMaximum = useMemo(
    () =>
      Math.max(
        1,
        ...(data?.topListings.map(
          (item) => item.inquiries + item.views + item.favorites + item.callClicks + item.emailClicks
        ) ?? [])
      ),
    [data]
  );

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
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
    <section className="rm-workspace my-8 space-y-6" aria-labelledby="landlord-analytics-heading">
      <header className="border-2 border-heroDark-950 bg-[#e5eefc] p-6 shadow-glass sm:p-8">
        <span className="rm-eyebrow inline-flex items-center gap-2">
          <Icon name="target" className="h-4 w-4" /> HIỆU QUẢ LIÊN HỆ
        </span>
        <h1
          id="landlord-analytics-heading"
          className="mt-3 font-display text-4xl font-bold tracking-[-0.055em] sm:text-6xl"
        >
          Thống kê inquiry
        </h1>
        <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-700">
          Theo dõi tốc độ phản hồi và nhu cầu liên hệ dựa trên dữ liệu inquiry thực tế. Số liệu không đại diện cho hợp
          đồng thuê hoặc doanh thu.
        </p>
      </header>

      <nav
        className="flex flex-wrap items-center justify-between gap-3 border-2 border-heroDark-950 bg-white p-3 shadow-glass-sm"
        aria-label="Khoảng thời gian thống kê"
      >
        <div className="flex flex-wrap gap-2">
          {periods.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={period === item.value}
              onClick={() => setPeriod(item.value)}
              className="min-h-11 cursor-pointer border-2 border-heroDark-950 px-4 text-sm font-extrabold transition-colors hover:bg-rent-accent focus-visible:ring-4 focus-visible:ring-blue-300 aria-pressed:bg-rent-coral"
            >
              {item.label}
            </button>
          ))}
        </div>
        {data ? (
          <time className="text-xs font-bold text-slate-600">
            Đo lúc {new Date(data.measuredAt).toLocaleString("vi-VN")}
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
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metric("Inquiry mới", data.inquiries, `${data.uniqueTenants} người thuê duy nhất`, "bg-rent-accent")}
            {metric(
              "Tỷ lệ phản hồi",
              `${data.responseRate}%`,
              `${data.respondedInquiries}/${data.inquiries} inquiry có phản hồi`,
              "bg-[#c9f269]"
            )}
            {metric(
              "Phản hồi trong 24 giờ",
              `${data.responseWithin24HoursRate}%`,
              `${data.respondedWithin24Hours} inquiry đạt mốc`,
              "bg-rent-coral"
            )}
            {metric(
              "Phản hồi đầu trung bình",
              formatMinutes(data.averageFirstResponseMinutes),
              `${data.closedInquiries} inquiry đã đóng`,
              "bg-white"
            )}
          </div>

          <section aria-label="Hành vi trên tin đăng" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metric("Lượt xem", data.views, "Tổng lượt mở tin đăng", "bg-white")}
            {metric("Lượt lưu", data.favorites, "Lần người thuê lưu tin", "bg-rent-accent")}
            {metric("Bấm gọi", data.callClicks, "Lần bấm số điện thoại", "bg-rent-coral")}
            {metric("Bấm email", data.emailClicks, "Lần mở email liên hệ", "bg-[#e5eefc]")}
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
            <TrendChart data={data.daily} />
            <aside className="space-y-4">
              <section className="border-2 border-heroDark-950 bg-rent-coral p-5 shadow-glass">
                <span className="rm-eyebrow">CẦN LÀM NGAY</span>
                <p className="mt-3 font-display text-5xl font-bold">{data.needsReplyNow}</p>
                <p className="mt-2 text-sm font-bold leading-6">Inquiry đang mở có tin cuối từ người thuê.</p>
                <Link
                  href="/landlord/leads"
                  className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 border-2 border-heroDark-950 bg-white px-4 py-2 text-sm font-extrabold shadow-glass-sm transition-colors hover:bg-rent-accent focus-visible:ring-4 focus-visible:ring-blue-300"
                >
                  Mở hàng đợi lead <Icon name="arrow" className="h-4 w-4" />
                </Link>
              </section>
              <section
                className="border-2 border-heroDark-950 bg-white p-5 shadow-glass"
                aria-labelledby="top-listings-heading"
              >
                <h2 id="top-listings-heading" className="font-display text-xl font-bold">
                  Tin có nhiều inquiry
                </h2>
                {data.topListings.length === 0 ? (
                  <p className="mt-3 text-sm font-medium text-slate-600">Chưa có inquiry trong khoảng này.</p>
                ) : (
                  <ol className="mt-4 space-y-4">
                    {data.topListings.map((item) => (
                      <li key={item.listingId}>
                        <div className="flex justify-between gap-3 text-sm font-extrabold">
                          <span>Tin #{item.listingId}</span>
                          <span>
                            {item.inquiries + item.views + item.favorites + item.callClicks + item.emailClicks}
                          </span>
                        </div>
                        <div className="mt-2 h-3 border-2 border-heroDark-950 bg-[#f4f1e8]">
                          <span
                            className="block h-full bg-[#176b4d]"
                            style={{
                              width: `${((item.inquiries + item.views + item.favorites + item.callClicks + item.emailClicks) / topMaximum) * 100}%`
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </aside>
          </div>

          <p className="border-2 border-heroDark-950 bg-white p-4 text-xs font-bold leading-5 text-slate-600">
            Lượt xem được ghi nhận khi người dùng mở chi tiết tin; lượt gọi, email và lưu tin là số lần tương tác được
            ghi nhận trong khoảng thời gian đã chọn, không phải số hợp đồng thuê.
          </p>
        </>
      ) : null}
    </section>
  );
}
