"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { roommateErrorMessage, roommateSafetyCopy } from "./roommate-content";

export function RoommateListingCta({ listingId, eligible }: Readonly<{ listingId: number; eligible: boolean }>) {
  const { status, user } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!eligible || (status === "authenticated" && (user?.role !== "TENANT" || !user.isActive))) return null;

  if (status === "anonymous") {
    return (
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

  return (
    <section className="rm-roommate-callout space-y-3" aria-label="Tìm người ở ghép" data-tone="accent">
      <div>
        <p className="rm-roommate-section-label">Liên kết với Roommate</p>
        <h2 className="mt-1 font-display text-ui-base font-bold">Tìm người ở ghép</h2>
        <p className="mt-1 text-ui-sm leading-6 text-muted-foreground">{roommateSafetyCopy.linkedMeaning}</p>
      </div>
      <Button
        className="w-full whitespace-nowrap"
        aria-label="Tìm người ở ghép cho tin đăng này"
        pending={pending}
        pendingLabel="Đang kiểm tra hồ sơ…"
        onClick={() => void begin()}
      >
        <Icon name="users" className="h-4 w-4" /> Tìm người ở ghép
      </Button>
      {error ? (
        <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
