"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import type { ApiPage, ListingStatus, ModerationHistoryItem } from "../../types/api";
import { appendAdminListingReturnQuery } from "./admin-listing-query";
import styles from "./admin-listing-detail.module.css";

export interface HistoryRefreshInstruction {
  readonly token: number;
  readonly page?: number;
  readonly resolve?: (succeeded: boolean) => void;
}

interface HistoryQuery {
  readonly page: number;
  readonly pageSize?: number;
}

function parseHistoryQuery(parameters: URLSearchParams): HistoryQuery | null {
  const read = (key: string, maximum?: number) => {
    const values = parameters.getAll(key);
    if (values.length > 1) throw new Error("duplicate");
    if (values.length === 0) return undefined;
    if (!/^[1-9][0-9]*$/.test(values[0] ?? "")) throw new Error("invalid");
    const value = Number(values[0]);
    if (!Number.isSafeInteger(value) || (maximum !== undefined && value > maximum)) throw new Error("invalid");
    return value;
  };
  try {
    const pageSize = read("historyPageSize", 100);
    return { page: read("historyPage") ?? 1, ...(pageSize === undefined ? {} : { pageSize }) };
  } catch {
    return null;
  }
}

const statusLabels: Record<ListingStatus, string> = {
  DRAFT: "Bản nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị từ chối",
  HIDDEN: "Đã ẩn",
  INACTIVE: "Ngừng hoạt động"
};

function historyUrl(listingId: number, query: HistoryQuery, currentParameters: URLSearchParams): string {
  const parameters = new URLSearchParams();
  appendAdminListingReturnQuery(parameters, currentParameters);
  if (query.page > 1) parameters.set("historyPage", String(query.page));
  if (query.pageSize !== undefined) parameters.set("historyPageSize", String(query.pageSize));
  const suffix = parameters.toString();
  return `/admin/listings/${listingId}${suffix ? `?${suffix}` : ""}`;
}

type HistoryState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "success"; readonly result: ApiPage<ModerationHistoryItem> }
  | { readonly status: "error"; readonly error: ApiError | null };

export function ModerationHistory({
  listingId,
  refreshInstruction
}: {
  readonly listingId: number;
  readonly refreshInstruction?: HistoryRefreshInstruction;
}) {
  const router = useRouter();
  const replace = router.replace;
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const parsed = useMemo(() => parseHistoryQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const [state, setState] = useState<HistoryState>({ status: "idle" });
  const [retryVersion, setRetryVersion] = useState(0);
  const requestId = useRef(0);
  const consumedInstruction = useRef(0);
  const pendingRefresh = useRef<((succeeded: boolean) => void) | null>(null);
  const queryIdentity = parsed ? JSON.stringify(parsed) : "invalid";

  useEffect(() => {
    if (!parsed) return;
    const instructedPage =
      refreshInstruction && refreshInstruction.token > consumedInstruction.current
        ? refreshInstruction.page
        : undefined;
    if (refreshInstruction && refreshInstruction.token > consumedInstruction.current) {
      consumedInstruction.current = refreshInstruction.token;
      pendingRefresh.current = refreshInstruction.resolve ?? null;
      if (instructedPage !== undefined && instructedPage !== parsed.page) {
        replace(historyUrl(listingId, { ...parsed, page: instructedPage }, new URLSearchParams(rawQuery)));
        return;
      }
    }
    const query = { ...parsed, ...(instructedPage === undefined ? {} : { page: instructedPage }) };
    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    setState({ status: "loading" });
    void api.admin
      .listHistory(listingId, query, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && currentRequest === requestId.current) {
          setState({ status: "success", result });
          pendingRefresh.current?.(true);
          pendingRefresh.current = null;
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && currentRequest === requestId.current) {
          setState({ status: "error", error: error instanceof ApiError ? error : null });
          pendingRefresh.current?.(false);
          pendingRefresh.current = null;
        }
      });
    return () => controller.abort();
  }, [listingId, parsed, queryIdentity, rawQuery, refreshInstruction, retryVersion, replace]);

  if (!parsed) return <ErrorState message="Liên kết lịch sử kiểm duyệt không hợp lệ." />;
  return (
    <section aria-labelledby="moderation-history-heading" className={styles.historySection}>
      <header className={styles.historyHeader}>
        <p className={styles.sectionKicker}>Dấu vết quyết định</p>
        <h2 id="moderation-history-heading" className={styles.sectionTitle}>
          Lịch sử kiểm duyệt
        </h2>
      </header>
      {state.status === "idle" || state.status === "loading" ? (
        <LoadingState message="Đang tải lịch sử kiểm duyệt…" />
      ) : null}
      {state.status === "error" ? (
        <ErrorState
          message="Không thể tải lịch sử kiểm duyệt."
          requestId={state.error?.requestId}
          action={<Button onClick={() => setRetryVersion((value) => value + 1)}>Thử lại lịch sử</Button>}
        />
      ) : null}
      {state.status === "success" && state.result.data.length === 0 ? (
        <EmptyState title="Chưa có lịch sử kiểm duyệt" />
      ) : null}
      {state.status === "success" && state.result.data.length > 0 ? (
        <ol className={styles.historyList}>
          {state.result.data.map((item) => (
            <li key={item.id} className={styles.historyItem}>
              <p className={styles.historyTransition}>
                <span className={styles.historyStatusFrom}>{statusLabels[item.previousStatus]}</span>
                <Icon name="arrow" className={styles.historyArrow} />
                <span className={styles.historyStatusTo}>{statusLabels[item.newStatus]}</span>
              </p>
              <p className={styles.historyMeta}>
                Quản trị viên #{item.adminId} · {new Date(item.createdAt).toLocaleString("vi-VN")}
              </p>
              {item.reason ? <p className={styles.historyReason}>{item.reason}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {state.status === "success" && (state.result.pagination.page > 1 || state.result.pagination.hasNextPage) ? (
        <Pagination
          ariaLabel="Phân trang lịch sử kiểm duyệt"
          page={state.result.pagination.page}
          hasNextPage={state.result.pagination.hasNextPage}
          onPrevious={() =>
            router.push(
              historyUrl(
                listingId,
                { ...parsed, page: state.result.pagination.page - 1 },
                new URLSearchParams(rawQuery)
              )
            )
          }
          onNext={() =>
            router.push(
              historyUrl(
                listingId,
                { ...parsed, page: state.result.pagination.page + 1 },
                new URLSearchParams(rawQuery)
              )
            )
          }
          variant="moderation"
        />
      ) : null}
    </section>
  );
}
