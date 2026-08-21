"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import type { ApiPage, ModerationHistoryItem } from "../../types/api";

export interface HistoryRefreshInstruction {
  readonly token: number;
  readonly page?: number;
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

function historyUrl(listingId: number, query: HistoryQuery): string {
  const parameters = new URLSearchParams();
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
  const queryIdentity = parsed ? JSON.stringify(parsed) : "invalid";

  useEffect(() => {
    if (!parsed) return;
    const instructedPage =
      refreshInstruction && refreshInstruction.token > consumedInstruction.current
        ? refreshInstruction.page
        : undefined;
    if (refreshInstruction && refreshInstruction.token > consumedInstruction.current) {
      consumedInstruction.current = refreshInstruction.token;
      if (instructedPage !== undefined && instructedPage !== parsed.page) {
        replace(historyUrl(listingId, { ...parsed, page: instructedPage }));
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
        if (!controller.signal.aborted && currentRequest === requestId.current) setState({ status: "success", result });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && currentRequest === requestId.current)
          setState({ status: "error", error: error instanceof ApiError ? error : null });
      });
    return () => controller.abort();
  }, [listingId, parsed, queryIdentity, refreshInstruction, retryVersion, replace]);

  if (!parsed) return <ErrorState message="Liên kết lịch sử kiểm duyệt không hợp lệ." />;
  return (
    <section aria-labelledby="moderation-history-heading" className="space-y-4 border-t border-rent-line pt-8">
      <h2 id="moderation-history-heading" className="text-2xl font-semibold text-rent-ink">
        Lịch sử kiểm duyệt
      </h2>
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
        <ol className="space-y-3 border-l border-rent-line pl-4 sm:pl-5">
          {state.result.data.map((item) => (
            <li key={item.id} className="relative rounded-card border border-rent-line bg-white p-4 sm:p-5">
              <span
                aria-hidden="true"
                className="absolute -left-[1.35rem] top-6 h-2.5 w-2.5 rounded-full border-2 border-white bg-teal-700 sm:-left-[1.6rem]"
              />
              <p className="flex items-center gap-2 font-display font-bold text-rent-ink">
                {item.previousStatus} <Icon name="arrow" className="h-4 w-4" /> {item.newStatus}
              </p>
              <p className="mt-1 text-sm text-rent-secondary">
                Quản trị viên #{item.adminId} · {new Date(item.createdAt).toLocaleString("vi-VN")}
              </p>
              {item.reason ? (
                <p className="mt-3 whitespace-pre-wrap text-sm text-rent-secondary">{item.reason}</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {state.status === "success" ? (
        <Pagination
          ariaLabel="Phân trang lịch sử kiểm duyệt"
          page={state.result.pagination.page}
          hasNextPage={state.result.pagination.hasNextPage}
          onPrevious={() => router.push(historyUrl(listingId, { ...parsed, page: state.result.pagination.page - 1 }))}
          onNext={() => router.push(historyUrl(listingId, { ...parsed, page: state.result.pagination.page + 1 }))}
        />
      ) : null}
    </section>
  );
}
