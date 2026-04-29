"use client";

import { useEffect, useState } from "react";
import { decryptJson, encryptJson } from "@/lib/crypto/webcrypto";
import type { EncryptedEnvelope } from "@/lib/crypto/webcrypto";
import { loadPassphrase } from "@/lib/storage/passphrase";
import { PROVIDERS, type ProviderId } from "@/lib/ai/providers";
import {
  readConnectorEnvelope,
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
  // telegram, etc. arrive in later commits
};

type Step = "idle" | "pick-provider" | "get-key" | "paste-test" | "saving" | "done";

type LoadedState =
  | { kind: "no-passphrase" }
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

  // Initial load: passphrase + envelope
  useEffect(() => {
    void (async () => {
      try {
        const passphrase = await loadPassphrase();
        if (!passphrase) {
          setLoaded({ kind: "no-passphrase" });
          return;
        }
        const envelope = await readConnectorEnvelope();
        if (!envelope) {
          setLoaded({ kind: "no-connectors", passphrase });
          return;
        }
        const payload = await decryptJson<ConnectorsPayload>(envelope, passphrase, googleSub);
        setLoaded({ kind: "has-ai", passphrase, payload });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setLoaded({ kind: "no-passphrase" });
      }
    })();
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
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  if (loaded.kind === "no-passphrase") {
    return (
      <p className="text-sm text-slate-500">
        Set your encryption passphrase above first.
      </p>
    );
  }

  // Connected state
  if (loaded.kind === "has-ai" && loaded.payload.ai && step === "idle") {
    const info = PROVIDERS[loaded.payload.ai.provider];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span aria-hidden className="text-emerald-600">✓</span>
          <span>
            <span className="font-medium">{info.name}</span> connected. Key
            encrypted with your passphrase and stored at{" "}
            <code className="rounded bg-emerald-100 px-1 py-0.5 text-[11px]">
              /AtomicTracker/config/connectors.enc.json
            </code>
            .
          </span>
        </div>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={startWizard}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            Remove
          </button>
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  if (step === "idle") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">No AI provider connected yet.</p>
        <button
          type="button"
          onClick={startWizard}
          className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          Add AI provider
        </button>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
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
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">
                    {info.name}
                  </span>
                  {info.freeTier ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800">
                      Free tier
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">{info.tagline}</p>
              </button>
            );
          })}
        </div>
      ) : null}

      {step === "get-key" && provider ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Steps to get your {PROVIDERS[provider].shortName} API key:
          </p>
          <ol className="ml-4 list-decimal space-y-1 text-sm text-slate-700">
            {PROVIDERS[provider].steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <a
            href={PROVIDERS[provider].consoleUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
          >
            Open {PROVIDERS[provider].consoleHost} ↗
          </a>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep("paste-test")}
              className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
            >
              I have my key
            </button>
            <button
              type="button"
              onClick={cancelWizard}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {step === "paste-test" && provider ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-700">
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
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
            />
          </label>
          <p className="text-[11px] text-slate-400">
            We&apos;ll test it against {PROVIDERS[provider].consoleHost} once,
            then encrypt and store it in your Drive.
          </p>

          {testStatus === "ok" ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
              ✓ Key works. Save to encrypt and store on your Drive.
            </div>
          ) : null}
          {testStatus === "fail" && error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900">
              {error}
            </div>
          ) : null}

          <div className="flex gap-2">
            {testStatus !== "ok" ? (
              <button
                type="button"
                onClick={onTest}
                disabled={!apiKey || testStatus === "testing"}
                className="flex-1 rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testStatus === "testing" ? "Testing…" : "Test key"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onSave}
                disabled={(step as Step) === "saving"}
                className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
              >
                {(step as Step) === "saving" ? "Saving…" : "Encrypt & save"}
              </button>
            )}
            <button
              type="button"
              onClick={cancelWizard}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          ✓ Saved. AI provider is connected.
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
                : "bg-slate-200 text-slate-500"
            }`}
            aria-hidden
          >
            {i + 1}
          </span>
          <span className={i <= idx ? "text-slate-900" : "text-slate-400"}>
            {s.label}
          </span>
          {i < steps.length - 1 ? (
            <span className="ml-1 h-px flex-1 bg-slate-200" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
