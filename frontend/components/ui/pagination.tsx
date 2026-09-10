import { Button } from "./button";
import { Icon } from "./icon";

export interface PaginationProps {
  readonly ariaLabel: string;
  readonly page: number;
  readonly hasNextPage: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly compact?: boolean;
  readonly className?: string;
}

export function Pagination({
  ariaLabel,
  page,
  hasNextPage,
  onPrevious,
  onNext,
  compact = false,
  className = ""
}: PaginationProps) {
  const buttonClassName = compact
    ? "!min-h-11 !rounded-xl !px-3 !text-ui-xs !shadow-none hover:!translate-y-0 hover:!shadow-none"
    : undefined;

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex items-center justify-between gap-3 rounded-card border border-border bg-surface ${compact ? "p-2.5" : "p-3"} shadow-surface sm:gap-4 ${className}`}
    >
      <Button
        variant="secondary"
        size={compact ? "sm" : "md"}
        className={buttonClassName}
        disabled={page <= 1}
        onClick={onPrevious}
      >
        {compact ? (
          <>
            <Icon name="arrow" className="h-4 w-4 rotate-180" />
            <span>Trước</span>
          </>
        ) : (
          "Trang trước"
        )}
      </Button>
      <span className="font-display text-sm font-bold text-rent-secondary" aria-live="polite">
        {compact ? (
          <>
            <span className="sr-only">Trang </span>
            {page}
          </>
        ) : (
          `Trang ${page}`
        )}
      </span>
      <Button
        variant="secondary"
        size={compact ? "sm" : "md"}
        className={buttonClassName}
        disabled={!hasNextPage}
        onClick={onNext}
      >
        {compact ? (
          <>
            <span>Sau</span>
            <Icon name="arrow" className="h-4 w-4" />
          </>
        ) : (
          "Trang sau"
        )}
      </Button>
    </nav>
  );
}
