import { Suspense } from "react";
import { LoadingState } from "../../../components/ui/feedback-states";
import { RoommateDiscoveryPage } from "../../../features/roommate/roommate-discovery-page";

export default function RoommateDiscoveryRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở tìm người ở ghép…" />}>
      <RoommateDiscoveryPage />
    </Suspense>
  );
}
