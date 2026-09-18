"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import styles from "./roommate-discovery.module.css";

export function DiscoveryFilters({
  children,
  count,
  hasFilters,
  onReset,
  primaryControl,
  secondaryAction
}: Readonly<{
  children: ReactNode;
  count: number;
  hasFilters: boolean;
  onReset: () => void;
  primaryControl: ReactNode;
  secondaryAction?: ReactNode;
}>) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      document.body.style.overflow = previousOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <div className={styles.filtersSlot}>
      <div className={styles.filterBar}>
        {primaryControl}
        <div className={styles.filterBarActions}>
          {secondaryAction}
          <button
            ref={triggerRef}
            className={styles.filterToggle}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Icon name="sliders" className="h-4 w-4" />
            <span>Bộ lọc{count > 0 ? ` (${count})` : ""}</span>
          </button>
        </div>
      </div>
      {mounted
        ? createPortal(
            <dialog
              ref={dialogRef}
              className={styles.filterSheet}
              aria-labelledby="roommate-filter-sheet-title"
              onCancel={() => setOpen(false)}
              onClose={() => setOpen(false)}
              onSubmit={() => setOpen(false)}
              onClick={(event) => {
                if (event.target === event.currentTarget) setOpen(false);
              }}
            >
              <div className={styles.sheetContent}>
                <header className={styles.sheetHeader}>
                  <div>
                    <p className="rm-roommate-section-label">BỘ LỌC TÌM KIẾM</p>
                    <h2 id="roommate-filter-sheet-title">Tìm người phù hợp</h2>
                    <p>Chỉ chọn những điều thực sự quan trọng với bạn.</p>
                  </div>
                  <button type="button" aria-label="Đóng bộ lọc" onClick={() => setOpen(false)}>
                    <Icon name="close" className="h-5 w-5" />
                  </button>
                </header>
                <div className={styles.sheetBody}>{children}</div>
                <footer className={styles.sheetActions}>
                  {hasFilters ? (
                    <button
                      type="button"
                      className={styles.resetFilters}
                      onClick={() => {
                        onReset();
                        setOpen(false);
                      }}
                    >
                      Xóa bộ lọc
                    </button>
                  ) : null}
                  <Button type="submit" form="discovery-filter-form">
                    Xem kết quả
                  </Button>
                </footer>
              </div>
            </dialog>,
            document.body
          )
        : null}
    </div>
  );
}
