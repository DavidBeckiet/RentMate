import { pathToFileURL } from "node:url";

const placeholderValues = new Set(["changeme", "change_me", "change-me", "placeholder", "replace_me", "replace-me"]);

export class ActiveDeploymentValidationError extends Error {
  constructor(issues) {
    super(`Active deployment configuration is invalid: ${issues.join("; ")}`);
    this.name = "ActiveDeploymentValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase();
  return (
    placeholderValues.has(normalized) ||
    normalized.startsWith("replace-with-") ||
    normalized.startsWith("your_") ||
    normalized.startsWith("your-") ||
    (normalized.startsWith("<") && normalized.endsWith(">"))
  );
}

function readRequired(source, key, issues) {
  const value = source[key]?.trim();
  if (!value) {
    issues.push(`${key} is required`);
    return "";
  }
  if (isPlaceholder(value)) issues.push(`${key} must not use a documented placeholder`);
  return value;
}

function isLocalHostname(hostname) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized === "host.docker.internal" ||
    normalized.startsWith("127.") ||
    normalized.endsWith(".local")
  );
}

function readProductionOrigin(source, key, issues) {
  const value = readRequired(source, key, issues);
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.hostname.includes("*") ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      isLocalHostname(parsed.hostname)
    ) {
      throw new Error("unsafe origin");
    }
    return parsed.origin;
  } catch {
    issues.push(`${key} must be a non-local absolute HTTPS origin`);
    return "";
  }
}

function readProductionUrl(source, key, issues) {
  const value = readRequired(source, key, issues);
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.hostname.includes("*") ||
      parsed.hash ||
      isLocalHostname(parsed.hostname)
    ) {
      throw new Error("unsafe URL");
    }
    return parsed.href;
  } catch {
    issues.push(`${key} must be a non-local absolute HTTPS URL`);
    return "";
  }
}

function readSecret(source, key, minimumBytes, issues) {
  const value = readRequired(source, key, issues);
  if (value && Buffer.byteLength(value, "utf8") < minimumBytes) {
    issues.push(`${key} must contain at least ${minimumBytes} UTF-8 bytes`);
  }
  return value;
}

