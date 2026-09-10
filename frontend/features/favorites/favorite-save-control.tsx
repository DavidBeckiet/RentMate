"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { useFavoriteState } from "./favorite-state";

export interface FavoriteSaveControlProps {
  readonly listingId: string;
  readonly compact?: boolean;
  readonly initialSaved?: boolean;
  readonly onSavedChange?: (saved: boolean) => void | Promise<void>;
}

type FavoriteFeedback = "saved" | "removed" | null;

const maximumListingId = 2_147_483_647;

function parseListingId(value: string): number | null {
  if (!/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximumListingId ? parsed : null;
}

function favoriteErrorMessage(error: ApiError | null, removing: boolean): string {
  if (error?.status === 404)
    return removing ? "Tin đăng hiện không còn trong danh sách yêu thích." : "Tin đăng hiện không còn khả dụng để lưu.";
  if (error?.status === 401)
    return removing
      ? "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại để bỏ lưu tin."
      : "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại để lưu tin.";
  if (error?.status === 403)
    return removing
      ? "Chức năng bỏ lưu dành cho tài khoản người thuê."
      : "Chức năng lưu tin dành cho tài khoản người thuê.";
  if (error?.status === 422)
    return removing
      ? "Yêu cầu bỏ lưu không hợp lệ. Vui lòng tải lại trang và thử lại."
      : "Yêu cầu lưu tin không hợp lệ. Vui lòng tải lại trang và thử lại.";
  if (error?.code === "NETWORK_ERROR")
    return removing
      ? "Không thể xác nhận trạng thái bỏ lưu. Bạn có thể thử lại."
      : "Không thể xác nhận trạng thái lưu. Bạn có thể thử lại.";
  return removing ? "Không thể bỏ lưu tin lúc này. Vui lòng thử lại." : "Không thể lưu tin lúc này. Vui lòng thử lại.";
}

export function FavoriteSaveControl({
  listingId,
  compact = false,
  initialSaved = false,
  onSavedChange
}: FavoriteSaveControlProps) {
  const { status: authStatus, user, refresh } = useAuth();
  const parsedListingId = parseListingId(listingId);
  const { isFavorite, isPending, pendingTarget, toggle } = useFavoriteState({ autoLoad: !initialSaved });
  const saved = parsedListingId === null ? initialSaved : isFavorite(parsedListingId, initialSaved);
  const pending = parsedListingId === null ? false : isPending(parsedListingId);
  const activePendingTarget = parsedListingId === null ? null : pendingTarget(parsedListingId);
  const pendingLabelSaved = activePendingTarget ?? saved;
  const [feedback, setFeedback] = useState<FavoriteFeedback>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const authRefreshAttempted = useRef(false);

  useEffect(() => {
    pendingRef.current = false;
    authRefreshAttempted.current = false;
    setFeedback(null);
    setErrorMessage(null);
  }, [initialSaved, listingId]);

  const toggleFavorite = async () => {
    if (pendingRef.current || pending) return;

    const parsedListingId = parseListingId(listingId);
    if (parsedListingId === null) {
      setFeedback(null);
      setErrorMessage("Yêu cầu lưu tin không hợp lệ. Vui lòng tải lại trang và thử lại.");
      return;
    }

    const removing = saved;
    const nextSaved = !removing;
    pendingRef.current = true;
    setFeedback(null);
    setErrorMessage(null);

    try {
      const committedSaved = await toggle(parsedListingId, saved);
      if (committedSaved !== nextSaved) return;
      setFeedback(nextSaved ? "saved" : "removed");
      try {
        void Promise.resolve(onSavedChange?.(nextSaved)).catch(() => undefined);
      } catch {
        // A page reconciliation failure must not turn a successful favorite mutation into an error state.
      }
    } catch (caught: unknown) {
      const error = caught instanceof ApiError ? caught : null;
      if (error?.status === 401 && !authRefreshAttempted.current) {
        authRefreshAttempted.current = true;
        try {
          await refresh();
        } catch {
          // AuthProvider normally absorbs refresh failures; the mutation still remains unreplayed.
        }
      }
      setErrorMessage(favoriteErrorMessage(error, removing));
    } finally {
      pendingRef.current = false;
    }
  };

  if (authStatus === "loading") {
    return (
      <p role="status" aria-live="polite" className="text-ui-sm font-semibold text-muted-foreground">
        Đang kiểm tra quyền lưu tin…
      </p>
    );
  }

  if (authStatus === "anonymous") {
    if (compact) {
      return (
        <Link
          className="grid h-11 w-11 place-items-center rounded-full border border-border bg-surface text-foreground shadow-surface transition-[background-color,transform] duration-fast hover:-translate-y-0.5 hover:bg-primary-subtle"
          href="/login"
          aria-label="Đăng nhập để lưu tin"
        >
          <Icon name="heart" className="h-5 w-5" />
        </Link>
      );
    }
    return (
      <p className="text-ui-sm leading-6 text-muted-foreground">
        <Link className="font-semibold text-primary-hover underline decoration-2 underline-offset-4" href="/login">
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
          className="grid h-11 w-11 place-items-center rounded-full border border-danger/30 bg-danger-subtle text-danger shadow-surface"
          onClick={() => void refresh()}
          aria-label="Thử lại quyền lưu tin"
        >
          <Icon name="refresh" className="h-5 w-5" />
        </button>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-3" role="alert">
        <p className="text-ui-sm text-danger">Không thể kiểm tra quyền lưu tin lúc này.</p>
        <Button variant="secondary" onClick={() => void refresh()}>
          Thử lại
        </Button>
      </div>
    );
  }

  if (!user || user.role !== "TENANT") {
    if (compact) return null;
    return <p className="text-ui-sm text-muted-foreground">Chức năng lưu tin dành cho tài khoản người thuê.</p>;
  }

  if (compact) {
    return (
      <div className="relative">
        <Button
          variant={saved ? "soft" : "secondary"}
          pending={pending}
          pendingLabel={pendingLabelSaved ? "Đang lưu…" : "Đang bỏ lưu…"}
          onClick={() => void toggleFavorite()}
          aria-label={
            pending
              ? pendingLabelSaved
                ? "Đang lưu…"
                : "Đang bỏ lưu…"
              : saved
                ? "Bỏ khỏi yêu thích"
                : "Thêm vào yêu thích"
          }
          aria-pressed={saved}
          className="!min-h-10 !min-w-10 !p-0"
        >
          <Icon name="heart" filled={saved} className="h-5 w-5" />
        </Button>
        {feedback ? (
          <span role="status" aria-live="polite" className="sr-only">
            {feedback === "saved" ? "Đã thêm vào yêu thích." : "Đã bỏ khỏi yêu thích."}
          </span>
        ) : null}
        {errorMessage ? (
          <p
            role="alert"
            className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-10 w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-left text-ui-xs font-semibold text-danger shadow-raised"
          >
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant={saved ? "soft" : "primary"}
        pending={pending}
        pendingLabel={pendingLabelSaved ? "Đang lưu…" : "Đang bỏ lưu…"}
        onClick={() => void toggleFavorite()}
        aria-label={pending ? (pendingLabelSaved ? "Đang lưu…" : "Đang bỏ lưu…") : undefined}
        aria-pressed={saved}
      >
        {saved ? "Bỏ khỏi yêu thích" : "Thêm vào yêu thích"}
      </Button>
      {errorMessage ? (
        <p className="max-w-xl text-ui-sm text-danger" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {feedback ? (
        <p className="text-ui-sm text-muted-foreground" role="status" aria-live="polite">
          {feedback === "saved" ? "Đã thêm vào danh sách yêu thích." : "Đã bỏ khỏi danh sách yêu thích."}
        </p>
      ) : null}
    </div>
  );
}
