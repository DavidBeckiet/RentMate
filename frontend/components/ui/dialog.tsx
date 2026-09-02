"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { cx } from "./class-names";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly triggerRef?: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly closeLabel?: string;
  readonly mode?: "modal" | "drawer";
  readonly className?: string;
}

export function Dialog({
  open,
  title,
  description,
  children,
  actions,
  triggerRef,
  onClose,
  closeLabel = "Đóng hộp thoại",
  mode = "modal",
  className
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const trigger = triggerRef?.current;
    const previousActive = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = panel?.querySelectorAll<HTMLElement>(focusableSelector);
    const first = focusable?.[0] ?? panel;
    first?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      if (controls.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const firstControl = controls[0];
      const lastControl = controls[controls.length - 1];

      if (event.shiftKey && document.activeElement === firstControl) {
        event.preventDefault();
        lastControl.focus();
      } else if (!event.shiftKey && document.activeElement === lastControl) {
        event.preventDefault();
        firstControl.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      const returnTarget = trigger ?? previousActive;
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [onClose, open, triggerRef]);

  if (!open) return null;

  return (
    <div
      className={cx(
        "fixed inset-0 z-dialog flex items-center justify-center p-4",
        mode === "drawer" && "items-stretch justify-end p-0 sm:p-4"
      )}
    >
      <button
        type="button"
        aria-label={`${closeLabel} nền`}
        className="rm-motion-backdrop absolute inset-0 cursor-default bg-foreground/45"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          "relative z-dialog flex max-h-[min(42rem,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-overlay border border-border bg-surface shadow-overlay-soft outline-none",
          mode === "modal" && "rm-motion-dialog",
          mode === "drawer" &&
            "rm-motion-drawer h-full max-h-none max-w-[min(28rem,100vw)] rounded-none rounded-l-overlay border-y-0 border-r-0 sm:max-h-[calc(100dvh-2rem)] sm:rounded-overlay sm:border sm:shadow-overlay-soft",
          className
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-heading-md font-bold tracking-tight text-foreground">
              {title}
            </h2>
            {description ? (
              <div id={descriptionId} className="mt-1 text-ui-sm leading-6 text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
          <IconButton label={closeLabel} variant="ghost" size="sm" onClick={onClose}>
            <Icon name="close" className="h-5 w-5" />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {actions ? (
          <footer className="flex flex-wrap justify-end gap-3 border-t border-border px-5 py-4 sm:px-6">
            {actions}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
