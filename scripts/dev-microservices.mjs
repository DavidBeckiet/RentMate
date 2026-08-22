import { spawn } from "node:child_process";

const internalServiceToken = process.env.SERVICE_INTERNAL_TOKEN ?? "rentmate-local-internal-token";
const localFrontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

const frontendProcess = [
  "frontend",
  "npm.cmd",
  ["--prefix", "frontend", "run", "dev"],
  { ...process.env, FRONTEND_ORIGIN: localFrontendOrigin, NEXT_PUBLIC_API_BASE_URL: "http://localhost:4001" }
];

const localServiceProcesses = [
  ["backend", "npm.cmd", ["--prefix", "backend", "run", "dev"], { ...process.env, FRONTEND_ORIGIN: localFrontendOrigin }],
  [
    "identity",
    "npm.cmd",
    ["--prefix", "services/identity-service", "run", "dev"],
    {
      ...process.env,
      FRONTEND_ORIGIN: localFrontendOrigin,
      IDENTITY_SERVICE_PORT: "4100",
      SERVICE_INTERNAL_TOKEN: internalServiceToken
    }
  ],
  [
    "listing",
    "npm.cmd",
    ["--prefix", "services/listing-service", "run", "dev"],
    {
      ...process.env,
      FRONTEND_ORIGIN: localFrontendOrigin,
      LISTING_SERVICE_PORT: "4200",
      IDENTITY_SERVICE_URL: "http://localhost:4100",
      SERVICE_INTERNAL_TOKEN: internalServiceToken
    }
  ],
  [
    "engagement",
    "npm.cmd",
    ["--prefix", "services/engagement-service", "run", "dev"],
    {
      ...process.env,
      FRONTEND_ORIGIN: localFrontendOrigin,
      ENGAGEMENT_SERVICE_PORT: "4300",
      IDENTITY_SERVICE_URL: "http://localhost:4100",
      LISTING_SERVICE_URL: "http://localhost:4200",
      SERVICE_INTERNAL_TOKEN: internalServiceToken
    }
  ],
  [
    "gateway",
    "node",
    ["services/api-gateway/server.mjs"],
    {
      ...process.env,
      FRONTEND_ORIGIN: localFrontendOrigin,
      GATEWAY_PORT: "4001",
      IDENTITY_SERVICE_URL: "http://localhost:4100",
      LISTING_SERVICE_URL: "http://localhost:4200",
      ENGAGEMENT_SERVICE_URL: "http://localhost:4300",
      SERVICE_INTERNAL_TOKEN: internalServiceToken
    }
  ],
];

async function isGatewayAlreadyRunning() {
  try {
    const response = await fetch("http://localhost:4001/api/health");
    return response.ok;
  } catch {
    return false;
  }
}

const gatewayAlreadyRunning = await isGatewayAlreadyRunning();
const processDefinitions = gatewayAlreadyRunning ? [frontendProcess] : [...localServiceProcesses, frontendProcess];

if (gatewayAlreadyRunning) {
  console.log("Using the running gateway on http://localhost:4001; starting frontend only.");
} else {
  console.log("No running gateway detected; starting the local microservices stack.");
}

const processes = processDefinitions.map(([name, command, args, environment]) => {
  const child = spawn(command, args, {
    env: environment,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && signal === null) {
      process.exitCode = code ?? 1;
    }
  });
  return { name, child };
});

function stopAll() {
  for (const { child } of processes) {
    child.kill();
  }
}

process.once("SIGINT", () => {
  stopAll();
  process.exit();
});
process.once("SIGTERM", () => {
  stopAll();
  process.exit();
});
