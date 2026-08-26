import type { Metadata } from "next";
import { HelpCenter } from "../../features/help/help-center";

export const metadata: Metadata = {
  title: "Trung tâm trợ giúp | RentMate",
  description: "FAQ và hướng dẫn thuê phòng an toàn trên RentMate."
};

export default function HelpPage() {
  return <HelpCenter />;
}
