"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ListingNote } from "../../types/api";

function errorMessage(error: ApiError | null): string {
  if (error?.status === 404) return "Tin đăng hiện không còn công khai để lưu ghi chú mới.";
  if (error?.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Ghi chú riêng chỉ dành cho tài khoản người thuê.";
  if (error?.status === 422) return "Ghi chú không hợp lệ. Vui lòng kiểm tra độ dài và nội dung.";
  return "Không thể cập nhật ghi chú lúc này. Vui lòng thử lại.";
}

export function ListingNoteEditor({
  listingId,
  initialNote,
  onChanged
}: Readonly<{
  listingId: number;
  initialNote?: ListingNote | null;
  onChanged?: (note: ListingNote | null) => void;
}>) {
  const { status: authStatus, user } = useAuth();
  const [saved, setSaved] = useState<ListingNote | null>(initialNote ?? null);
  const [value, setValue] = useState(initialNote?.note ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (authStatus !== "authenticated" || user?.role !== "TENANT") {
      setSaved(null);
      setValue("");
      setStatus("idle");
      return;
    }
    if (initialNote !== undefined) {
      setSaved(initialNote);
      setValue(initialNote?.note ?? "");
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    setError(null);
    void api.listingNotes
      .list([listingId], controller.signal)
      .then((notes) => {
        if (controller.signal.aborted) return;
        const current = notes.find((note) => note.listingId === listingId) ?? null;
        setSaved(current);
        setValue(current?.note ?? "");
        setStatus("idle");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof ApiError ? caught : null);
        setStatus("error");
      });
    return () => controller.abort();
  }, [authStatus, initialNote, listingId, user?.role]);

  if (authStatus === "loading") {
    return <p className="text-sm font-bold text-slate-600">Đang kiểm tra quyền ghi chú…</p>;
  }
  if (authStatus === "anonymous") {
    return (
      <p className="text-sm leading-6 text-slate-600">
        <Link className="font-extrabold text-teal-800 underline decoration-2 underline-offset-4" href="/login">
          Đăng nhập bằng tài khoản người thuê
        </Link>{" "}
        để lưu ghi chú riêng cho tin này.
      </p>
    );
  }
  if (!user || user.role !== "TENANT") {
    return <p className="text-sm text-slate-600">Ghi chú riêng chỉ dành cho tài khoản người thuê.</p>;
  }

  const normalized = value.trim();
  const dirty = normalized !== (saved?.note ?? "");
  const save = async () => {
    if (!normalized || normalized.length > 2_000 || status === "saving") return;
    setStatus("saving");
    setError(null);
    try {
      const result = await api.listingNotes.save(listingId, normalized);
      setSaved(result);
      setValue(result.note);
      setStatus("success");
      onChanged?.(result);
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught : null);
      setStatus("error");
    }
  };

  const remove = async () => {
    if (!saved || status === "saving") return;
    setStatus("saving");
    setError(null);
    try {
      await api.listingNotes.remove(listingId);
      setSaved(null);
      setValue("");
      setStatus("success");
      onChanged?.(null);
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught : null);
      setStatus("error");
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label htmlFor={`listing-note-${listingId}`} className="flex items-center gap-2 text-sm font-extrabold">
        <Icon name="note" className="h-4 w-4" /> Ghi chú riêng
      </label>
      <textarea
        id={`listing-note-${listingId}`}
        rows={4}
        maxLength={2_000}
        value={value}
        disabled={status === "loading" || status === "saving"}
        onChange={(event) => {
          setValue(event.target.value);
          if (status === "success" || status === "error") setStatus("idle");
        }}
        placeholder="Ví dụ: gần chỗ làm, hỏi thêm chi phí điện nước…"
        className="w-full resize-y border-2 border-heroDark-950 bg-white p-3 text-sm font-medium outline-none focus-visible:shadow-glass-sm disabled:cursor-not-allowed disabled:bg-slate-100"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" pending={status === "saving"} pendingLabel="Đang lưu…" disabled={!dirty || !normalized}>
          Lưu ghi chú
        </Button>
        {saved ? (
          <Button type="button" variant="danger" pending={status === "saving"} onClick={() => void remove()}>
            Xóa ghi chú
          </Button>
        ) : null}
        <span className="text-xs font-bold text-slate-500">Chỉ bạn nhìn thấy · {value.length}/2000</span>
      </div>
      <p aria-live="polite" className="text-xs font-bold text-slate-600">
        {status === "loading"
          ? "Đang tải ghi chú…"
          : status === "success"
            ? saved
              ? "Đã lưu ghi chú riêng."
              : "Đã xóa ghi chú."
            : ""}
      </p>
      {status === "error" ? (
        <p role="alert" className="border-2 border-heroDark-950 bg-rent-coral p-3 text-xs font-bold">
          {errorMessage(error)}
        </p>
      ) : null}
    </form>
  );
}
