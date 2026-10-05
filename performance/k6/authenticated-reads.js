import http from "k6/http";
import { check, fail, sleep } from "k6";

const baseUrl = (__ENV.RENTMATE_BASE_URL || "http://host.docker.internal:4001").replace(/\/$/, "");
const frontendOrigin = __ENV.RENTMATE_FRONTEND_ORIGIN || "http://localhost:3000";

export const options = {
  scenarios: {
    authenticated_reads: {
      executor: "constant-vus",
      vus: Number(__ENV.K6_TARGET_VUS || 5),
      duration: __ENV.K6_HOLD_DURATION || "30s"
    }
  },
  thresholds: {
    "http_req_failed{flow:authenticated-read}": ["rate<0.01"],
    "http_req_duration{flow:authenticated-read}": ["p(95)<1000"],
    checks: ["rate>0.99"]
  }
};

export function setup() {
  if (!__ENV.RENTMATE_TENANT_EMAIL || !__ENV.RENTMATE_TENANT_PASSWORD) {
    fail("RENTMATE_TENANT_EMAIL and RENTMATE_TENANT_PASSWORD are required for authenticated load tests.");
  }
  return {
    email: __ENV.RENTMATE_TENANT_EMAIL,
    password: __ENV.RENTMATE_TENANT_PASSWORD
  };
}

export default function (credentials) {
  const login = http.post(`${baseUrl}/api/v1/auth/login`, JSON.stringify(credentials), {
    headers: { "Content-Type": "application/json", Origin: frontendOrigin },
    tags: { flow: "login" }
  });
  check(login, { "tenant login succeeds": (response) => response.status === 200 });
  if (login.status !== 200) return;

  for (const path of ["/api/v1/favorites?page=1&pageSize=20", "/api/v1/tenant/inquiries?page=1&pageSize=20"]) {
    const response = http.get(`${baseUrl}${path}`, {
      headers: { Origin: frontendOrigin },
      tags: { flow: "authenticated-read" }
    });
    check(response, { [`${path} returns 200`]: (result) => result.status === 200 });
  }
  sleep(1);
}
