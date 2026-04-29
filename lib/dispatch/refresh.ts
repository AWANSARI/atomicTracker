import "server-only";

/**
 * Mint a fresh Google access token from a stored refresh token.
 *
 * Used by /api/dispatch/[token] which has no live session — the dispatch
 * payload carries the refresh_token, we trade it for an access_token at
 * call time, then act on Drive/Calendar.
 *
 * Duplicates auth.ts's internal refreshGoogleAccessToken on purpose:
 * auth.ts is NextAuth-specific (returns the JWT-shaped fields) and pulling
 * it into a non-NextAuth path would muddle module ownership.
 */

export type RefreshResult = {
  accessToken: string;
  /** Unix seconds when the access_token expires. */
  expiresAt: number;
  /** Google may rotate the refresh token. Caller should persist if changed. */
  refreshToken?: string;
};

export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<RefreshResult> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET not configured");
  }
  if (!refreshToken) {
    throw new Error("refreshGoogleAccessToken: empty refresh token");
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
    cache: "no-store",
  });

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Google token refresh failed: ${response.status} (non-JSON body)`);
  }

  if (!response.ok) {
    // Don't leak the refresh token in errors — Google echoes nothing sensitive
    // here, but we keep the body redacted just in case.
    const safeBody = JSON.stringify(json).replace(refreshToken, "***");
    throw new Error(`Google token refresh failed: ${response.status} ${safeBody}`);
  }

  const data = json as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!data.access_token || typeof data.expires_in !== "number") {
    throw new Error("Google token refresh succeeded but response was malformed");
  }

  return {
    accessToken: data.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    refreshToken: data.refresh_token,
  };
}
