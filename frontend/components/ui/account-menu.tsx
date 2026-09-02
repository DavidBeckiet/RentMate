"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { UserProfile } from "../../types/api";
import { accountInitials, accountPrimaryIdentity, accountRoleLabels } from "./account-identity";
import { Icon } from "./icon";

const menuItemClass =
  "flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2 text-left text-ui-sm font-semibold text-foreground transition-colors duration-fast hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus";

function linksFor(user: UserProfile) {
  if (user.role === "TENANT")
    return [
      { href: "/profile", label: "Hồ sơ của tôi", icon: "user" as const },
      { href: "/notifications", label: "Thông báo", icon: "bell" as const }
    ];
  if (user.role === "LANDLORD")
    return [
      { href: "/landlord/profile", label: "Hồ sơ", icon: "user" as const },
      { href: "/landlord", label: "Không gian cho thuê", icon: "building" as const },
      { href: "/notifications", label: "Thông báo", icon: "bell" as const }
    ];
  return [];
}

export function AccountMenu({
  user,
  logoutPending,
  onLogout
}: Readonly<{ user: UserProfile; logoutPending: boolean; onLogout: () => void }>) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const focusItem = (which: "first" | "last") => {
    requestAnimationFrame(() => {
      const items = rootRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])");
      (which === "first" ? items?.[0] : items?.[items.length - 1])?.focus();
    });
  };
  const openAndFocus = (which: "first" | "last" = "first") => {
    setOpen(true);
    focusItem(which);
  };
  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAndFocus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAndFocus("last");
    }
  };
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
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
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
        className="flex min-h-11 max-w-56 cursor-pointer items-center gap-2 rounded-control border border-transparent px-2 text-left transition-colors duration-fast hover:border-border hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus"
      >
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-subtle font-display text-ui-xs font-bold text-primary-hover"
        >
          {accountInitials(user)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ui-sm font-semibold text-foreground">
            {accountPrimaryIdentity(user)}
          </span>
          <span className="block truncate text-ui-xs text-muted-foreground">{accountRoleLabels[user.role]}</span>
        </span>
        <Icon
          name="chevronDown"
          className={`h-4 w-4 shrink-0 transition-transform duration-fast ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          id={panelId}
          role="menu"
          aria-label="Tài khoản"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-dropdown mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-2 shadow-raised"
        >
          <div className="border-b border-border px-3 py-3">
            <p className="break-words font-semibold text-foreground">{accountPrimaryIdentity(user)}</p>
            <p className="mt-1 break-all text-ui-xs text-muted-foreground">{user.email}</p>
          </div>
          <div className="py-2">
            {linksFor(user).map((item) => (
              <Link key={item.href} role="menuitem" href={item.href} className={menuItemClass}>
                <Icon name={item.icon} className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
            <button role="menuitem" type="button" disabled={logoutPending} onClick={onLogout} className={menuItemClass}>
              <Icon name="logout" className="h-5 w-5" />
              {logoutPending ? "Đang đăng xuất…" : "Đăng xuất"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
