"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode
} from "react";
import { cx } from "./class-names";

const menuItemClass =
  "flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2 text-left text-ui-sm font-semibold text-foreground transition-colors duration-fast hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus";

export interface DropdownMenuProps {
  readonly label: string;
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export function DropdownMenu({ label, trigger, children, className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || items.length === 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (index + 1) % items.length
            : (index - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="min-h-11 rounded-control border border-transparent px-3 text-ui-sm font-semibold text-foreground transition-colors duration-fast hover:border-border hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus"
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest<HTMLElement>('[role="menuitem"]')) setOpen(false);
          }}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 z-dropdown mt-2 min-w-48 rounded-card border border-border bg-surface p-2 shadow-raised"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export interface DropdownMenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly href?: string;
  readonly children: ReactNode;
}

export function DropdownMenuItem({ href, className, onClick, children, ...props }: DropdownMenuItemProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => onClick?.(event);
  if (href) {
    return (
      <Link role="menuitem" href={href} className={cx(menuItemClass, className)}>
        {children}
      </Link>
    );
  }
  return (
    <button
      {...props}
      role="menuitem"
      type={props.type ?? "button"}
      onClick={handleClick}
      className={cx(menuItemClass, className)}
    >
      {children}
    </button>
  );
}
