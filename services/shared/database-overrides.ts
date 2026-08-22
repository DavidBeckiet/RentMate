const databaseEnvironmentKeys = [
  "HOST",
  "PORT",
  "NAME",
  "USER",
  "PASSWORD",
  "POOL_MAX",
  "CONNECTION_TIMEOUT_MS",
  "IDLE_TIMEOUT_MS"
] as const;

export function applyDatabaseOverrides(prefix: string, source: NodeJS.ProcessEnv = process.env): void {
  for (const suffix of databaseEnvironmentKeys) {
    const value = source[`${prefix}_DB_${suffix}`];
    if (value !== undefined) {
      process.env[`DB_${suffix}`] = value;
    }
  }
}
