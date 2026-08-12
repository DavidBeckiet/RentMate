"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { SelectField } from "../../components/ui/form-controls";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, ListingStatus, OwnerListingSummary } from "../../types/api";
import { OwnerListingCard } from "./owner-listing-card";
import {
  ownerListingStatuses,
  ownerListingsUrl,
  parseOwnerQuery,
  serializeOwnerQuery,
  toOwnedListingQuery,
  withOwnerPage,
  withOwnerStatus
} from "./owner-query";

type LoadStatus = "idle" | "loading" | "success" | "error";

const statusLabels: Record<ListingStatus, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị từ chối",
  HIDDEN: "Đã ẩn",
  INACTIVE: "Ngừng hoạt động"
};

function ownerListError(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Trang quản lý tin chỉ dành cho tài khoản người cho thuê.";
  if (error?.status === 422) return "Liên kết quản lý tin đăng không hợp lệ.";
  if (error?.code === "NETWORK_ERROR") return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.";
  return "Không thể tải danh sách tin lúc này. Vui lòng thử lại.";
}

function createError(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Bạn không có quyền tạo bản nháp.";
  if (error?.status === 422) return "Yêu cầu tạo bản nháp không hợp lệ.";
  if (error?.code === "NETWORK_ERROR") {
    return "Không thể xác nhận việc tạo bản nháp. Hãy kiểm tra danh sách tin trước khi thử lại.";
  }
  return "Không thể tạo bản nháp lúc này. Vui lòng thử lại sau.";
}

