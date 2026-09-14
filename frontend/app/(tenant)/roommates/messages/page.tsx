import { Suspense } from "react";
import { LoadingState } from "../../../../components/ui/feedback-states";
import { MessageInbox } from "../../../../features/contact/message-inbox";

export default function RoommateMessagesRoute() {
  return (
    <Suspense fallback={<LoadingState message="Đang tải tin nhắn ở ghép…" />}>
      <MessageInbox roommateOnly />
    </Suspense>
  );
}
