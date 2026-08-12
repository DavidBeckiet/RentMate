import { Suspense } from "react";
import { LoadingState } from "../../../components/ui/feedback-states";
import { FavoritesPage } from "../../../features/favorites/favorites-page";

export default function TenantFavoritesRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở trang tin đã lưu…" />}>
      <FavoritesPage />
    </Suspense>
  );
}
