declare global {
  namespace Express {
    interface Request {
      readonly cookies: Readonly<Record<string, string>>;
      requestId: string;
    }
  }
}

export {};
