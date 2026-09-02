"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { SearchQueryState } from "../listings/search-query";
import { toSavedSearchQuery } from "./saved-search-query";

export function SaveSearchControl({ search }: { readonly search: SearchQueryState }) {
  const { status, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const saveLabel = search.mode === "ordinary" ? "Lưu bộ lọc" : "Lưu tìm kiếm khu vực này";

  if (status === "authenticated" && user?.role !== "TENANT") return null;
  if (status === "anonymous") {
    return (
      <Link
        className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 text-ui-sm font-semibold text-foreground shadow-surface transition-[background-color,border-color,transform] duration-fast hover:-translate-y-0.5 hover:border-primary hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        href="/login"
      >
        <Icon name="plus" className="h-4 w-4" /> {saveLabel}
      </Link>
    );
  }
  if (status !== "authenticated") return null;

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setSaved(false);
          }}
          className="inline-flex min-h-10 items-center gap-2 rounded-control border border-primary bg-primary px-3 text-ui-sm font-semibold text-primary-foreground shadow-surface transition-[background-color,box-shadow,transform] duration-fast hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <Icon name="plus" className="h-4 w-4" /> {saveLabel}
        </button>
        {saved ? (
          <Link
            className="text-ui-xs font-semibold text-primary-hover underline decoration-2 underline-offset-4"
            href="/saved-searches"
          >
            Đã lưu · Xem danh sách
          </Link>
        ) : null}
      </div>
    );
  }

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api.savedSearches.create({ name: name.trim() || null, query: toSavedSearchQuery(search) });
      setSaved(true);
      setOpen(false);
      setName("");
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(apiError?.status === 422 ? "Tên hoặc bộ lọc chưa hợp lệ." : "Chưa thể lưu bộ lọc. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-initial"
      role="group"
      aria-label={`${saveLabel} hiện tại`}
    >
      <label className="sr-only" htmlFor="saved-search-name">
        Tên bộ lọc
      </label>
      <input
        id="saved-search-name"
        value={name}
        maxLength={120}
        onChange={(event) => setName(event.target.value)}
        placeholder="Tên gợi nhớ (không bắt buộc)"
        className="min-h-10 min-w-0 flex-1 rounded-control border border-border-strong bg-surface px-3 text-ui-sm font-medium text-foreground outline-none placeholder:text-subtle-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-56"
      />
      <Button
        pending={pending}
        pendingLabel="Đang lưu…"
        className="min-h-10 px-3 py-1.5 text-ui-sm"
        onClick={() => void submit()}
      >
        Lưu
      </Button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="grid h-10 w-10 place-items-center rounded-control border border-border-strong bg-surface text-foreground transition-colors duration-fast hover:border-danger/40 hover:bg-danger-subtle hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        aria-label="Hủy lưu bộ lọc"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
      {error ? (
        <span
          role="alert"
          className="w-full rounded-control border border-danger/25 bg-danger-subtle p-2 text-ui-xs font-semibold text-danger"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