export function OwnerListingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const parsed = useMemo(() => parseOwnerQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const queryIdentity = parsed.ok ? serializeOwnerQuery(parsed.state).toString() : `invalid:${rawQuery}`;
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const isLandlord = authStatus === "authenticated" && user?.role === "LANDLORD";
  const [result, setResult] = useState<ApiPage<OwnerListingSummary> | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [createPending, setCreatePending] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<string | null>(null);
  const requestIdentity = useRef(0);
  const authRefreshAttempted = useRef(false);
  const createPendingRef = useRef(false);
  const createController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isLandlord || !parsed.ok) {
      ++requestIdentity.current;
      setResult(null);
      setLoadError(null);
      setLoadStatus("idle");
      return;
    }

    const controller = new AbortController();
    const identity = ++requestIdentity.current;
    setResult(null);
    setLoadError(null);
    setLoadStatus("loading");

    void api.listings
      .listOwned(toOwnedListingQuery(parsed.state), controller.signal)
      .then((page) => {
        if (controller.signal.aborted || identity !== requestIdentity.current) return;
        setResult(page);
        setLoadStatus("success");
        authRefreshAttempted.current = false;
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || identity !== requestIdentity.current) return;
        const error = caught instanceof ApiError ? caught : null;
        setLoadError(error);
        setLoadStatus("error");
        if (error?.status === 401 && !authRefreshAttempted.current) {
          authRefreshAttempted.current = true;
          void refresh().catch(() => undefined);
        }
      });

    return () => controller.abort();
  }, [isLandlord, parsed, queryIdentity, refresh, retryKey]);

  useEffect(
    () => () => {
      createController.current?.abort();
    },
    []
  );

  const createDraft = useCallback(async () => {
    if (createPendingRef.current) return;
    const controller = new AbortController();
    createController.current = controller;
    createPendingRef.current = true;
    setCreatePending(true);
    setCreateFeedback(null);
    try {
      const created = await api.listings.createDraft({}, controller.signal);
      if (!controller.signal.aborted) router.push(`/landlord/listings/${created.id}`);
    } catch (caught: unknown) {
      if (controller.signal.aborted) return;
      const error = caught instanceof ApiError ? caught : null;
      setCreateFeedback(createError(error));
      if (error?.status === 401) await refresh().catch(() => undefined);
    } finally {
      if (!controller.signal.aborted && createController.current === controller) {
        createPendingRef.current = false;
        setCreatePending(false);
      }
    }
  }, [refresh, router]);

  let content: ReactNode;
  if (authStatus === "loading") {
    content = <LoadingState message="Đang kiểm tra tài khoản…" />;
  } else if (!parsed.ok) {
    content = (
      <ErrorState
        message={parsed.message}
        action={<Button onClick={() => router.replace("/landlord")}>Đặt lại liên kết</Button>}
      />
    );
  } else if (authStatus === "anonymous") {
    content = (
      <EmptyState
        title="Đăng nhập để quản lý tin"
        description="Trang này dành cho tài khoản người cho thuê."
        action={
          <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/login">
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
  } else if (!user || user.role !== "LANDLORD") {
    content = (
      <EmptyState
        title="Trang này dành cho tài khoản người cho thuê"
        description="Hãy dùng tài khoản người cho thuê để tạo và quản lý tin đăng."
        action={
          <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/">
            Tìm phòng
          </Link>
        }
      />
    );
  } else if (loadStatus === "loading" || loadStatus === "idle") {
    content = <LoadingState message="Đang tải tin của bạn…" />;
  } else if (loadStatus === "error") {
    content = (
      <ErrorState
        message={ownerListError(loadError)}
        requestId={loadError?.requestId}
        action={<Button onClick={() => setRetryKey((key) => key + 1)}>Thử lại</Button>}
      />
    );
  } else if (result) {
    content = (
      <div className="space-y-6">
        {result.data.length === 0 ? (
          <EmptyState
            title={parsed.state.status === undefined ? "Bạn chưa có tin đăng." : "Không có tin ở trạng thái này."}
            action={
              parsed.state.status === undefined ? (
                <Button pending={createPending} pendingLabel="Đang tạo…" onClick={() => void createDraft()}>
                  Tạo tin mới
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4" aria-label="Tin đăng của bạn">
            {result.data.map((listing) => (
              <OwnerListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}

        <nav
          aria-label="Phân trang tin của tôi"
          className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3"
        >
          <Button
            variant="secondary"
            disabled={result.pagination.page <= 1}
            onClick={() => router.push(ownerListingsUrl(withOwnerPage(parsed.state, result.pagination.page - 1)))}
          >
            Trang trước
          </Button>
          <span className="text-sm font-semibold text-slate-700">Trang {result.pagination.page}</span>
          <Button
            variant="secondary"
            disabled={!result.pagination.hasNextPage}
            onClick={() => router.push(ownerListingsUrl(withOwnerPage(parsed.state, result.pagination.page + 1)))}
          >
            Trang sau
          </Button>
        </nav>
      </div>
    );
  }

  const committedState = parsed.ok ? parsed.state : { page: 1 };

  return (
    <section aria-labelledby="owner-listings-heading" className="space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Khu vực người cho thuê</p>
          <h1 id="owner-listings-heading" className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Tin của tôi
          </h1>
          <p className="mt-3 leading-7 text-slate-600">
            Theo dõi trạng thái, hoàn thiện bản nháp và quản lý vòng đời tin đăng.
          </p>
        </div>
        {isLandlord ? (
          <Button pending={createPending} pendingLabel="Đang tạo…" onClick={() => void createDraft()}>
            Tạo tin mới
          </Button>
        ) : null}
      </header>

      {isLandlord && parsed.ok ? (
        <div className="max-w-sm">
          <SelectField
            id="owner-status-filter"
            name="status"
            label="Trạng thái"
            value={committedState.status ?? ""}
            onChange={(event) => {
              const status = event.target.value === "" ? undefined : (event.target.value as ListingStatus);
              router.push(ownerListingsUrl(withOwnerStatus(committedState, status)));
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {ownerListingStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </SelectField>
        </div>
      ) : null}

      {createFeedback ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950">
          {createFeedback}
        </p>
      ) : null}
      {content}
    </section>
  );
}
