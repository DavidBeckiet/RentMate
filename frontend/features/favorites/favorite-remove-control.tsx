"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";

export interface FavoriteRemoveControlProps {
  readonly listingId: number;
  readonly onRemoved: () => Promise<void> | void;
}

function removeErrorMessage(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Chức năng bỏ lưu dành cho tài khoản người thuê.";
  if (error?.status === 422) return "Yêu cầu bỏ lưu không hợp lệ. Vui lòng tải lại trang và thử lại.";
  if (error?.code === "NETWORK_ERROR") return "Không thể xác nhận trạng thái bỏ lưu. Bạn có thể thử lại.";
  return "Không thể bỏ lưu tin lúc này. Vui lòng thử lại.";
}

export function FavoriteRemoveControl({ listingId, onRemoved }: FavoriteRemoveControlProps) {
  const { refresh } = useAuth();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const authRefreshAttempted = useRef(false);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    pendingRef.current = false;
    authRefreshAttempted.current = false;
    setPending(false);
    setErrorMessage(null);

    return () => {
      controllerRef.current?.abort();
    };
  }, [listingId]);

  const remove = async () => {
    if (pendingRef.current) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    pendingRef.current = true;
    setPending(true);
    setErrorMessage(null);

    try {
      await api.favorites.remove(listingId, controller.signal);
      if (controller.signal.aborted) return;
      await onRemoved();
    } catch (caught: unknown) {
      if (controller.signal.aborted) return;
      const error = caught instanceof ApiError ? caught : null;
      if (error?.status === 401 && !authRefreshAttempted.current) {
        authRefreshAttempted.current = true;
        try {
          await refresh();
        } catch {
          // A refresh failure does not replay or reinterpret the DELETE result.
        }
      }
      if (!controller.signal.aborted) setErrorMessage(removeErrorMessage(error));
    } finally {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <Button
        variant="secondary"
        pending={pending}
        pendingLabel="Đang bỏ lưu…"
        className="w-full sm:w-auto"
        onClick={() => void remove()}
      >
        Bỏ lưu
      </Button>
      {errorMessage ? (
        <p className="max-w-xl text-sm text-red-700" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
