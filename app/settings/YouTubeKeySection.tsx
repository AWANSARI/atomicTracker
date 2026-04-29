"use client";

import { useEffect, useState } from "react";
import { decryptJson, encryptJson } from "@/lib/crypto/webcrypto";
import { loadPassphrase, subscribePassphrase } from "@/lib/storage/passphrase";
import type { ProviderId } from "@/lib/ai/providers";
import {
  readConnectorEnvelope,
  saveConnectorEnvelope,
  testYouTubeKeyAction,
} from "./actions";

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
  | { kind: "no-passphrase" }
  | { kind: "no-youtube"; passphrase: string; payload: ConnectorsPayload }
  | { kind: "has-youtube"; passphrase: string; payload: ConnectorsPayload };

type FormState = "idle" | "editing" | "testing" | "saving";

export function YouTubeKeySection({ googleSub }: { googleSub: string }) {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [formState, setFormState] = useState<FormState>("idle");
  const [apiKey, setApiKey] = useState("");
  const [testStatus, setTestStatus] = useState<"untested" | "ok" | "fail">(
    "untested",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function reload() {
      try {
        const passphrase = await loadPassphrase();
        if (cancelled) return;
        if (!passphrase) {
          setLoaded({ kind: "no-passphrase" });
          return;
        }
        const envelope = await readConnectorEnvelope();
        if (cancelled) return;
        const payload: ConnectorsPayload = envelope
          ? await decryptJson<ConnectorsPayload>(envelope, passphrase, googleSub)
          : { v: 1 };
        if (cancelled) return;
        setLoaded(
          payload.youtube
            ? { kind: "has-youtube", passphrase, payload }
            : { kind: "no-youtube", passphrase, payload },
        );
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoaded({ kind: "no-passphrase" });
      }
    }
    void reload();
    const unsubscribe = subscribePassphrase(() => void reload());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [googleSub]);

  async function onTest() {
    if (!apiKey) return;
    setError(null);
    setFormState("testing");
    try {
      const result = await testYouTubeKeyAction(apiKey);
      setTestStatus(result.ok ? "ok" : "fail");
      if (!result.ok) setError(result.error ?? "Invalid YouTube key");
    } catch (e) {
      setTestStatus("fail");
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (testStatus !== "ok") setFormState("editing");
    }
  }

  async function onSave() {
    if (!loaded || loaded.kind === "no-passphrase") return;
    if (testStatus !== "ok") return;
    setFormState("saving");
    setError(null);
    try {
      const next: ConnectorsPayload = {
        ...loaded.payload,
        v: 1,
        youtube: { apiKey, addedAt: new Date().toISOString() },
      };
      const envelope = await encryptJson(next, loaded.passphrase, googleSub);
      await saveConnectorEnvelope(envelope);
      setLoaded({ kind: "has-youtube", passphrase: loaded.passphrase, payload: next });
      setApiKey("");
      setTestStatus("untested");
      setFormState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFormState("editing");
    }
  }

  async function onRemove() {
    if (!loaded || loaded.kind !== "has-youtube") return;
    setError(null);
    try {
      const next: ConnectorsPayload = {
        ...loaded.payload,
        v: 1,
        youtube: undefined,
      };
      const envelope = await encryptJson(next, loaded.passphrase, googleSub);
      await saveConnectorEnvelope(envelope);
      setLoaded({ kind: "no-youtube", passphrase: loaded.passphrase, payload: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!loaded) {
    return <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>;
  }
  if (loaded.kind === "no-passphrase") {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Set your passphrase first.
      </p>
    );
  }

  if (loaded.kind === "has-youtube" && formState === "idle") {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          YouTube Data API key configured. Each generated meal will get a
          recommended recipe video.
        </div>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setFormState("editing");
              setTestStatus("untested");
            }}
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
      </div>
    );
  }

  if (formState === "idle") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Optional. With a YouTube Data API key, each meal gets a specific
          recommended recipe video. Without it, you get a YouTube search link.
        </p>
        <ol className="ml-4 list-decimal space-y-1 text-xs text-slate-500 dark:text-slate-400">
          <li>
            Open{" "}
            <a
              href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
            >
              YouTube Data API library
            </a>{" "}
            and enable it on your project.
          </li>
          <li>
            Create an API key at{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
            >
              Credentials
            </a>
            .
          </li>
          <li>Paste it below.</li>
        </ol>
        <button
          type="button"
          onClick={() => setFormState("editing")}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Add YouTube key
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          YouTube Data API key
        </span>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setTestStatus("untested");
          }}
          placeholder="AIza…"
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </label>
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
            disabled={!apiKey || formState === "testing"}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {formState === "testing" ? "Testing…" : "Test key"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSave}
            disabled={formState === "saving"}
            className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {formState === "saving" ? "Saving…" : "Encrypt & save"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setFormState("idle");
            setApiKey("");
            setTestStatus("untested");
            setError(null);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
