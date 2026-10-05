import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = (__ENV.RENTMATE_BASE_URL || "http://host.docker.internal:4001").replace(/\/$/, "");
const listingId = __ENV.RENTMATE_PUBLIC_LISTING_ID || "";

export const options = {
  scenarios: {
    public_browse: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: __ENV.K6_RAMP_DURATION || "10s", target: Number(__ENV.K6_TARGET_VUS || 10) },
        { duration: __ENV.K6_HOLD_DURATION || "30s", target: Number(__ENV.K6_TARGET_VUS || 10) },
        { duration: "10s", target: 0 }
      ],
      gracefulRampDown: "5s"
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<750", "p(99)<1500"],
    checks: ["rate>0.99"]
  }
};

export default function () {
  const health = http.get(`${baseUrl}/api/health`, { tags: { flow: "health" } });
  check(health, { "health returns 200": (response) => response.status === 200 });

  const collection = http.get(`${baseUrl}/api/v1/listings?page=1&pageSize=20`, {
    tags: { flow: "public-search" }
  });
  check(collection, {
    "search returns 200": (response) => response.status === 200,
    "search response is JSON": (response) => response.headers["Content-Type"]?.includes("application/json") === true
  });

  if (listingId) {
    const detail = http.get(`${baseUrl}/api/v1/listings/${listingId}`, { tags: { flow: "public-detail" } });
    check(detail, { "known listing detail returns 200": (response) => response.status === 200 });
  }

  sleep(1);
}
