export const defaultBcryptCost = 12;
export const minimumBcryptCost = 4;
export const maximumBcryptCost = 31;

const maximumEmailLength = 320;
const minimumPasswordCharacters = 8;
const maximumPasswordBytes = 72;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9][0-9]{7,14}$/;

export interface AdminProvisioningInput {
  readonly email: string;
  readonly password: string;
  readonly phoneE164: string | null;
  readonly bcryptCost: number;
}

export class AdminProvisioningInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminProvisioningInputError";
  }
}

function readEmail(source: NodeJS.ProcessEnv): string {
  const email = source.RENTMATE_ADMIN_EMAIL?.trim().toLowerCase() ?? "";

  if (!email) {
    throw new AdminProvisioningInputError("RENTMATE_ADMIN_EMAIL is required.");
  }

  if (email.length > maximumEmailLength) {
    throw new AdminProvisioningInputError("Admin email must not exceed 320 characters.");
  }

  if (!emailPattern.test(email)) {
    throw new AdminProvisioningInputError("Admin email must use a valid email format.");
  }

  return email;
}

function readPassword(source: NodeJS.ProcessEnv): string {
  const password = source.RENTMATE_ADMIN_PASSWORD;

  if (password === undefined) {
    throw new AdminProvisioningInputError("RENTMATE_ADMIN_PASSWORD is required.");
  }

  if ([...password].length < minimumPasswordCharacters) {
    throw new AdminProvisioningInputError("Admin password must contain at least 8 characters.");
  }

  if (Buffer.byteLength(password, "utf8") > maximumPasswordBytes) {
    throw new AdminProvisioningInputError("Admin password must not exceed 72 UTF-8 bytes.");
  }

  return password;
}

function readPhone(source: NodeJS.ProcessEnv): string | null {
  const phone = source.RENTMATE_ADMIN_PHONE_E164?.trim() ?? "";

  if (!phone) {
    return null;
  }

  if (!phonePattern.test(phone)) {
    throw new AdminProvisioningInputError("Admin phone must use E.164 format.");
  }

  return phone;
}

function readBcryptCost(source: NodeJS.ProcessEnv): number {
  const rawCost = source.BCRYPT_COST?.trim();

  if (!rawCost) {
    return defaultBcryptCost;
  }

  const cost = Number(rawCost);
  if (!Number.isInteger(cost) || cost < minimumBcryptCost || cost > maximumBcryptCost) {
    throw new AdminProvisioningInputError(
      `BCRYPT_COST must be an integer between ${minimumBcryptCost} and ${maximumBcryptCost}.`
    );
  }

  return cost;
}

export function readAdminProvisioningInput(source: NodeJS.ProcessEnv = process.env): AdminProvisioningInput {
  return {
    email: readEmail(source),
    password: readPassword(source),
    phoneE164: readPhone(source),
    bcryptCost: readBcryptCost(source)
  };
}
