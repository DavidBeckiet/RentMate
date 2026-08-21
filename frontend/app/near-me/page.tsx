import type { Metadata } from "next";
import { NearMePage } from "../../features/listings/near-me-page";

export const metadata: Metadata = {
  title: "Tìm phòng trọ gần bạn | Rentmate.vn",
  description: "Nhập tên trường học, bệnh viện, công ty... để tìm phòng trọ trong bán kính gần nhất cùng Rentmate.vn"
};

export default function Page() {
  return <NearMePage />;
}
