"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { SavedSearch } from "../../types/api";
import { savedSearchUrl } from "./saved-search-query";
import styles from "./saved-searches-page.module.css";

type PageStatus = "idle" | "loading" | "success" | "error";

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

function filterSummary(item: SavedSearch): readonly string[] {
  const query = item.query;
  const parts: string[] = [];
  if (query.q) parts.push(`Từ khóa: ${query.q}`);
  if (query.areaName) parts.push(query.areaName);
  if (query.minMonthlyRent !== null || query.maxMonthlyRent !== null) {
    parts.push(
      `${query.minMonthlyRent === null ? "Từ thấp nhất" : `Từ ${money.format(query.minMonthlyRent)}`} · ${query.maxMonthlyRent === null ? "không giới hạn" : `đến ${money.format(query.maxMonthlyRent)}`}`
    );
  }
  if (query.minRoomAreaSqm !== null || query.maxRoomAreaSqm !== null) {
    parts.push(`Diện tích ${query.minRoomAreaSqm ?? "…"}–${query.maxRoomAreaSqm ?? "…"} m²`);
  }
  if (query.propertyType) parts.push(`Loại: ${query.propertyType.replaceAll("_", " ")}`);
  if (query.amenities.length > 0) parts.push(`${query.amenities.length} tiện ích`);
  if (query.mode === "radius") parts.push(`Trong bán kính ${query.radiusKm} km`);
  if (query.mode === "bounds") parts.push("Theo vùng bản đồ");
  return parts.length > 0 ? parts : ["Tất cả tin đăng mới nhất"];
}

function errorMessage(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Trang này chỉ dành cho tài khoản người thuê.";
  if (error?.code === "NETWORK_ERROR") return "Không thể kết nối đến máy chủ. Vui lòng thử lại.";
  return "Chưa thể tải các bộ lọc đã lưu.";
}

