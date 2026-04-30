"use client";

import { useEffect, useState } from "react";
import { decryptJson, encryptJson } from "@/lib/crypto/webcrypto";
import type { EncryptedEnvelope } from "@/lib/crypto/webcrypto";
import { loadPassphrase, subscribePassphrase } from "@/lib/storage/passphrase";
import { PROVIDERS, type ProviderId } from "@/lib/ai/providers";
import {
  readConnectorEnvelope,
  resetConnectorEnvelope,
  saveConnectorEnvelope,
  testKeyAction,
} from "./actions";

/** Plaintext shape stored encrypted in connectors.enc.json. */
type ConnectorsPayload = {
  v: 1;
  ai?: {
    provider: ProviderId;
    apiKey: string;
    addedAt: string;
  };
  youtube?: {
    apiKey: string;
    addedAt: string;
  };
  telegram?: {
    botToken: string;
    botUsername: string;
    chatId?: number;
    addedAt: string;
  };
};

type Step = "idle" | "pick-provider" | "get-key" | "paste-test" | "saving" | "done";

type LoadedState =
  | { kind: "no-passphrase" }
  | { kind: "load-error"; passphrase: string; message: string }
  | { kind: "no-connectors"; passphrase: string }
  | { kind: "has-ai"; passphrase: string; payload: ConnectorsPayload };

