import type { Metadata } from "next";
import { RecentlyViewed } from "../../features/listings/recently-viewed";

export const metadata: Metadata = {
  title: "Phòng đã xem gần đây | RentMate",
  description: "Xem lại các phòng trọ bạn vừa khám phá trên RentMate."
};

export default function RecentlyViewedPage() {
  return <RecentlyViewed />;
}
