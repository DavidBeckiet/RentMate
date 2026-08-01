import type { NextFunction, Request, Response } from "express";

const cookieNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function parseCookieHeader(header: string | undefined): Readonly<Record<string, string>> {
  const cookies = Object.create(null) as Record<string, string>;

  if (header) {
    for (const rawSegment of header.split(";")) {
      const segment = rawSegment.trim();
      const separatorIndex = segment.indexOf("=");

      if (separatorIndex <= 0) {
        continue;
      }

      const name = segment.slice(0, separatorIndex).trim();
      if (!cookieNamePattern.test(name) || Object.hasOwn(cookies, name)) {
        continue;
      }

      cookies[name] = segment.slice(separatorIndex + 1);
    }
  }

  return Object.freeze(cookies);
}

export function cookieParserMiddleware(request: Request, _response: Response, next: NextFunction): void {
  Object.defineProperty(request, "cookies", {
    configurable: false,
    enumerable: false,
    value: parseCookieHeader(request.headers.cookie),
    writable: false
  });

  next();
}
