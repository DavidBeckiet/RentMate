"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
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
    <section aria-labelledby="moderation-history-heading" className="space-y-4">
      <h2 id="moderation-history-heading" className="text-2xl font-semibold text-slate-950">
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
        <ol className="space-y-3">
          {state.result.data.map((item) => (
            <li key={item.id} className="rounded-xl border border-stone-200 bg-white p-5">
              <p className="font-semibold text-slate-950">
                {item.previousStatus} → {item.newStatus}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Quản trị viên #{item.adminId} · {new Date(item.createdAt).toLocaleString("vi-VN")}
              </p>
              {item.reason ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{item.reason}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {state.status === "success" ? (
        <nav aria-label="Phân trang lịch sử kiểm duyệt" className="flex items-center justify-between gap-4">
          <Button
            variant="secondary"
            disabled={state.result.pagination.page <= 1}
            onClick={() => router.push(historyUrl(listingId, { ...parsed, page: state.result.pagination.page - 1 }))}
          >
            Trang trước
          </Button>
          <span className="text-sm text-slate-600">Trang {state.result.pagination.page}</span>
          <Button
            variant="secondary"
            disabled={!state.result.pagination.hasNextPage}
            onClick={() => router.push(historyUrl(listingId, { ...parsed, page: state.result.pagination.page + 1 }))}
          >
            Trang sau
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
