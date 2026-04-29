"use client";

import { useEffect, useState } from "react";
import { Send, ExternalLink, CheckCircle2, RefreshCcw } from "lucide-react";
import { decryptJson, encryptJson } from "@/lib/crypto/webcrypto";
import { loadPassphrase } from "@/lib/storage/passphrase";
import type { ProviderId } from "@/lib/ai/providers";
import { readConnectorEnvelope, saveConnectorEnvelope } from "./actions";

/**
 * Plaintext shape stored encrypted in connectors.enc.json.
 * Mirrors the type defined in ConnectorWizard / YouTubeKeySection.
 */
type ConnectorsPayload = {
  v: 1;
  ai?: { provider: ProviderId; apiKey: string; addedAt: string };
  youtube?: { apiKey: string; addedAt: string };
  telegram?: {
    botToken: string;
    botUsername: string;
    chatId?: number;
    addedAt: string;
  };
};

type LoadedState =
  | { kind: "loading" }
  | { kind: "no-passphrase" }
  | { kind: "ready"; passphrase: string; payload: ConnectorsPayload };

type FormState =
  | "idle"
  | "entering-token"
  | "validating"
  | "validated"
  | "saving"
  | "pairing"
  | "confirming"
  | "sending-test";

export function TelegramSection({ googleSub }: { googleSub: string }) {
  const [loaded, setLoaded] = useState<LoadedState>({ kind: "loading" });
  const [formState, setFormState] = useState<FormState>("idle");
  const [tokenDraft, setTokenDraft] = useState("");
  const [testedBot, setTestedBot] = useState<{
    botUsername: string;
    firstName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const passphrase = await loadPassphrase();
        if (!passphrase) {
          setLoaded({ kind: "no-passphrase" });
          return;
        }
        const envelope = await readConnectorEnvelope();
        const payload: ConnectorsPayload = envelope
          ? await decryptJson<ConnectorsPayload>(envelope, passphrase, googleSub)
          : { v: 1 };
        setLoaded({ kind: "ready", passphrase, payload });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setLoaded({ kind: "no-passphrase" });
      }
    })();
  }, [googleSub]);

  function reset() {
    setFormState("idle");
    setTokenDraft("");
    setTestedBot(null);
    setError(null);
    setInfo(null);
  }

  async function persistPayload(next: ConnectorsPayload) {
    if (loaded.kind !== "ready") return;
    const envelope = await encryptJson(next, loaded.passphrase, googleSub);
    await saveConnectorEnvelope(envelope);
    setLoaded({ kind: "ready", passphrase: loaded.passphrase, payload: next });
  }

  async function onTestToken() {
    if (!tokenDraft) return;
    setFormState("validating");
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: tokenDraft.trim() }),
      });
      const data = (await res.json()) as
        | { ok: true; username: string; firstName: string }
        | { ok: false; error: string };
      if (!data.ok) {
        setError(data.error || "Token rejected by Telegram");
        setFormState("entering-token");
        return;
      }
      setTestedBot({ botUsername: data.username, firstName: data.firstName });
      setFormState("validated");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFormState("entering-token");
    }
  }

  async function onSaveToken() {
    if (loaded.kind !== "ready" || !testedBot) return;
    setFormState("saving");
    setError(null);
    try {
      const next: ConnectorsPayload = {
        ...loaded.payload,
        v: 1,
        telegram: {
          botToken: tokenDraft.trim(),
          botUsername: testedBot.botUsername,
          chatId: undefined,
          addedAt: new Date().toISOString(),
        },
      };
      await persistPayload(next);
      setTokenDraft("");
      setTestedBot(null);
      setFormState("idle");
      setInfo("Bot saved. Now pair it with your Telegram account.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFormState("validated");
    }
  }

  async function onOpenTelegram() {
    if (loaded.kind !== "ready" || !loaded.payload.telegram) return;
    const { botUsername } = loaded.payload.telegram;
    setFormState("pairing");
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(
        `/api/telegram/pair-start?username=${encodeURIComponent(botUsername)}`,
      );
      const data = (await res.json()) as
        | { ok: true; pairToken: string; deepLinkUrl: string }
        | { ok: false; error: string };
      if (!data.ok) {
        setError(data.error || "Could not generate pair link");
        setFormState("idle");
        return;
      }
      window.open(data.deepLinkUrl, "_blank", "noopener,noreferrer");
      setInfo(
        "Opened Telegram. Tap Start in your bot chat, then come back and click Confirm pairing.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFormState("idle");
    }
  }

  async function onConfirmPairing() {
    if (loaded.kind !== "ready" || !loaded.payload.telegram) return;
    const tg = loaded.payload.telegram;
    setFormState("confirming");
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/telegram/pair-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: tg.botToken }),
      });
      const data = (await res.json()) as
        | { ok: true; chatId: number; telegramUsername: string | null }
        | { ok: false; reason: string };
      if (!data.ok) {
        setError(data.reason || "Pairing not found");
        setFormState("idle");
        return;
      }
      const next: ConnectorsPayload = {
        ...loaded.payload,
        v: 1,
        telegram: {
          ...tg,
          chatId: data.chatId,
        },
      };
      await persistPayload(next);
      setInfo(
        `Paired with @${tg.botUsername} (chat ${data.chatId}). You can now send a test message.`,
      );
      setFormState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFormState("idle");
    }
  }

  async function onSendTest() {
    if (loaded.kind !== "ready" || !loaded.payload.telegram?.chatId) return;
    const tg = loaded.payload.telegram;
    setFormState("sending-test");
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/telegram/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: tg.botToken,
          chatId: tg.chatId,
          text: "AtomicTracker test — works!",
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error || "Send failed");
      } else {
        setInfo("Test message sent. Check Telegram.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFormState("idle");
    }
  }

  async function onDisconnect() {
    if (loaded.kind !== "ready") return;
    setError(null);
    setInfo(null);
    try {
      const next: ConnectorsPayload = {
        ...loaded.payload,
        v: 1,
        telegram: undefined,
      };
      await persistPayload(next);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────

  if (loaded.kind === "loading") {
    return <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>;
  }
  if (loaded.kind === "no-passphrase") {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Set your passphrase first.
      </p>
    );
  }

  const tg = loaded.payload.telegram;
  const isPaired = Boolean(tg?.chatId);
  const hasToken = Boolean(tg);

  // Header line (status badge)
  const Header = (
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
      <Send className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden />
      <span>Telegram bot</span>
      {isPaired ? (
        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-3 w-3" aria-hidden />
          Paired
        </span>
      ) : hasToken ? (
        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Awaiting pair
        </span>
      ) : null}
    </div>
  );

  // Step 1 — entering token
  if (!hasToken) {
    if (formState === "entering-token" || formState === "validating" || formState === "validated" || formState === "saving") {
      return (
        <div className="space-y-3">
          {Header}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Open BotFather in Telegram, run{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-slate-800">
              /newbot
            </code>{" "}
            (or{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-slate-800">
              /token
            </code>{" "}
            for an existing bot), and paste the token below.
          </p>
          <label className="block">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Bot token
            </span>
            <textarea
              value={tokenDraft}
              onChange={(e) => {
                setTokenDraft(e.target.value);
                setTestedBot(null);
                if (formState === "validated") setFormState("entering-token");
              }}
              placeholder="123456789:AAExampleTokenFromBotFather"
              rows={2}
              autoComplete="off"
              spellCheck={false}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </label>

          {testedBot && formState === "validated" ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              Verified bot{" "}
              <span className="font-semibold">@{testedBot.botUsername}</span>
              {testedBot.firstName ? ` (${testedBot.firstName})` : ""}. Save to
              encrypt the token to your Drive.
            </div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="flex gap-2">
            {formState === "validated" ? (
              <button
                type="button"
                onClick={onSaveToken}
                disabled={(formState as FormState) === "saving"}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {(formState as FormState) === "saving"
                  ? "Saving…"
                  : "Save & continue"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onTestToken}
                disabled={!tokenDraft.trim() || formState === "validating"}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {formState === "validating" ? "Testing…" : "Test connection"}
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {Header}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Optional. Receive AtomicTracker nudges in Telegram when a plan is
          accepted, a prep check-in is due, or a habit streak is at risk.
        </p>
        <ol className="ml-4 list-decimal space-y-1 text-xs text-slate-500 dark:text-slate-400">
          <li>
            Open{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
            >
              BotFather
            </a>{" "}
            in Telegram.
          </li>
          <li>
            Run <code>/newbot</code>, pick a name + username (must end in{" "}
            <code>bot</code>).
          </li>
          <li>Paste the token BotFather hands back.</li>
        </ol>
        <button
          type="button"
          onClick={() => setFormState("entering-token")}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Add Telegram bot
        </button>
        {error ? (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </div>
    );
  }

  // Step 2 / 3 — token saved, pairing flow
  return (
    <div className="space-y-3">
      {Header}

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
        <div className="flex items-center justify-between gap-2">
          <span>
            Bot{" "}
            <span className="font-semibold">@{tg!.botUsername}</span>
            {isPaired ? (
              <>
                {" "}
                paired with chat{" "}
                <code className="rounded bg-slate-200 px-1 py-0.5 text-[11px] dark:bg-slate-800">
                  {tg!.chatId}
                </code>
              </>
            ) : null}
          </span>
        </div>
      </div>

      {!isPaired ? (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pair the bot with your Telegram account. You&rsquo;ll get a one-time
            deep link to open the bot chat &mdash; tap{" "}
            <span className="font-medium">Start</span> there, then come back and
            click Confirm pairing.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenTelegram}
              disabled={formState === "pairing"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-60 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300 dark:hover:bg-brand-900/40"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {formState === "pairing" ? "Opening…" : "Open Telegram to pair"}
            </button>
            <button
              type="button"
              onClick={onConfirmPairing}
              disabled={formState === "confirming"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
              {formState === "confirming" ? "Confirming…" : "Confirm pairing"}
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSendTest}
            disabled={formState === "sending-test"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            {formState === "sending-test" ? "Sending…" : "Send a test message"}
          </button>
          <button
            type="button"
            onClick={onConfirmPairing}
            disabled={formState === "confirming"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
            Re-pair
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onDisconnect}
        className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
      >
        Disconnect Telegram
      </button>

      {info ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {info}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}
