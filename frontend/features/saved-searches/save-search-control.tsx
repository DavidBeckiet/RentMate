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
        className="inline-flex min-h-10 items-center gap-2 border-2 border-heroDark-950 bg-white px-3 text-xs font-extrabold shadow-glass-sm hover:bg-rent-accent focus-visible:outline-none"
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
          className="inline-flex min-h-10 items-center gap-2 border-2 border-heroDark-950 bg-rent-accent px-3 text-xs font-extrabold shadow-glass-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none"
        >
          <Icon name="plus" className="h-4 w-4" /> {saveLabel}
        </button>
        {saved ? (
          <Link className="text-xs font-extrabold underline decoration-2 underline-offset-4" href="/saved-searches">
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
        className="min-h-10 min-w-0 flex-1 border-2 border-heroDark-950 bg-white px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-brandBlue-500 sm:w-56"
      />
      <Button
        pending={pending}
        pendingLabel="Đang lưu…"
        className="min-h-10 px-3 py-1.5 text-xs"
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
        className="grid h-10 w-10 place-items-center border-2 border-heroDark-950 bg-white hover:bg-rent-coral focus-visible:outline-none"
        aria-label="Hủy lưu bộ lọc"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
      {error ? (
        <span role="alert" className="w-full text-xs font-bold text-red-800">
          {error}
        </span>
      ) : null}
    </div>
  );
}
