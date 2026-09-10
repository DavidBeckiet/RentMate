"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import workspace from "../auth/tenant-workspace.module.css";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, SavedSearch } from "../../types/api";
import {
  parseSavedSearchPageQuery,
  savedSearchPageUrl,
  savedSearchUrl,
  SAVED_SEARCH_PAGE_SIZE
} from "./saved-search-query";
import { savedSearchCriteria, savedSearchTitle } from "./saved-search-presentation";
import styles from "./saved-searches-page.module.css";

type PageStatus = "idle" | "loading" | "success" | "error";
type LoadReason = "navigation" | "removal";

function errorMessage(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Trang này chỉ dành cho tài khoản người thuê.";
  if (error?.status === 422) return "Liên kết phân trang tìm kiếm đã lưu không hợp lệ.";
  if (error?.code === "NETWORK_ERROR") return "Không thể kết nối đến máy chủ. Vui lòng thử lại.";
  return "Chưa thể tải các tìm kiếm đã lưu.";
}

export function SavedSearchesPage() {
  const { push, replace } = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const parsedQuery = useMemo(() => parseSavedSearchPageQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const requestedPage = parsedQuery.ok ? parsedQuery.page : 1;
  const queryIdentity = parsedQuery.ok ? String(requestedPage) : `invalid:${rawQuery}`;
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const tenant = authStatus === "authenticated" && user?.role === "TENANT";
  const [result, setResult] = useState<ApiPage<SavedSearch> | null>(null);
  const [status, setStatus] = useState<PageStatus>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorId, setActionErrorId] = useState<number | null>(null);
  const requestIdentity = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const authRefreshAttempted = useRef(false);

  const startLoad = useCallback(
    (reason: LoadReason) => {
      requestController.current?.abort();
      const controller = new AbortController();
      const identity = ++requestIdentity.current;
      requestController.current = controller;
      setResult(null);
      setError(null);
      setStatus("loading");

      const promise = api.savedSearches
        .list({ page: requestedPage, pageSize: SAVED_SEARCH_PAGE_SIZE }, controller.signal)
        .then((page) => {
          if (controller.signal.aborted || identity !== requestIdentity.current) return;
          if (reason === "removal" && requestedPage > 1 && page.data.length === 0) {
            replace(savedSearchPageUrl(requestedPage - 1));
            return;
          }
          setResult(page);
          setStatus("success");
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted || identity !== requestIdentity.current) return;
          const apiError = caught instanceof ApiError ? caught : null;
          setError(apiError);
          setStatus("error");
          if (apiError?.status === 401 && !authRefreshAttempted.current) {
            authRefreshAttempted.current = true;
            void refresh().catch(() => undefined);
          }
        });

      return { controller, promise };
    },
    [refresh, replace, requestedPage]
  );

  useEffect(() => {
    if (!tenant || !parsedQuery.ok) {
      ++requestIdentity.current;
      requestController.current?.abort();
      requestController.current = null;
      setResult(null);
      setError(null);
      setStatus("idle");
      return;
    }

    const request = startLoad("navigation");
    return () => request.controller.abort();
  }, [parsedQuery.ok, queryIdentity, retryKey, startLoad, tenant]);

  const update = async (id: number, body: { readonly name?: string | null; readonly isActive?: boolean }) => {
    setPendingId(id);
    setActionError(null);
    setActionErrorId(null);
    try {
      const updated = await api.savedSearches.update(id, body);
      setResult((current) =>
        current ? { ...current, data: current.data.map((item) => (item.id === id ? updated : item)) } : current
      );
      setEditingId(null);
    } catch {
      setActionError("Chưa thể cập nhật tìm kiếm. Vui lòng thử lại.");
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
      setConfirmDeleteId(null);
      const request = startLoad("removal");
      await request.promise;
    } catch {
      setActionError("Chưa thể xóa tìm kiếm. Vui lòng thử lại.");
      setActionErrorId(id);
    } finally {
      setPendingId(null);
    }
  };

  let content: ReactNode;
  if (authStatus === "loading") {
    content = <LoadingState message="Đang kiểm tra tài khoản…" />;
  } else if (!parsedQuery.ok) {
    content = (
      <ErrorState
        message={parsedQuery.message}
        action={<Button onClick={() => replace("/saved-searches")}>Đặt lại liên kết</Button>}
      />
    );
  } else if (authStatus === "anonymous") {
    content = (
      <EmptyState
        title="Đăng nhập để quản lý tìm kiếm"
        description="Lưu điều kiện tìm phòng và mở lại chỉ với một lần chọn."
        action={
          <Link className={styles.textLink} href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  } else if (authStatus === "error") {
    content = (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  } else if (!tenant) {
    content = (
      <EmptyState
        title="Trang này dành cho người thuê"
        description="Hãy dùng tài khoản người thuê để lưu và quản lý nhu cầu tìm phòng."
        action={
          <Link className={styles.textLink} href="/search">
            Tìm phòng
          </Link>
        }
      />
    );
  } else if (status === "loading" || status === "idle") {
    content = <LoadingState message="Đang tải tìm kiếm đã lưu…" />;
  } else if (status === "error") {
    content = (
      <ErrorState
        message={errorMessage(error)}
        requestId={error?.requestId}
        action={<Button onClick={() => setRetryKey((key) => key + 1)}>Thử lại</Button>}
      />
    );
  } else if (result && result.data.length === 0) {
    content = (
      <EmptyState
        title="Bạn chưa lưu tìm kiếm nào"
        description="Thiết lập khu vực, mức giá hoặc tiện ích trên trang tìm phòng rồi chọn “Lưu bộ lọc”."
        action={
          <Link className={styles.primaryLink} href="/search">
            <Icon name="search" className="h-4 w-4" /> Tìm phòng
          </Link>
        }
      />
    );
  } else if (result) {
    content = (
      <div className={styles.resultsStack}>
        <div className={styles.grid}>
          {result.data.map((item, index) => (
            <article key={item.id} className={styles.card} style={{ "--card-index": index } as CSSProperties}>
              <div className={styles.cardTop}>
                <span className={styles.number} aria-hidden="true">
                  <Icon name="sliders" className="h-5 w-5" />
                </span>
                <span className={item.isActive ? styles.activeBadge : styles.pausedBadge}>
                  {item.isActive ? "Đang bật" : "Tạm dừng"}
                </span>
              </div>
              {editingId === item.id ? (
                <div className={styles.editRow}>
                  <label htmlFor={`saved-search-${item.id}`}>Tên tìm kiếm</label>
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
                <h2>{savedSearchTitle(item)}</h2>
              )}
              <ul className={styles.filters} aria-label="Tiêu chí tìm kiếm">
                {savedSearchCriteria(item.query).map((part) => (
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
                  <Icon name="search" className="h-4 w-4" /> Áp dụng tìm kiếm
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
        {result.pagination.page > 1 || result.pagination.hasNextPage ? (
          <Pagination
            ariaLabel="Phân trang tìm kiếm đã lưu"
            compact
            className="w-fit max-w-full"
            page={result.pagination.page}
            hasNextPage={result.pagination.hasNextPage}
            onPrevious={() => push(savedSearchPageUrl(result.pagination.page - 1))}
            onNext={() => push(savedSearchPageUrl(result.pagination.page + 1))}
          />
        ) : null}
      </div>
    );
  } else {
    content = null;
  }

  return (
    <section aria-labelledby="saved-searches-heading" className={workspace.page}>
      <header className={workspace.header}>
        <div>
          <span className="rm-workspace-eyebrow inline-flex items-center gap-2">
            <Icon name="sliders" className="h-4 w-4" /> Nhu cầu đã lưu
          </span>
          <h1 id="saved-searches-heading">Tìm kiếm đã lưu</h1>
          <p>Giữ lại đúng tiêu chí tìm phòng của bạn và mở lại bất cứ lúc nào.</p>
        </div>
        <Link className={workspace.link} href="/search">
          <Icon name="plus" className="h-4 w-4" /> Tạo tìm kiếm mới
        </Link>
      </header>
      <div>{content}</div>
    </section>
  );
}