function validateEmail(source, key, issues) {
  const value = readRequired(source, key, issues);
  if (value && (value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
    issues.push(`${key} must contain a valid email address`);
  }
  return value.toLowerCase();
}

function validateAccountPassword(source, key, issues) {
  const value = readRequired(source, key, issues);
  if (value && ([...value].length < 8 || Buffer.byteLength(value, "utf8") > 72)) {
    issues.push(`${key} must contain 8 characters and at most 72 UTF-8 bytes`);
  }
  return value;
}

export function validateActiveDeploymentEnvironment(source) {
  const issues = [];
  if (source.NODE_ENV?.trim() !== "production") issues.push("NODE_ENV must equal production");
  if (source.COOKIE_SECURE?.trim().toLowerCase() !== "true") issues.push("COOKIE_SECURE must equal true");

  const frontendOrigin = readProductionOrigin(source, "FRONTEND_ORIGIN", issues);
  const apiOrigin = readProductionOrigin(source, "NEXT_PUBLIC_API_BASE_URL", issues);
  const postgresPassword = readSecret(source, "POSTGRES_PASSWORD", 16, issues);
  const jwtSecret = readSecret(source, "JWT_SECRET", 32, issues);
  const internalToken = readSecret(source, "SERVICE_INTERNAL_TOKEN", 32, issues);

  if (jwtSecret && internalToken && jwtSecret === internalToken) {
    issues.push("JWT_SECRET and SERVICE_INTERNAL_TOKEN must be different secrets");
  }

  for (const key of [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "NOMINATIM_USER_AGENT",
    "DEPLOYMENT_ENVIRONMENT",
    "RENTMATE_RELEASE_VERSION"
  ]) {
    readRequired(source, key, issues);
  }

  if (["local", "development", "test"].includes(source.DEPLOYMENT_ENVIRONMENT?.trim().toLowerCase())) {
    issues.push("DEPLOYMENT_ENVIRONMENT must identify a non-local deployment");
  }
  if (source.RENTMATE_RELEASE_VERSION?.trim().toLowerCase() === "development") {
    issues.push("RENTMATE_RELEASE_VERSION must identify an immutable release");
  }
  const releaseVersion = source.RENTMATE_RELEASE_VERSION?.trim() ?? "";
  if (releaseVersion && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(releaseVersion)) {
    issues.push("RENTMATE_RELEASE_VERSION must also be a safe immutable image tag");
  }
  const imageTag = readRequired(source, "RENTMATE_IMAGE_TAG", issues);
  if (imageTag && imageTag !== releaseVersion) {
    issues.push("RENTMATE_IMAGE_TAG must exactly match RENTMATE_RELEASE_VERSION");
  }
  const sourceRevision = readRequired(source, "RENTMATE_SOURCE_REVISION", issues).toLowerCase();
  if (sourceRevision && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sourceRevision)) {
    issues.push("RENTMATE_SOURCE_REVISION must be an exact 40- or 64-character Git revision");
  }

  const googleValues = [
    source.GOOGLE_OAUTH_CLIENT_ID?.trim(),
    source.GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
    source.GOOGLE_OAUTH_REDIRECT_URI?.trim()
  ];
  const configuredGoogleValues = googleValues.filter(Boolean).length;
  if (configuredGoogleValues > 0 && configuredGoogleValues < googleValues.length) {
    issues.push("Google OAuth configuration must provide client ID, client secret, and redirect URI together");
  }
  if (configuredGoogleValues === googleValues.length) {
    readRequired(source, "GOOGLE_OAUTH_CLIENT_ID", issues);
    readRequired(source, "GOOGLE_OAUTH_CLIENT_SECRET", issues);
    readProductionUrl(source, "GOOGLE_OAUTH_REDIRECT_URI", issues);
  }

  const adminProvisioningConfigured = [
    source.RENTMATE_ADMIN_EMAIL,
    source.RENTMATE_ADMIN_PASSWORD,
    source.RENTMATE_ADMIN_PHONE_E164
  ].some((value) => value?.trim());
  if (adminProvisioningConfigured) {
    validateEmail(source, "RENTMATE_ADMIN_EMAIL", issues);
    validateAccountPassword(source, "RENTMATE_ADMIN_PASSWORD", issues);
    const phone = source.RENTMATE_ADMIN_PHONE_E164?.trim();
    if (phone && !/^\+[1-9][0-9]{7,14}$/.test(phone)) {
      issues.push("RENTMATE_ADMIN_PHONE_E164 must use E.164 format");
    }
  }

  const authenticatedSmokeValue = source.RENTMATE_SMOKE_REQUIRE_AUTHENTICATED?.trim().toLowerCase();
  if (authenticatedSmokeValue && !["true", "false"].includes(authenticatedSmokeValue)) {
    issues.push("RENTMATE_SMOKE_REQUIRE_AUTHENTICATED must equal true or false");
  }
  const smokeKeys = [
    ["RENTMATE_SMOKE_TENANT_EMAIL", "RENTMATE_SMOKE_TENANT_PASSWORD"],
    ["RENTMATE_SMOKE_LANDLORD_EMAIL", "RENTMATE_SMOKE_LANDLORD_PASSWORD"],
    ["RENTMATE_SMOKE_ADMIN_EMAIL", "RENTMATE_SMOKE_ADMIN_PASSWORD"]
  ];
  const authenticatedSmokeConfigured =
    authenticatedSmokeValue === "true" || smokeKeys.flat().some((key) => source[key]?.trim());
  if (authenticatedSmokeConfigured) {
    for (const [emailKey, passwordKey] of smokeKeys) {
      validateEmail(source, emailKey, issues);
      validateAccountPassword(source, passwordKey, issues);
    }
  }
  if (source.RENTMATE_SMOKE_ALLOW_LOCAL?.trim().toLowerCase() !== "false") {
    issues.push("RENTMATE_SMOKE_ALLOW_LOCAL must equal false in production");
  }

  if (issues.length > 0) throw new ActiveDeploymentValidationError(issues);

  return Object.freeze({
    frontendOrigin,
    apiOrigin,
    releaseVersion,
    sourceRevision,
    googleOAuthEnabled: configuredGoogleValues === googleValues.length,
    authenticatedSmokeRequired: authenticatedSmokeValue === "true",
    validatedSecretCount: [postgresPassword, jwtSecret, internalToken].filter(Boolean).length
  });
}

export function runActiveDeploymentValidation(source = process.env) {
  const result = validateActiveDeploymentEnvironment(source);
  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      message: "Active deployment configuration validation passed",
      googleOAuthEnabled: result.googleOAuthEnabled,
      authenticatedSmokeRequired: result.authenticatedSmokeRequired,
      validatedSecretCount: result.validatedSecretCount,
      externalConnectivityChecked: false
    })}\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runActiveDeploymentValidation();
  } catch (error) {
    const reason =
      error instanceof ActiveDeploymentValidationError ? error.message : "Unexpected deployment validation error";
    process.stderr.write(`${JSON.stringify({ level: "error", message: reason })}\n`);
    process.exitCode = 1;
  }
}
