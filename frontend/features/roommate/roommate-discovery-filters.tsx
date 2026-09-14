"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Icon } from "../../components/ui/icon";
import styles from "./roommate-discovery.module.css";

export function DiscoveryFilters({
  children,
  count,
  hasFilters,
  onReset
}: Readonly<{
  children: ReactNode;
  count: number;
  hasFilters: boolean;
  onReset: () => void;
}>) {
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => {
      setMobile(media.matches);
      if (!media.matches) setOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open || !mobile) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (!dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus({ preventScroll: true });
    };
  }, [mobile, open]);

  return (
    <div className={styles.filtersSlot}>
      <button
        ref={triggerRef}
        className={styles.filterToggle}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span>
          <Icon name="sliders" className="h-5 w-5" /> Bộ lọc{count > 0 ? ` · ${count}` : ""}
        </span>
        <span>Điều chỉnh</span>
      </button>
      {!mobile ? <Card className={`rm-roommate-card-static ${styles.filters}`}>{children}</Card> : null}
      {mobile
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
                  <h2 id="roommate-filter-sheet-title">Lọc yêu cầu ở ghép</h2>
                  <button type="button" aria-label="Đóng bộ lọc" onClick={() => setOpen(false)}>
                    <Icon name="close" className="h-5 w-5" />
                  </button>
                </header>
                <div className={styles.sheetBody}>{children}</div>
                <footer className={styles.sheetActions}>
                  {hasFilters ? (
                    <button type="button" className={styles.resetFilters} onClick={onReset}>
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
