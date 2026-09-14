"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { roommateErrorMessage, roommateSafetyCopy } from "./roommate-content";

export function RoommateListingCta({
  listingId,
  eligible,
  compact = false,
  label
}: Readonly<{ listingId: number; eligible: boolean; compact?: boolean; label?: string }>) {
  const { status, user } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionLabel = label ?? (compact ? "Cân nhắc cùng người ở ghép" : "Tìm người ở ghép");

  if (!eligible || (status === "authenticated" && (user?.role !== "TENANT" || !user.isActive))) return null;

  if (status === "anonymous") {
    return compact ? (
      <Link
        href="/login"
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-primary/30 bg-surface px-3 py-2 text-ui-xs font-bold text-primary-hover transition-colors hover:bg-primary-subtle"
      >
        <Icon name="users" className="h-4 w-4" /> Đăng nhập để cân nhắc ở ghép
      </Link>
    ) : (
      <div className="rm-roommate-callout" data-tone="info">
        <p className="text-ui-sm leading-6 text-muted-foreground">
          <Link className="font-bold underline decoration-2 underline-offset-4" href="/login">
            Đăng nhập bằng tài khoản người thuê
          </Link>{" "}
          để tìm người ở ghép cho tin đăng này.
        </p>
      </div>
    );
  }

  if (status !== "authenticated") return null;

  const begin = async () => {
    setPending(true);
    setError(null);
    try {
      const profile = await api.roommates.getProfile();
      if (!profile.profileCompleted) {
        router.push(`/roommates/profile?next=/roommates/my-request?listingId=${listingId}`);
        return;
      }
      router.push(`/roommates/my-request?listingId=${listingId}`);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      if (apiError?.status === 404) {
        router.push(`/roommates/profile?next=/roommates/my-request?listingId=${listingId}`);
        return;
      }
      setError(roommateErrorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  if (compact) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <Button
          variant="outline"
          size="sm"
          aria-label={actionLabel}
          pending={pending}
          pendingLabel="Đang kiểm tra hồ sơ…"
          onClick={() => void begin()}
        >
          <Icon name="users" className="h-4 w-4" /> {actionLabel}
        </Button>
        {error ? (
          <p role="alert" className="max-w-xs text-ui-xs font-semibold text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section className="rm-roommate-callout space-y-3" aria-label="Tìm người ở ghép" data-tone="accent">
      <div>
        <p className="rm-roommate-section-label">Liên kết với Roommate</p>
        <h2 className="mt-1 font-display text-ui-base font-bold">{actionLabel}</h2>
        <p className="mt-1 text-ui-sm leading-6 text-muted-foreground">{roommateSafetyCopy.linkedMeaning}</p>
      </div>
      <Button
        className="w-full whitespace-nowrap"
        aria-label="Tìm người ở ghép cho tin đăng này"
        pending={pending}
        pendingLabel="Đang kiểm tra hồ sơ…"
        onClick={() => void begin()}
      >
        <Icon name="users" className="h-4 w-4" /> {actionLabel}
      </Button>
      {error ? (
        <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
