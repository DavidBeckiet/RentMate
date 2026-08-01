export const userRoles = ["TENANT", "LANDLORD", "ADMIN"] as const;

export type UserRole = (typeof userRoles)[number];

export interface AuthenticatedPrincipal {
  readonly userId: number;
  readonly role: UserRole;
}

export interface VerifiedSessionClaims {
  readonly userId: number;
  readonly role: UserRole;
}

export type SessionVerificationResult =
  | {
      readonly status: "invalid";
    }
  | {
      readonly status: "valid";
      readonly claims: unknown;
    };

export type VerifySessionToken = (token: string) => Promise<SessionVerificationResult>;

export interface AuthenticationAccount {
  readonly id: number;
  readonly role: UserRole;
  readonly isActive: boolean;
}

export type LoadAuthenticationAccount = (userId: number) => Promise<AuthenticationAccount | null>;

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && userRoles.some((role) => role === value);
}

export function isVerifiedSessionClaims(value: unknown): value is VerifiedSessionClaims {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const claims = value as Partial<VerifiedSessionClaims>;
  return (
    Number.isInteger(claims.userId) &&
    (claims.userId ?? 0) > 0 &&
    (claims.userId ?? 0) <= 2_147_483_647 &&
    isUserRole(claims.role)
  );
}
