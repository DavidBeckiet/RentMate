"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../components/ui/icon";
import workspace from "../auth/tenant-workspace.module.css";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, PublicListingSummary } from "../../types/api";
import { ListingCard } from "../listings/listing-card";
import { useFavoriteState } from "./favorite-state";
import { FavoriteRemoveControl } from "./favorite-remove-control";
import styles from "./favorites-page.module.css";

type FavoritesStatus = "idle" | "loading" | "success" | "error";

type FavoritesQuery =
  | { readonly ok: true; readonly page: number; readonly pageSize?: number }
  | { readonly ok: false; readonly message: string };

function scalar(params: URLSearchParams, key: string): string | undefined {
  const values = params.getAll(key);
  if (values.length > 1) throw new Error("duplicate");
  return values[0];
}

function positiveInteger(value: string | undefined, maximum?: number): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("invalid");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (maximum !== undefined && parsed > maximum)) throw new Error("invalid");
  return parsed;
}

function parseFavoritesQuery(params: URLSearchParams): FavoritesQuery {
  try {
    return {
      ok: true,
      page: positiveInteger(scalar(params, "page")) ?? 1,
      pageSize: positiveInteger(scalar(params, "pageSize"), 100)
    };
  } catch {
    return { ok: false, message: "Liên kết phân trang tin đã lưu không hợp lệ." };
  }
}

function favoritesUrl(page: number, pageSize?: number): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (pageSize !== undefined) params.set("pageSize", String(pageSize));
  const query = params.toString();
  return query ? `/favorites?${query}` : "/favorites";
}

function favoritesErrorMessage(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Trang tin đã lưu dành cho tài khoản người thuê.";
  if (error?.status === 422) return "Liên kết phân trang tin đã lưu không hợp lệ.";
  if (error?.code === "NETWORK_ERROR") return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.";
  return "Không thể tải tin đã lưu lúc này. Vui lòng thử lại.";
}

function PageHeader({ count }: { count?: number }) {
  return (
    <header className={styles.moodboardHeader}>
      <div className={styles.headerContent}>
        <div className="flex flex-wrap items-center gap-2">
          <p className={`${styles.eyebrow} inline-flex items-center gap-1.5`}>
            <Icon name="heart" className="h-4 w-4" /> Bộ sưu tập của bạn
          </p>
          {typeof count === "number" ? <span className={styles.countBadge}>{count} phòng trên trang này</span> : null}
        </div>
        <h1 id="favorites-heading">Tin đã lưu</h1>
        <p>Xem lại những căn phòng bạn yêu thích và tiếp tục tìm nơi phù hợp.</p>
      </div>
      <Link href="/search" className={workspace.link}>
        <Icon name="search" className="h-4 w-4" /> Khám phá thêm
      </Link>
    </header>
  );
}

