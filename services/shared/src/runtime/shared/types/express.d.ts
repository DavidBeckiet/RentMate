import type { AuthenticatedPrincipal } from "./authentication.js";

declare global {
  namespace Express {
    interface Request {
      readonly auth?: AuthenticatedPrincipal;
      readonly cookies: Readonly<Record<string, string>>;
      requestId: string;
    }
  }
}

export {};
