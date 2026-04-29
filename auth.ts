import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Google OAuth scopes we request:
 *  - openid email profile           — identity (Google `sub` is our stable user id)
 *  - drive.file                     — least-privilege Drive: only files the app creates
 *  - calendar.events                — least-privilege Calendar: only events the app creates
 */
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

/**
 * Refresh a Google access token using the stored refresh token.
 * Called from the JWT callback when the access token has expired.
 */
async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(
      `Google token refresh failed: ${response.status} ${JSON.stringify(json)}`,
    );
  }
  return json as { access_token: string; expires_in: number; refresh_token?: string };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  // Auth.js v5 trusts the host on Vercel by default; explicit for clarity.
  trustHost: true,
  providers: [
    Google({
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          // offline + consent ensures we receive a refresh_token (only sent on first consent)
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
        },
      },
    }),
  ],
  callbacks: {
    /**
     * JWT callback runs on every auth.* call. We use it to:
     *  1. Persist Google's access/refresh tokens on first sign-in
     *  2. Return existing token if still fresh (60s buffer)
     *  3. Refresh the access token using the refresh token if expired
     */
    async jwt({ token, account }) {
      // First sign-in — `account` is present
      if (account && account.provider === "google") {
        return {
          ...token,
          access_token: account.access_token as string | undefined,
          refresh_token: account.refresh_token as string | undefined,
          expires_at: account.expires_at as number | undefined,
          provider: "google",
        };
      }

      const expiresAt = token.expires_at as number | undefined;
      if (expiresAt && Date.now() < (expiresAt - 60) * 1000) {
        // Still valid (with 60s safety buffer)
        return token;
      }

      // Expired — try to refresh
      const refreshToken = token.refresh_token as string | undefined;
      if (!refreshToken) {
        return { ...token, error: "RefreshAccessTokenError" as const };
      }

      try {
        const refreshed = await refreshGoogleAccessToken(refreshToken);
        return {
          ...token,
          access_token: refreshed.access_token,
          expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
          // Google may rotate the refresh token; fall back to the old one if not
          refresh_token: refreshed.refresh_token ?? refreshToken,
          error: undefined,
        };
      } catch (err) {
        console.error("[auth] refresh failed:", err);
        return { ...token, error: "RefreshAccessTokenError" as const };
      }
    },

    /**
     * Session callback shapes what the client sees.
     * We deliberately do NOT expose access/refresh tokens to the client —
     * server actions and route handlers can still read them via auth().
     */
    async session({ session, token }) {
      session.error = token.error as Session["error"];
      return session;
    },
  },
  pages: {
    // Use NextAuth's default sign-in page for now; we'll customize in a later commit.
    error: "/auth-error",
  },
});

export type { Session };
