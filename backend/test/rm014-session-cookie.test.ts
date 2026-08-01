import express, { type Response } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionCookieService, type SessionCookieService } from "../src/modules/auth/session-cookie.js";
import { sessionCookieName } from "../src/shared/types/authentication.js";

const fixedNowMilliseconds = Date.UTC(2030, 0, 2, 3, 4, 5);
const fakeToken = "fake.rm014.signed-token";

interface ParsedCookie {
  readonly name: string;
  readonly value: string;
  readonly attributes: ReadonlyMap<string, string | true>;
}

function parseCookie(header: string): ParsedCookie {
  const segments = header.split(";").map((segment) => segment.trim());
  const pair = segments.shift() ?? "";
  const separatorIndex = pair.indexOf("=");
  const attributes = new Map<string, string | true>();

  for (const segment of segments) {
    const attributeSeparator = segment.indexOf("=");
    if (attributeSeparator === -1) {
      attributes.set(segment.toLowerCase(), true);
    } else {
      attributes.set(segment.slice(0, attributeSeparator).toLowerCase(), segment.slice(attributeSeparator + 1));
    }
  }

  return {
    name: pair.slice(0, separatorIndex),
    value: pair.slice(separatorIndex + 1),
    attributes
  };
}

function cookieApp(secure: boolean, action: "set" | "clear"): express.Express {
  const app = express();
  const service = createSessionCookieService({ secure });

  app.get("/probe", (_incomingRequest, response) => {
    if (action === "set") {
      service.set(response, fakeToken);
    } else {
      service.clear(response);
    }
    response.status(204).end();
  });

  return app;
}

function singleCookieHeader(response: request.Response): string {
  const headers = response.headers["set-cookie"];
  expect(headers).toHaveLength(1);
  return headers![0]!;
}

function compileTimeFrozenOptions(service: SessionCookieService, response: Response): void {
  // @ts-expect-error RM-014 callers cannot supply cookie options.
  service.set(response, fakeToken, { domain: "example.com" });
  // @ts-expect-error RM-014 callers cannot supply cookie options.
  service.clear(response, { sameSite: "none" });
}
void compileTimeFrozenOptions;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RM-014 session cookie set helper", () => {
  it.each([
    ["development", false],
    ["production", true]
  ] as const)("sets exact host-only attributes in %s", async (_environment, secure) => {
    vi.spyOn(Date, "now").mockReturnValue(fixedNowMilliseconds);
    const response = await request(cookieApp(secure, "set")).get("/probe");
    const parsed = parseCookie(singleCookieHeader(response));

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(response.text).not.toContain(fakeToken);
    expect(parsed.name).toBe(sessionCookieName);
    expect(parsed.value).toBe(fakeToken);
    expect(parsed.attributes.get("httponly")).toBe(true);
    expect(parsed.attributes.get("samesite")).toBe("Lax");
    expect(parsed.attributes.get("path")).toBe("/");
    expect(parsed.attributes.get("max-age")).toBe("7200");
    expect(new Date(parsed.attributes.get("expires") as string).getTime()).toBe(fixedNowMilliseconds + 7_200_000);
    expect(parsed.attributes.has("domain")).toBe(false);
    expect(parsed.attributes.has("secure")).toBe(secure);
  });

  it("rejects a blank token before touching the response and never echoes it", () => {
    const service = createSessionCookieService({ secure: false });
    const response = { cookie: vi.fn() } as unknown as Response;
    const privateBlankToken = "   ";

    expect(() => service.set(response, privateBlankToken)).toThrowError("Session token is required.");
    expect(response.cookie).not.toHaveBeenCalled();
    try {
      service.set(response, privateBlankToken);
    } catch (error) {
      expect(String(error)).not.toContain(JSON.stringify(privateBlankToken));
    }
  });

  it("rejects invalid static secure configuration", () => {
    expect(() => createSessionCookieService({ secure: "true" as unknown as boolean })).toThrowError(
      "secure configuration must be a boolean"
    );
  });
});

describe("RM-014 session cookie clear helper", () => {
  it.each([
    ["development", false],
    ["production", true]
  ] as const)("clears with matching host-only attributes in %s", async (_environment, secure) => {
    const response = await request(cookieApp(secure, "clear"))
      .get("/probe")
      .set("Cookie", `${sessionCookieName}=malformed-or-expired-token`);
    const parsed = parseCookie(singleCookieHeader(response));

    expect(response.status).toBe(204);
    expect(parsed.name).toBe(sessionCookieName);
    expect(parsed.value).toBe("");
    expect(parsed.attributes.get("httponly")).toBe(true);
    expect(parsed.attributes.get("samesite")).toBe("Lax");
    expect(parsed.attributes.get("path")).toBe("/");
    expect(parsed.attributes.has("domain")).toBe(false);
    expect(parsed.attributes.has("secure")).toBe(secure);
    expect(parsed.attributes.has("max-age")).toBe(false);
    expect(new Date(parsed.attributes.get("expires") as string).getTime()).toBeLessThan(Date.now());
  });

  it("clears identically without an existing request cookie", async () => {
    const response = await request(cookieApp(false, "clear")).get("/probe");
    const parsed = parseCookie(singleCookieHeader(response));

    expect(response.status).toBe(204);
    expect(parsed.name).toBe(sessionCookieName);
    expect(parsed.value).toBe("");
    expect(parsed.attributes.has("max-age")).toBe(false);
    expect(new Date(parsed.attributes.get("expires") as string).getTime()).toBeLessThan(Date.now());
  });
});
