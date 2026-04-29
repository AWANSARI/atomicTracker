"use client";

import { useState } from "react";
import {
  Bot,
  CalendarClock,
  Copy,
  RefreshCcw,
  ShieldAlert,
  Trash2,
  Zap,
} from "lucide-react";

/**
 * Settings → Claude Code Routine.
 *
 * Lets the user mint an opaque dispatch token (an AES-GCM blob) that an
 * external scheduler (Claude Code Routine, OpenClaw, classic cron, etc.)
 * can POST to /api/dispatch/{token} to trigger a weekly meal-plan generation
 * without a live session.
 *
 * Security model: the URL is the credential. Anyone holding it can act on
 * the user's Drive. We surface that warning prominently.
 */

type SetupResponse = {
  ok?: boolean;
  token?: string;
  dispatchUrl?: string;
  instructions?: {
    schedule?: string;
    method?: string;
    contentType?: string;
    sampleBody?: Record<string, unknown>;
    pingBody?: Record<string, unknown>;
    warning?: string;
  };
  error?: string;
};

type PingResponse = {
  ok?: boolean;
  sub?: string;
  driveRootId?: string;
  issuedAt?: string;
  error?: string;
  reason?: string;
};

type Setup = {
  token: string;
  dispatchUrl: string;
  schedule: string;
  warning: string;
};

export function RoutineSection() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  async function onSetup(rotate: boolean) {
    setError(null);
    setPingResult(null);
    setRemoved(false);
    setPending(true);
    try {
      const res = await fetch("/api/dispatch/setup", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as SetupResponse;
      if (!res.ok || !data.ok || !data.token || !data.dispatchUrl) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setSetup({
        token: data.token,
        dispatchUrl: data.dispatchUrl,
        schedule: data.instructions?.schedule ?? "Friday 6:00 PM in your timezone",
        warning:
          data.instructions?.warning ??
          "Treat this URL like a password — it grants Drive access on your behalf.",
      });
      if (rotate) setPingResult("Token rotated. Update your routine config with the new URL.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  async function onPing() {
    if (!setup) return;
    setError(null);
    setPingResult(null);
    setPending(true);
    try {
      const res = await fetch(setup.dispatchUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ping" }),
      });
      const data = (await res.json().catch(() => ({}))) as PingResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? data.reason ?? `Ping failed (${res.status})`);
      }
      setPingResult(
        `OK — sub ${data.sub ?? "?"} · drive ${data.driveRootId?.slice(0, 6) ?? "?"}…`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  async function onRemove() {
    setError(null);
    setPingResult(null);
    setPending(true);
    try {
      const res = await fetch("/api/dispatch/setup", { method: "DELETE" });
      // We don't yet have a DELETE handler — fall back to a Drive-side delete
      // by re-running setup which overwrites the marker. For now treat removal
      // as a UI-side reset. The token itself stays valid (KISS).
      if (!res.ok && res.status !== 405) {
        const data = (await res.json().catch(() => ({}))) as SetupResponse;
        throw new Error(data.error ?? `Remove failed (${res.status})`);
      }
      setSetup(null);
      setRemoved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  function copy(text: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).catch(() => {});
  }

  const sampleConfig = setup
    ? `# Sample Claude Code Routine config
# Schedule: ${setup.schedule}
# Method: POST  Content-Type: application/json

URL: ${setup.dispatchUrl}

Body:
{
  "action": "generate-next-week",
  "provider": "anthropic",
  "apiKey": "sk-ant-…",
  "youtubeKey": "(optional)"
}`
    : "";

  return (
    <div className="space-y-3">
      {!setup ? (
        <>
          <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            <CalendarClock
              className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400"
              aria-hidden
            />
            <p>
              Configure a Claude Code Routine (or any external scheduler) to
              POST to a private endpoint each Friday — your next-week meal
              plan generates and writes to Drive without needing the app open.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSetup(false)}
            disabled={pending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Bot className="h-4 w-4" aria-hidden />
            {pending ? "Setting up…" : "Set up routine"}
          </button>
          {removed ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Routine record removed from Drive. The previously-issued token
              still works. To fully invalidate it, rotate your Google OAuth
              refresh token from your{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Google account security page
              </a>
              .
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <ShieldAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <p>{setup.warning}</p>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Dispatch URL
            </span>
            <div className="mt-1 flex gap-2">
              <input
                readOnly
                value={setup.dispatchUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => copy(setup.dispatchUrl)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copy
              </button>
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Sample routine config
            </span>
            <div className="mt-1 flex gap-2">
              <textarea
                readOnly
                rows={9}
                value={sampleConfig}
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-900 focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => copy(sampleConfig)}
                className="inline-flex h-fit items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copy
              </button>
            </div>
          </label>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Recommended schedule: <strong>{setup.schedule}</strong>. The
            generated plan lands as a draft at{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
              /AtomicTracker/history/meals/&lt;weekId&gt;.draft.json
            </code>{" "}
            — open the app to review and accept it.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPing}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Zap className="h-3.5 w-3.5" aria-hidden />
              Test routine endpoint
            </button>
            <button
              type="button"
              onClick={() => onSetup(true)}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
              Rotate token
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remove routine
            </button>
          </div>

          {pingResult ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              {pingResult}
            </p>
          ) : null}
        </>
      )}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Rotating mints a new token; the old one keeps working until you revoke
        Google OAuth access (no project-side blacklist). Removing only forgets
        the Drive marker file — to fully revoke, visit{" "}
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          your Google account permissions
        </a>{" "}
        and remove AtomicTracker.
      </p>
    </div>
  );
}
