"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface NavigationOverlayProps {
  readonly open: boolean;
  readonly title: string;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function NavigationOverlay({ open, title, triggerRef, onClose, children }: NavigationOverlayProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = panel?.querySelectorAll<HTMLElement>(focusableSelector);
    focusable?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [onClose, open, triggerRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] lg:hidden">
      <button
        type="button"
        aria-label={`Đóng ${title.toLowerCase()}`}
        className="absolute inset-0 cursor-default bg-foreground/35"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-[min(88vw,22rem)] flex-col overflow-y-auto border-l border-border bg-surface p-4 shadow-overlay-soft motion-safe:animate-[shell-panel-in_200ms_var(--rm-ease-out)]"
      >
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border pb-3">
          <h2 id={titleId} className="font-display text-heading-sm font-semibold text-foreground">
            {title}
          </h2>
          <IconButton label={`Đóng ${title.toLowerCase()}`} variant="ghost" onClick={onClose}>
            <Icon name="close" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