export function SavedSearchesPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const tenant = authStatus === "authenticated" && user?.role === "TENANT";
  const [items, setItems] = useState<readonly SavedSearch[]>([]);
  const [status, setStatus] = useState<PageStatus>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorId, setActionErrorId] = useState<number | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    setStatus("loading");
    setError(null);
    return api.savedSearches
      .list({ page: 1, pageSize: 100 }, signal)
      .then((page) => {
        setItems(page.data);
        setStatus("success");
      })
      .catch((caught: unknown) => {
        if (signal?.aborted) return;
        setError(caught instanceof ApiError ? caught : null);
        setStatus("error");
      });
  }, []);

  useEffect(() => {
    if (!tenant) {
      setStatus("idle");
      setItems([]);
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, retryKey, tenant]);

  const update = async (id: number, body: { readonly name?: string | null; readonly isActive?: boolean }) => {
    setPendingId(id);
    setActionError(null);
    setActionErrorId(null);
    try {
      const updated = await api.savedSearches.update(id, body);
      setItems((current) => current.map((item) => (item.id === id ? updated : item)));
      setEditingId(null);
    } catch {
      setActionError("Chưa thể cập nhật bộ lọc. Vui lòng thử lại.");
      setActionErrorId(id);
    } finally {
      setPendingId(null);
    }
  };

  const remove = async (id: number) => {
    setPendingId(id);
    setActionError(null);
    setActionErrorId(null);
    try {
      await api.savedSearches.remove(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setConfirmDeleteId(null);
    } catch {
      setActionError("Chưa thể xóa bộ lọc. Vui lòng thử lại.");
      setActionErrorId(id);
    } finally {
      setPendingId(null);
    }
  };

  let content;
  if (authStatus === "loading") content = <LoadingState message="Đang kiểm tra tài khoản…" />;
  else if (authStatus === "anonymous")
    content = (
      <EmptyState
        title="Đăng nhập để quản lý bộ lọc"
        description="Lưu điều kiện tìm phòng và mở lại chỉ với một lần chọn."
        action={
          <Link className={styles.textLink} href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  else if (authStatus === "error")
    content = (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  else if (!tenant)
    content = (
      <EmptyState
        title="Trang này dành cho người thuê"
        description="Hãy dùng tài khoản người thuê để lưu và quản lý bộ lọc tìm phòng."
        action={
          <Link className={styles.textLink} href="/search">
            Tìm phòng
          </Link>
        }
      />
    );
  else if (status === "loading" || status === "idle") content = <LoadingState message="Đang tải bộ lọc đã lưu…" />;
  else if (status === "error")
    content = (
      <ErrorState
        message={errorMessage(error)}
        requestId={error?.requestId}
        action={<Button onClick={() => setRetryKey((key) => key + 1)}>Thử lại</Button>}
      />
    );
  else if (items.length === 0)
    content = (
      <EmptyState
        title="Bạn chưa lưu bộ lọc nào"
        description="Thiết lập khu vực, mức giá hoặc tiện ích trên trang tìm phòng rồi chọn “Lưu bộ lọc”."
        action={
          <Link className={styles.primaryLink} href="/search">
            <Icon name="search" className="h-4 w-4" /> Tạo bộ lọc đầu tiên
          </Link>
        }
      />
    );
  else
    content = (
      <div className={styles.grid}>
        {items.map((item, index) => (
          <article key={item.id} className={styles.card} style={{ "--card-index": index } as React.CSSProperties}>
            <div className={styles.cardTop}>
              <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
              <span className={item.isActive ? styles.activeBadge : styles.pausedBadge}>
                {item.isActive ? "Đang bật" : "Tạm dừng"}
              </span>
            </div>
            {editingId === item.id ? (
              <div className={styles.editRow}>
                <label htmlFor={`saved-search-${item.id}`}>Tên bộ lọc</label>
                <input
                  id={`saved-search-${item.id}`}
                  value={editingName}
                  maxLength={120}
                  onChange={(event) => setEditingName(event.target.value)}
                  placeholder="Không đặt tên"
                />
                <div>
                  <Button
                    pending={pendingId === item.id}
                    className="px-3"
                    onClick={() => void update(item.id, { name: editingName.trim() || null })}
                  >
                    Lưu tên
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingId(null)}>
                    Hủy
                  </Button>
                </div>
              </div>
            ) : (
              <h2>{item.name || `Bộ lọc #${item.id}`}</h2>
            )}
            <ul className={styles.filters}>
              {filterSummary(item).map((part) => (
                <li key={part}>{part}</li>
              ))}
            </ul>
            <p className={styles.updated}>
              Cập nhật{" "}
              {new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(
                new Date(item.updatedAt)
              )}
            </p>
            {actionError && actionErrorId === item.id && pendingId === null ? (
              <p role="alert" className={styles.actionError}>
                {actionError}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Link className={styles.runLink} href={savedSearchUrl(item.query)}>
                <Icon name="search" className="h-4 w-4" /> Chạy tìm kiếm
              </Link>
              <button
                type="button"
                onClick={() => {
                  setEditingId(item.id);
                  setEditingName(item.name ?? "");
                  setActionError(null);
                  setActionErrorId(null);
                }}
                disabled={pendingId === item.id}
              >
                Đổi tên
              </button>
              <button
                type="button"
                onClick={() => void update(item.id, { isActive: !item.isActive })}
                disabled={pendingId === item.id}
              >
                {item.isActive ? "Tạm dừng" : "Bật lại"}
              </button>
              {confirmDeleteId === item.id ? (
                <>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() => void remove(item.id)}
                    disabled={pendingId === item.id}
                  >
                    Xác nhận xóa
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteId(null)}>
                    Giữ lại
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => {
                    setConfirmDeleteId(item.id);
                    setActionError(null);
                    setActionErrorId(null);
                  }}
                >
                  Xóa
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    );

  return (
    <section aria-labelledby="saved-searches-heading" className={styles.page}>
      <header className={styles.header}>
        <span>
          <Icon name="sliders" className="h-4 w-4" /> Search library
        </span>
        <h1 id="saved-searches-heading">
          Bộ lọc <em>đã lưu</em>
        </h1>
        <p>
          Mở lại đúng nhu cầu tìm phòng của bạn. Tạm dừng bộ lọc khi chưa muốn nhận cập nhật trong các giai đoạn tiếp
          theo.
        </p>
        <Link className={styles.primaryLink} href="/search">
          <Icon name="plus" className="h-4 w-4" /> Tạo bộ lọc mới
        </Link>
      </header>
      <div className={styles.content}>{content}</div>
    </section>
  );
}
