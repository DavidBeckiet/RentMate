import { app } from "./app.js";
import { env } from "./config/env.js";
import { checkDatabaseConnection, databasePool } from "./db/pool.js";

const server = app.listen(env.port, () => {
  console.log(`RentMate backend listening on http://localhost:${env.port}`);
});

void checkDatabaseConnection()
  .then(() => console.log("PostgreSQL connection verified."))
  .catch(() => console.warn("PostgreSQL is unavailable. The health endpoint will return 503 until it is ready."));

async function shutdown() {
  server.close();
  await databasePool.end();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
