"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { useFavoriteState } from "./favorite-state";

export interface FavoriteRemoveControlProps {
  readonly listingId: number;
  readonly onRemoved: () => Promise<void> | void;
  readonly autoLoad?: boolean;
}

function removeErrorMessage(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Chức năng bỏ lưu dành cho tài khoản người thuê.";
  if (error?.status === 422) return "Yêu cầu bỏ lưu không hợp lệ. Vui lòng tải lại trang và thử lại.";
  if (error?.code === "NETWORK_ERROR") return "Không thể xác nhận trạng thái bỏ lưu. Bạn có thể thử lại.";
  return "Không thể bỏ lưu tin lúc này. Vui lòng thử lại.";
}

export function FavoriteRemoveControl({ listingId, onRemoved, autoLoad = true }: FavoriteRemoveControlProps) {
  const { refresh } = useAuth();
  const { isPending, remove: removeFavorite } = useFavoriteState({ autoLoad });
  const pending = isPending(listingId);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const authRefreshAttempted = useRef(false);

  useEffect(() => {
    pendingRef.current = false;
    authRefreshAttempted.current = false;
    setErrorMessage(null);
  }, [listingId]);

  const remove = async () => {
    if (pendingRef.current || pending) return;

    pendingRef.current = true;
    setErrorMessage(null);

    try {
      await removeFavorite(listingId, true);
      await onRemoved();
    } catch (caught: unknown) {
      const error = caught instanceof ApiError ? caught : null;
      if (error?.status === 401 && !authRefreshAttempted.current) {
        authRefreshAttempted.current = true;
        try {
          await refresh();
        } catch {
          // A refresh failure does not replay or reinterpret the DELETE result.
        }
      }
      setErrorMessage(removeErrorMessage(error));
    } finally {
      pendingRef.current = false;
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
        <p className="max-w-xl text-ui-sm text-danger" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
