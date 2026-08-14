import http from "node:http";
import type { Request, Response } from "express";
import { createRm054BrowserFixture, rm054FrontendOrigin, type Rm054Preset } from "./helpers/rm054-browser-fixture.js";

const port = Number(process.env.PORT ?? "4100");

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("RM-054 browser server PORT must be a valid TCP port.");
}

function isLoopbackAddress(value: string | undefined): boolean {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

function isPreset(value: unknown): value is Rm054Preset {
  return value === "empty" || value === "public";
}

async function start(): Promise<void> {
  const fixture = createRm054BrowserFixture(process.env);
  await fixture.bootstrapFromCleanDatabase();
  const app = await fixture.createApp();

  app.post("/__rm054/reset", async (request: Request, response: Response) => {
    if (!isLoopbackAddress(request.socket.remoteAddress) || request.get("origin") !== rm054FrontendOrigin) {
      response.status(404).end();
      return;
    }
    const preset = request.body?.preset ?? "empty";
    if (!isPreset(preset)) {
      response.status(400).json({ error: "Invalid RM-054 test preset." });
      return;
    }
    try {
      response.status(200).json(await fixture.resetScenario(preset));
    } catch {
      response.status(500).json({ error: "RM-054 test reset failed." });
    }
  });

  const server = http.createServer(app);
  const close = async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await fixture.close();
  };

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  server.listen(port, "127.0.0.1");
}

void start();
