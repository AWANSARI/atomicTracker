import type { DefaultSession } from "next-auth";

/**
 * Module augmentation for NextAuth v5.
 * Adds typed access to our refresh-token + error fields on the JWT and Session.
 */

declare module "next-auth" {
  interface Session {
    /** Set to "RefreshAccessTokenError" if Google rejected the refresh attempt. */
    error?: "RefreshAccessTokenError";
    /** Google OAuth access token. Server-side use only. */
    accessToken?: string;
    /** Google OAuth `sub` (stable user id). Used as identity for crypto key derivation. */
    googleSub?: string;
    user?: DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    access_token?: string;
    refresh_token?: string;
    /** Unix seconds when the access_token expires. */
    expires_at?: number;
    provider?: "google";
    error?: "RefreshAccessTokenError";
  }
}
