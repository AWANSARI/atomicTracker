import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";
import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";

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
     * Session callback shapes what the auth() helper returns on the server.
     *
     * We expose the access_token and the Google `sub` here so server
     * components and server actions can call Google APIs on behalf of the
     * user. Refresh token is intentionally NOT exposed — the jwt() callback
     * handles refreshing.
     *
     * IMPORTANT: do NOT call useSession() and read access_token from a
     * client component. We avoid useSession() entirely in this codebase
     * for that reason. All auth checks happen via auth() server-side.
     */
    async session({ session, token }) {
      session.error = token.error as Session["error"];
      session.accessToken = token.access_token as string | undefined;
      session.googleSub = token.sub as string | undefined;
      return session;
    },
  },
  pages: {
    // Use NextAuth's default sign-in page for now; we'll customize in a later commit.
    error: "/auth-error",
  },
});

export type { Session };

/**
 * Server-only helper: decode the encrypted JWT cookie and return the Google
 * refresh_token stored on it.
 *
 * The session callback intentionally does NOT expose `refresh_token` — any
 * client using `auth()` could otherwise read it. This helper exists only for
 * a privileged path (the Claude Code Routine setup endpoint) that needs to
 * embed the refresh token into a long-lived dispatch token.
 *
 * Returns null if no JWT cookie is present, the cookie can't be decoded, or
 * the token does not carry a refresh_token.
 *
 * IMPORTANT: never log the return value, never expose it on a Session, never
 * pass it to a client component. Use it inline and discard.
 */
export async function getCurrentRefreshToken(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  try {
    // Auth.js v5 uses these cookie names depending on environment. getToken
    // checks the right one automatically when secureCookie is the default.
    const cookieStore = await cookies();
    // Adapter: getToken expects a Next.js request — we shim a minimal one
    // from cookies() so this works inside server actions / route handlers.
    const token = await getToken({
      // Reconstruct just enough of the request shape getToken needs.
      req: {
        cookies: {
          get: (name: string) => {
            const c = cookieStore.get(name);
            return c ? { name: c.name, value: c.value } : undefined;
          },
        },
        headers: new Headers(),
      } as unknown as Parameters<typeof getToken>[0]["req"],
      secret,
      // Auth.js v5 default cookie name is "authjs.session-token" (or the
      // __Secure-* variant on https). Pass salt explicitly so JWE decrypt
      // works in either environment.
      salt:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      cookieName:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      secureCookie: process.env.NODE_ENV === "production",
    });
    const rt = (token as { refresh_token?: unknown } | null)?.refresh_token;
    return typeof rt === "string" && rt.length > 0 ? rt : null;
  } catch {
    return null;
  }
}
