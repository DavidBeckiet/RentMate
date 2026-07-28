import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { checkDatabaseConnection } from "./db/pool.js";

export const app = express();

app.use(
  cors({
    origin: env.frontendOrigin
  })
);
app.use(express.json());

app.get("/api/health", async (_request, response) => {
  try {
    await checkDatabaseConnection();
    response.status(200).json({ status: "ok", database: "connected" });
  } catch {
    response.status(503).json({ status: "error", database: "unavailable" });
  }
});
