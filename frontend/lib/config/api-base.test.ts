import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_API_GATEWAY_BASE_URL, resolveApiBaseUrl } from "./api-base";

const frontendRoot = basename(process.cwd()) === "frontend" ? process.cwd() : join(process.cwd(), "frontend");
const repositoryRoot = join(frontendRoot, "..");

describe("frontend API base resolver", () => {
  it("uses the local API Gateway as the non-production default", () => {
    expect(resolveApiBaseUrl(undefined, "development")).toBe("http://localhost:4001");
    expect(resolveApiBaseUrl(undefined, "test")).toBe("http://localhost:4001");
    expect(new URL(LOCAL_API_GATEWAY_BASE_URL).port).toBe("4001");
  });

  it("normalizes an explicitly configured Gateway origin", () => {
    expect(resolveApiBaseUrl(" http://localhost:4100/// ", "development")).toBe("http://localhost:4100");
  });

  it("requires a validated HTTPS origin in production", () => {
    expect(() => resolveApiBaseUrl(undefined, "production")).toThrow(/NEXT_PUBLIC_API_BASE_URL/);
    expect(resolveApiBaseUrl("https://api.rentmate.example/", "production")).toBe("https://api.rentmate.example");
  });

  it("keeps REST and SSE runtime modules free of direct service or compatibility URLs", () => {
    const runtimeSource = [
      readFileSync(join(frontendRoot, "lib/api/transport.ts"), "utf8"),
      readFileSync(join(frontendRoot, "lib/api/inquiry-realtime.ts"), "utf8")
    ].join("\n");

    expect(runtimeSource).not.toMatch(/localhost:4000/);
    expect(runtimeSource).not.toMatch(/localhost:400[234]/);
  });

  it("keeps the checked-in local environment example on the Gateway", () => {
    const environmentExample = readFileSync(join(repositoryRoot, ".env.example"), "utf8");

    expect(environmentExample).toContain("NEXT_PUBLIC_API_BASE_URL=http://localhost:4001");
    expect(environmentExample).not.toContain("NEXT_PUBLIC_API_BASE_URL=http://localhost:4000");
  });
});