export function ConnectorWizard({ googleSub }: { googleSub: string }) {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [provider, setProvider] = useState<ProviderId | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [testStatus, setTestStatus] = useState<"untested" | "testing" | "ok" | "fail">(
    "untested",
  );
  const [error, setError] = useState<string | null>(null);

  // Initial load + re-load when the passphrase changes elsewhere on the page.
  useEffect(() => {
    let cancelled = false;
    async function reload() {
      let passphrase: string | null = null;
      try {
        passphrase = await loadPassphrase();
        if (cancelled) return;
        if (!passphrase) {
          setLoaded({ kind: "no-passphrase" });
          return;
        }
        const envelope = await readConnectorEnvelope();
        if (cancelled) return;
        if (!envelope) {
          setLoaded({ kind: "no-connectors", passphrase });
          return;
        }
        const payload = await decryptJson<ConnectorsPayload>(envelope, passphrase, googleSub);
        if (cancelled) return;
        setLoaded({ kind: "has-ai", passphrase, payload });
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        // Distinguish: only show "no-passphrase" when the passphrase is
        // genuinely missing. If we got the passphrase and a later step
        // failed (decrypt error, Drive read error), surface that explicitly.
        if (passphrase) {
          setLoaded({ kind: "load-error", passphrase, message });
        } else {
          setLoaded({ kind: "no-passphrase" });
        }
      }
    }
    void reload();
    const unsubscribe = subscribePassphrase(() => void reload());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [googleSub]);

  function startWizard() {
    setStep("pick-provider");
    setProvider(null);
    setApiKey("");
    setTestStatus("untested");
    setError(null);
  }

  function cancelWizard() {
    setStep("idle");
    setProvider(null);
    setApiKey("");
    setTestStatus("untested");
    setError(null);
  }

  async function onTest() {
    if (!provider || !apiKey) return;
    setTestStatus("testing");
    setError(null);
    try {
      const res = await testKeyAction(provider, apiKey);
      if (res.ok) {
        setTestStatus("ok");
      } else {
        setTestStatus("fail");
        setError(res.error ?? "Unknown error");
      }
    } catch (e) {
      setTestStatus("fail");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onSave() {
    if (!provider || !apiKey || testStatus !== "ok") return;
    if (!loaded || loaded.kind === "no-passphrase") return;
    setStep("saving");
    setError(null);
    try {
      const passphrase = loaded.passphrase;
      const existingPayload =
        loaded.kind === "has-ai" ? loaded.payload : ({ v: 1 } as ConnectorsPayload);
      const newPayload: ConnectorsPayload = {
        ...existingPayload,
        v: 1,
        ai: {
          provider,
          apiKey,
          addedAt: new Date().toISOString(),
        },
      };
      const envelope = await encryptJson(newPayload, passphrase, googleSub);
      await saveConnectorEnvelope(envelope);
      setLoaded({ kind: "has-ai", passphrase, payload: newPayload });
      setStep("done");
      // After a moment, collapse back to idle
      setTimeout(() => setStep("idle"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("paste-test");
    }
  }

  async function onRemove() {
    if (!loaded || loaded.kind !== "has-ai") return;
    const passphrase = loaded.passphrase;
    setError(null);
    try {
      const newPayload: ConnectorsPayload = { ...loaded.payload, v: 1, ai: undefined };
      const envelope = await encryptJson(newPayload, passphrase, googleSub);
      await saveConnectorEnvelope(envelope);
      setLoaded({ kind: "no-connectors", passphrase });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  if (!loaded) {
    return <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>;
  }

  if (loaded.kind === "no-passphrase") {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Set your encryption passphrase above first.
      </p>
    );
  }

  if (loaded.kind === "load-error") {
    const isDecrypt =
      loaded.message.startsWith("decrypt-failed:") ||
      /decrypt|aes|gcm|integrity|operation/i.test(loaded.message);
    return (
      <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-medium">
          {isDecrypt
            ? "Passphrase doesn't match your saved keys."
            : "Couldn't load saved connectors."}
        </p>
        <p className="text-xs">
          {isDecrypt
            ? "The passphrase in this browser is different from the one used to encrypt your saved keys. Either tap 'Forget passphrase on this browser' above and re-enter the original — or, if you don't remember it, reset and start fresh below."
            : `Read failed: ${loaded.message || "(no message)"}. Try refreshing the page.`}
        </p>
        {isDecrypt ? (
          <button
            type="button"
            onClick={async () => {
              if (!confirm("Delete saved AI / YouTube / Telegram keys from your Drive? You'll need to re-enter them.")) return;
              await resetConnectorEnvelope();
              window.location.reload();
            }}
            className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
          >
            Reset saved connectors
          </button>
        ) : null}
      </div>
    );
  }

  // Connected state
  if (loaded.kind === "has-ai" && loaded.payload.ai && step === "idle") {
    const info = PROVIDERS[loaded.payload.ai.provider];
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <span className="font-medium">{info.name}</span> connected. Key
          encrypted with your passphrase and stored at{" "}
          <code className="rounded bg-emerald-100 px-1 py-0.5 text-[11px] dark:bg-emerald-900/50">
            /AtomicTracker/config/connectors.enc.json
          </code>
          .
        </div>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={startWizard}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Remove
          </button>
        </div>
        {error ? (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </div>
    );
  }

  if (step === "idle") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No AI provider connected yet.
        </p>
        <button
          type="button"
          onClick={startWizard}
          className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Add AI provider
        </button>
        {error ? (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </div>
    );
  }

  // Wizard active

  return (
    <div className="space-y-4">
      <Stepper
        steps={[
          { id: "pick-provider", label: "Pick" },
          { id: "get-key", label: "Get key" },
          { id: "paste-test", label: "Test" },
        ]}
        active={
          step === "pick-provider"
            ? "pick-provider"
            : step === "get-key"
              ? "get-key"
              : "paste-test"
        }
      />

      {step === "pick-provider" ? (
        <div className="space-y-2">
          {(["anthropic", "openai", "gemini"] as ProviderId[]).map((id) => {
            const info = PROVIDERS[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setProvider(id);
                  setStep("get-key");
                }}
                className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-brand-400 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-600 dark:hover:bg-slate-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {info.name}
                  </span>
                  {info.freeTier ? (
                    <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Free tier
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {info.tagline}
                </p>
              </button>
            );
          })}
        </div>
      ) : null}

      {step === "get-key" && provider ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Steps to get your {PROVIDERS[provider].shortName} API key:
          </p>
          <ol className="ml-4 list-decimal space-y-1 text-sm text-slate-700 dark:text-slate-300">
            {PROVIDERS[provider].steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <a
            href={PROVIDERS[provider].consoleUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300 dark:hover:bg-brand-900/40"
          >
            Open {PROVIDERS[provider].consoleHost} ↗
          </a>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("paste-test")}
              className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              I have my key
            </button>
            <button
              type="button"
              onClick={cancelWizard}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {step === "paste-test" && provider ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {PROVIDERS[provider].shortName} API key
            </span>
            <input
              type="password"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestStatus("untested");
              }}
              placeholder={PROVIDERS[provider].keyPlaceholder}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </label>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            We&apos;ll test it against {PROVIDERS[provider].consoleHost} once,
            then encrypt and store it in your Drive.
          </p>

          {testStatus === "ok" ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              Key works. Save to encrypt and store on your Drive.
            </div>
          ) : null}
          {testStatus === "fail" && error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="flex gap-2">
            {testStatus !== "ok" ? (
              <button
                type="button"
                onClick={onTest}
                disabled={!apiKey || testStatus === "testing"}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {testStatus === "testing" ? "Testing…" : "Test key"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onSave}
                disabled={(step as Step) === "saving"}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {(step as Step) === "saving" ? "Saving…" : "Encrypt & save"}
              </button>
            )}
            <button
              type="button"
              onClick={cancelWizard}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          Saved. AI provider is connected.
        </div>
      ) : null}
    </div>
  );
}

function Stepper({
  steps,
  active,
}: {
  steps: { id: string; label: string }[];
  active: string;
}) {
  const idx = steps.findIndex((s) => s.id === active);
  return (
    <ol className="flex items-center gap-1 text-[11px]">
      {steps.map((s, i) => (
        <li key={s.id} className="flex flex-1 items-center gap-1">
          <span
            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
              i <= idx
                ? "bg-brand-600 text-white"
                : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}
            aria-hidden
          >
            {i + 1}
          </span>
          <span
            className={
              i <= idx
                ? "text-slate-900 dark:text-slate-100"
                : "text-slate-400 dark:text-slate-500"
            }
          >
            {s.label}
          </span>
          {i < steps.length - 1 ? (
            <span
              className="ml-1 h-px flex-1 bg-slate-200 dark:bg-slate-800"
              aria-hidden
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
