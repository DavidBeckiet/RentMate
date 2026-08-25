"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";

export interface FavoriteSaveControlProps {
  readonly listingId: string;
  readonly compact?: boolean;
}

type SaveOutcome = { readonly status: "idle" | "success" } | { readonly status: "error"; readonly message: string };

const maximumListingId = 2_147_483_647;

function parseListingId(value: string): number | null {
  if (!/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximumListingId ? parsed : null;
}

function saveErrorMessage(error: ApiError | null): string {
  if (error?.status === 404) return "Tin đăng hiện không còn khả dụng để lưu.";
  if (error?.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại để lưu tin.";
  if (error?.status === 403) return "Chức năng lưu tin dành cho tài khoản người thuê.";
  if (error?.status === 422) return "Yêu cầu lưu tin không hợp lệ. Vui lòng tải lại trang và thử lại.";
  if (error?.code === "NETWORK_ERROR") return "Không thể xác nhận trạng thái lưu. Bạn có thể thử lại.";
  return "Không thể lưu tin lúc này. Vui lòng thử lại.";
}

export function FavoriteSaveControl({ listingId, compact = false }: FavoriteSaveControlProps) {
  const { status: authStatus, user, refresh } = useAuth();
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<SaveOutcome>({ status: "idle" });
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const authRefreshAttempted = useRef(false);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    pendingRef.current = false;
    authRefreshAttempted.current = false;
    setPending(false);
    setOutcome({ status: "idle" });

    return () => {
      controllerRef.current?.abort();
    };
  }, [listingId]);

  const save = async () => {
    if (pendingRef.current || outcome.status === "success") return;

    const parsedListingId = parseListingId(listingId);
    if (parsedListingId === null) {
      setOutcome({ status: "error", message: "Yêu cầu lưu tin không hợp lệ. Vui lòng tải lại trang và thử lại." });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    pendingRef.current = true;
    setPending(true);
    setOutcome({ status: "idle" });

    try {
      await api.favorites.add(parsedListingId, controller.signal);
      if (controller.signal.aborted) return;
      void api.analytics?.trackListingEvent?.(parsedListingId, "FAVORITE").catch(() => undefined);
      setOutcome({ status: "success" });
    } catch (caught: unknown) {
      if (controller.signal.aborted) return;
      const error = caught instanceof ApiError ? caught : null;
      if (error?.status === 401 && !authRefreshAttempted.current) {
        authRefreshAttempted.current = true;
        try {
          await refresh();
        } catch {
          // AuthProvider normally absorbs refresh failures; the mutation still remains unreplayed.
        }
      }
      if (!controller.signal.aborted) setOutcome({ status: "error", message: saveErrorMessage(error) });
    } finally {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  };

  if (authStatus === "loading") {
    return (
      <p role="status" aria-live="polite" className="text-sm font-medium text-slate-600">
        Đang kiểm tra quyền lưu tin…
      </p>
    );
  }

  if (authStatus === "anonymous") {
    if (compact) {
      return (
        <Link
          className="grid h-10 w-10 place-items-center border-2 border-heroDark-950 bg-rent-surface text-heroDark-950 shadow-glass-sm transition-transform hover:-translate-y-0.5"
          href="/login"
          aria-label="Đăng nhập để lưu tin"
        >
          <Icon name="heart" className="h-5 w-5" />
        </Link>
      );
    }
    return (
      <p className="text-sm leading-6 text-slate-600">
        <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/login">
          Đăng nhập bằng tài khoản người thuê
        </Link>{" "}
        để lưu tin này.
      </p>
    );
  }

  if (authStatus === "error") {
    if (compact) {
      return (
        <button
          type="button"
          className="grid h-10 w-10 place-items-center border-2 border-heroDark-950 bg-rent-coral font-display text-lg font-bold shadow-glass-sm"
          onClick={() => void refresh()}
          aria-label="Thử lại quyền lưu tin"
        >
          !
        </button>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-3" role="alert">
        <p className="text-sm text-red-700">Không thể kiểm tra quyền lưu tin lúc này.</p>
        <Button variant="secondary" onClick={() => void refresh()}>
          Thử lại
        </Button>
      </div>
    );
  }

  if (!user || user.role !== "TENANT") {
    if (compact) return null;
    return <p className="text-sm text-slate-600">Chức năng lưu tin dành cho tài khoản người thuê.</p>;
  }

  if (compact) {
    return (
      <Button
        pending={pending}
        pendingLabel="Đang lưu…"
        disabled={outcome.status === "success"}
        onClick={() => void save()}
        aria-label={outcome.status === "success" ? "Đã lưu tin" : "Lưu tin"}
        className="!min-h-10 !min-w-10 !p-0"
      >
        <Icon name="heart" filled={outcome.status === "success"} className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        pending={pending}
        pendingLabel="Đang lưu…"
        disabled={outcome.status === "success"}
        onClick={() => void save()}
      >
        {outcome.status === "success" ? "Đã lưu" : "Lưu tin"}
      </Button>
      {outcome.status === "error" ? (
        <p className="max-w-xl text-sm text-red-700" role="alert">
          {outcome.message}
        </p>
      ) : null}
      {outcome.status === "success" ? (
        <p className="text-sm text-slate-600" aria-live="polite">
          Tin đã được bảo đảm có trong danh sách đã lưu.
        </p>
      ) : null}
    </div>
  );
}
