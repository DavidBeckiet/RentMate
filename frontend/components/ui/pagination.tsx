import { Button } from "./button";

export interface PaginationProps {
  readonly ariaLabel: string;
  readonly page: number;
  readonly hasNextPage: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly className?: string;
}

export function Pagination({ ariaLabel, page, hasNextPage, onPrevious, onNext, className = "" }: PaginationProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={`flex items-center justify-between gap-3 rounded-card border border-rent-line bg-white p-3 sm:gap-4 ${className}`}
    >
      <Button variant="secondary" disabled={page <= 1} onClick={onPrevious}>
        Trang trước
      </Button>
      <span className="text-sm font-semibold text-rent-secondary" aria-live="polite">
        Trang {page}
      </span>
      <Button variant="secondary" disabled={!hasNextPage} onClick={onNext}>
        Trang sau
      </Button>
    </nav>
  );
}
