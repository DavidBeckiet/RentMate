"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { useComparisonSelection } from "./comparison-store";

export function ComparisonToggle({ listingId, compact = false }: Readonly<{ listingId: number; compact?: boolean }>) {
  const { contains, toggle } = useComparisonSelection();
  const selected = contains(listingId);
  const messageId = useId();
  const [message, setMessage] = useState("");

  useEffect(() => setMessage(""), [listingId]);

  const activate = () => {
    const outcome = toggle(listingId);
    setMessage(
      outcome === "limit"
        ? "Bạn chỉ có thể so sánh tối đa 4 tin."
        : outcome === "added"
          ? "Đã thêm tin vào danh sách so sánh."
          : "Đã bỏ tin khỏi danh sách so sánh."
    );
  };

  return (
    <div>
      <Button
        variant={selected ? "primary" : "secondary"}
        onClick={activate}
        aria-pressed={selected}
        aria-describedby={message ? messageId : undefined}
        aria-label={compact ? (selected ? "Bỏ khỏi so sánh" : "Thêm vào so sánh") : undefined}
        className={compact ? "!min-h-10 !min-w-10 !rounded-full !p-0" : ""}
      >
        <Icon name="compare" className="h-5 w-5" />
        {compact ? null : selected ? "Đã chọn so sánh" : "Thêm vào so sánh"}
      </Button>
      <span
        id={messageId}
        className={compact ? "sr-only" : "mt-2 block text-ui-xs font-semibold text-muted-foreground"}
        aria-live="polite"
      >
        {message}
      </span>
    </div>
  );
}
