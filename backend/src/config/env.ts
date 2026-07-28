import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

function readPort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  port: readPort(process.env.PORT, 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
  database: {
    host: process.env.DB_HOST ?? "localhost",
    port: readPort(process.env.DB_PORT, 5432),
    database: process.env.DB_NAME ?? "rentmate",
    user: process.env.DB_USER ?? "rentmate",
    password: process.env.DB_PASSWORD ?? "rentmate_dev_password"
  }
};
