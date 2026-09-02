import type { Metadata } from "next";
import { HomePageExperience } from "../features/listings/home-page";

export const metadata: Metadata = {
  title: "RentMate — Tìm phòng, tìm người ở ghép",
  description: "Khám phá tin đăng công khai, tìm phòng theo khu vực và tìm người ở ghép phù hợp với nhịp sống của bạn."
};

export default function HomePage() {
  return <HomePageExperience />;
}
