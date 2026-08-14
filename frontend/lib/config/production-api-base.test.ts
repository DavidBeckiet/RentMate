import { describe, expect, it } from "vitest";
import {
  ProductionApiBaseValidationError,
  validateProductionApiBase,
  validateProductionApiBaseForEnvironment
} from "./production-api-base";

describe("RM-055 production API base", () => {
  it("normalizes a valid HTTPS origin", () => {
    expect(validateProductionApiBase(" https://api.rentmate.example/ ")).toBe("https://api.rentmate.example");
  });

  it.each([
    ["missing", undefined],
    ["HTTP", "http://api.rentmate.example"],
    ["localhost", "https://localhost:4000"],
    ["loopback", "https://127.0.0.1:4000"],
    ["credentials", "https://user:password@api.rentmate.example"],
    ["query", "https://api.rentmate.example?mode=production"],
    ["hash", "https://api.rentmate.example#health"],
    ["path", "https://api.rentmate.example/api"],
    ["wildcard", "https://*.rentmate.example"],
    ["invalid URL", "not a URL"]
  ])("rejects an unsafe %s value", (_description, value) => {
    expect(() => validateProductionApiBase(value)).toThrow(ProductionApiBaseValidationError);
  });

  it("does not require a production API origin during development or tests", () => {
    expect(validateProductionApiBaseForEnvironment({ NODE_ENV: "development" })).toBeNull();
    expect(validateProductionApiBaseForEnvironment({ NODE_ENV: "test" })).toBeNull();
  });

  it("enforces validation for the production environment", () => {
    expect(() => validateProductionApiBaseForEnvironment({ NODE_ENV: "production" })).toThrow(
      /NEXT_PUBLIC_API_BASE_URL/
    );
    expect(
      validateProductionApiBaseForEnvironment({
        NODE_ENV: "production",
        NEXT_PUBLIC_API_BASE_URL: "https://api.rentmate.example"
      })
    ).toBe("https://api.rentmate.example");
  });
});
