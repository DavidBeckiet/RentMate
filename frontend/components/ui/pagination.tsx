import { Button } from "./button";
import { Icon } from "./icon";

export interface PaginationProps {
  readonly ariaLabel: string;
  readonly page: number;
  readonly hasNextPage: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly compact?: boolean;
  readonly plain?: boolean;
  readonly variant?: "default" | "moderation";
  readonly className?: string;
}

export function Pagination({
  ariaLabel,
  page,
  hasNextPage,
  onPrevious,
  onNext,
  compact = false,
  plain = false,
  variant = "default",
  className = ""
}: PaginationProps) {
  if (page <= 1 && !hasNextPage) return null;

  if (variant === "moderation") {
    const controlClassName =
      "inline-grid h-11 w-11 shrink-0 place-items-center rounded-control border border-transparent text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-surface-subtle hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:text-muted-foreground/50 disabled:hover:border-transparent disabled:hover:bg-transparent motion-reduce:transition-none";

    return (
      <nav aria-label={ariaLabel} className={`mx-auto flex w-fit max-w-full items-center gap-1 py-1 ${className}`}>
        <button
          type="button"
          aria-label="Trang trước"
          className={controlClassName}
          disabled={page <= 1}
          onClick={onPrevious}
        >
          <Icon name="chevronDown" className="h-4 w-4 rotate-90" />
        </button>
        <span
          aria-current="page"
          aria-live="polite"
          className="inline-grid h-11 min-w-11 place-items-center rounded-control bg-primary-subtle px-2 font-display text-sm font-bold text-primary-hover"
        >
          <span className="sr-only">Trang </span>
          {page}
        </span>
        <button
          type="button"
          aria-label="Trang sau"
          className={controlClassName}
          disabled={!hasNextPage}
          onClick={onNext}
        >
          <Icon name="chevronDown" className="h-4 w-4 -rotate-90" />
        </button>
      </nav>
    );
  }

  const buttonClassName = compact
    ? "!min-h-11 !rounded-xl !px-3 !text-ui-xs !shadow-none hover:!translate-y-0 hover:!shadow-none"
    : undefined;

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex items-center justify-between gap-3 sm:gap-4 ${plain ? "py-2" : `rounded-card border border-border bg-surface ${compact ? "p-2.5" : "p-3"} shadow-surface`} ${className}`}
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
