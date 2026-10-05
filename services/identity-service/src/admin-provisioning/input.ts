const maximumEmailLength = 320;
const minimumPasswordCharacters = 8;
const maximumPasswordBytes = 72;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9][0-9]{7,14}$/;

export interface AdminProvisioningInput {
  readonly email: string;
  readonly password: string;
  readonly phone: string | null;
}

export class AdminProvisioningInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminProvisioningInputError";
  }
}

export function readAdminProvisioningInput(source: NodeJS.ProcessEnv = process.env): AdminProvisioningInput {
  const email = source.RENTMATE_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  if (!email) throw new AdminProvisioningInputError("RENTMATE_ADMIN_EMAIL is required.");
  if (email.length > maximumEmailLength || !emailPattern.test(email)) {
    throw new AdminProvisioningInputError("RENTMATE_ADMIN_EMAIL must contain a valid email address.");
  }

  const password = source.RENTMATE_ADMIN_PASSWORD;
  if (password === undefined || [...password].length < minimumPasswordCharacters) {
    throw new AdminProvisioningInputError("RENTMATE_ADMIN_PASSWORD must contain at least 8 characters.");
  }
  if (Buffer.byteLength(password, "utf8") > maximumPasswordBytes) {
    throw new AdminProvisioningInputError("RENTMATE_ADMIN_PASSWORD must not exceed 72 UTF-8 bytes.");
  }

  const normalizedPhone = source.RENTMATE_ADMIN_PHONE_E164?.trim() ?? "";
  if (normalizedPhone && !phonePattern.test(normalizedPhone)) {
    throw new AdminProvisioningInputError("RENTMATE_ADMIN_PHONE_E164 must use E.164 format.");
  }

  return Object.freeze({ email, password, phone: normalizedPhone || null });
}
