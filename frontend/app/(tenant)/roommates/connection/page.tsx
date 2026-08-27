import { Suspense } from "react";
import { LoadingState } from "../../../../components/ui/feedback-states";
import { RoommateConnectionPage } from "../../../../features/roommate/roommate-connection-page";

export default function RoommateConnectionRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang mở kết nối ở ghép…" />}>
      <RoommateConnectionPage />
    </Suspense>
  );
}
