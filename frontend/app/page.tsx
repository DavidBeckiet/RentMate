import type { Metadata } from "next";
import { HomePageExperience } from "../features/listings/home-page";

export const metadata: Metadata = {
  title: "RentMate — Chạm đúng nơi, sống đúng chất",
  description: "Khám phá RentMate và bắt đầu hành trình tìm một nơi ở phù hợp với nhịp sống của bạn."
};

export default function HomePage() {
  return <HomePageExperience />;
}