export function FavoritesPage() {
  const { push, replace } = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const parsed = useMemo(() => parseFavoritesQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const requestedPage = parsed.ok ? parsed.page : 1;
  const requestedPageSize = parsed.ok ? parsed.pageSize : undefined;
  const queryIdentity = parsed.ok ? `${requestedPage}:${requestedPageSize ?? "default"}` : `invalid:${rawQuery}`;
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const { syncFromPage } = useFavoriteState({ autoLoad: false });
  const isTenant = authStatus === "authenticated" && user?.role === "TENANT";
  const [result, setResult] = useState<ApiPage<PublicListingSummary> | null>(null);
  const [status, setStatus] = useState<FavoritesStatus>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const requestIdentity = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const authRefreshAttempted = useRef(false);

  const startLoad = useCallback(
    (reason: "navigation" | "removal") => {
      requestController.current?.abort();
      const controller = new AbortController();
      const identity = ++requestIdentity.current;
      requestController.current = controller;
      setResult(null);
      setError(null);
      setStatus("loading");

      const query = {
        page: requestedPage,
        ...(requestedPageSize === undefined ? {} : { pageSize: requestedPageSize })
      };

      const promise = api.favorites
        .list(query, controller.signal)
        .then((page) => {
          if (controller.signal.aborted || identity !== requestIdentity.current) return;
          if (reason === "removal" && requestedPage > 1 && page.data.length === 0) {
            replace(favoritesUrl(requestedPage - 1, requestedPageSize));
            return;
          }
          syncFromPage(
            page.data.map((listing) => listing.id),
            requestedPage === 1 && !page.pagination.hasNextPage
          );
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
    [refresh, replace, requestedPage, requestedPageSize, syncFromPage]
  );

  useEffect(() => {
    if (!isTenant || !parsed.ok) {
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
  }, [isTenant, parsed.ok, queryIdentity, retryKey, startLoad]);

  const reconcileRemoval = useCallback(async () => {
    const request = startLoad("removal");
    await request.promise;
  }, [startLoad]);

  let content: ReactNode;
  if (authStatus === "loading") {
    content = <LoadingState message="Đang kiểm tra tài khoản…" />;
  } else if (!parsed.ok) {
    content = (
      <ErrorState
        message={parsed.message}
        action={<Button onClick={() => replace("/favorites")}>Đặt lại liên kết</Button>}
      />
    );
  } else if (authStatus === "anonymous") {
    content = (
      <EmptyState
        title="Đăng nhập để xem tin đã lưu"
        description="Danh sách này chỉ dành cho tài khoản người thuê đã đăng nhập."
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
        message="Không thể kiểm tra tài khoản lúc này. Vui lòng thử lại."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  } else if (!user || user.role !== "TENANT") {
    content = (
      <EmptyState
        title="Trang này dành cho tài khoản người thuê"
        description="Hãy dùng tài khoản người thuê để xem và quản lý các tin đã lưu."
        action={
          <Link className={styles.textLink} href="/">
            Khám phá tin đăng
          </Link>
        }
      />
    );
  } else if (status === "loading" || status === "idle") {
    content = <LoadingState message="Đang tải tin đã lưu…" />;
  } else if (status === "error") {
    content = (
      <ErrorState
        message={favoritesErrorMessage(error)}
        requestId={error?.requestId}
        action={<Button onClick={() => setRetryKey((key) => key + 1)}>Thử lại</Button>}
      />
    );
  } else if (result) {
    content = (
      <div className="space-y-6">
        {result.data.length === 0 ? (
          <EmptyState
            title="Hiện chưa có tin đã lưu nào đang công khai."
            description="Tin đã lưu có thể tạm thời không xuất hiện nếu không còn công khai."
            action={
              <Link className={styles.textLink} href="/">
                Khám phá tin đăng
              </Link>
            }
          />
        ) : (
          <div className={styles.listingGrid} aria-label="Tin đã lưu hiện đang công khai">
            {result.data.map((listing) => (
              <div key={listing.id} className={styles.listingItem}>
                <ListingCard
                  listing={listing}
                  favoriteSaved
                  onFavoriteChange={(saved) => (saved ? undefined : reconcileRemoval())}
                />
                <div className={styles.removeRow} aria-label={`Thao tác cho ${listing.title}`}>
                  <FavoriteRemoveControl listingId={listing.id} autoLoad={false} onRemoved={reconcileRemoval} />
                </div>
              </div>
            ))}
          </div>
        )}

        {result.pagination.page > 1 || result.pagination.hasNextPage ? (
          <Pagination
            ariaLabel="Phân trang tin đã lưu"
            compact
            className="w-fit max-w-full"
            page={result.pagination.page}
            hasNextPage={result.pagination.hasNextPage}
            onPrevious={() => push(favoritesUrl(result.pagination.page - 1, requestedPageSize))}
            onNext={() => push(favoritesUrl(result.pagination.page + 1, requestedPageSize))}
          />
        ) : null}
      </div>
    );
  }

  return (
    <section aria-labelledby="favorites-heading" className={workspace.page}>
      <PageHeader count={result?.data.length} />
      <p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
        <Icon name="eye" className="mt-1 h-4 w-4 shrink-0" /> Chỉ các tin đã lưu hiện đang công khai được hiển thị. Tin
        tạm ngừng công khai có thể không xuất hiện ở đây.
      </p>
      {content}
    </section>
  );
}
