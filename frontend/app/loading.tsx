import { Card } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

export default function RouteLoading() {
  return (
    <Card aria-label="Đang tải nội dung" role="status" className="mx-auto w-full max-w-4xl">
      <span className="sr-only">Đang tải nội dung…</span>
      <div className="space-y-4" aria-hidden="true">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-9 w-3/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <div className="grid gap-4 pt-4 sm:grid-cols-2">
          <Skeleton rounded="card" className="h-40" />
          <Skeleton rounded="card" className="h-40" />
        </div>
      </div>
    </Card>
  );
}
