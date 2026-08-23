"use client";

import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";

export function ShareListingControl({
  listingId,
  title,
  compact = false
}: Readonly<{ listingId: number; title: string; compact?: boolean }>) {
  const [message, setMessage] = useState("");

  const share = async () => {
    const url = `${window.location.origin}/listings/${listingId}`;
    setMessage("");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: `Xem tin ${title} trên RentMate`, url });
        setMessage("Đã mở bảng chia sẻ.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setMessage("Đã sao chép đường dẫn tin đăng.");
    } catch {
      setMessage("Không thể chia sẻ lúc này. Bạn có thể sao chép URL trên trình duyệt.");
    }
  };

  return (
    <div>
      <Button
        variant="secondary"
        onClick={() => void share()}
        className={compact ? "!min-h-10 !min-w-10 !p-0" : ""}
        aria-label={compact ? "Chia sẻ tin đăng" : undefined}
      >
        <Icon name="share" className="h-5 w-5" />
        {compact ? null : "Chia sẻ"}
      </Button>
      <span className={compact ? "sr-only" : "mt-2 block text-xs font-bold text-slate-600"} aria-live="polite">
        {message}
      </span>
    </div>
  );
}
