"use client";

import { useEffect, useState } from "react";
import { encryptJson, PASSPHRASE_CHECK_PLAINTEXT } from "@/lib/crypto/webcrypto";
import {
  clearPassphrase,
  loadPassphrase,
  savePassphrase,
} from "@/lib/storage/passphrase";

type Status = "loading" | "unset" | "set";

export function PassphraseSection({ googleSub }: { googleSub: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const existing = await loadPassphrase();
        setStatus(existing ? "set" : "unset");
      } catch (e) {
        setError(String(e));
        setStatus("unset");
      }
    })();
  }, []);

  async function onSetPassphrase(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const passphrase = String(formData.get("passphrase") ?? "");
      const confirm = String(formData.get("confirm") ?? "");
      if (passphrase.length < 8) {
        throw new Error("Passphrase must be at least 8 characters.");
      }
      if (passphrase !== confirm) {
        throw new Error("Passphrases don't match.");
      }
      // Smoke test: encrypt the canary so we know the passphrase works.
      // (We don't write it to Drive yet — that happens in commit 4 when the
      // first connector key is saved.)
      await encryptJson(PASSPHRASE_CHECK_PLAINTEXT, passphrase, googleSub);
      await savePassphrase(passphrase);
      setStatus("set");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  async function onClear() {
    setError(null);
    setPending(true);
    try {
      await clearPassphrase();
      setStatus("unset");
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  }

  if (status === "loading") {
    return <p className="text-sm text-slate-400">Checking your browser…</p>;
  }

  if (status === "set") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span aria-hidden className="text-emerald-600">✓</span>
          <span>
            Passphrase is set in this browser. AI provider keys saved in commit 4
            will be encrypted with it before they touch your Drive.
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={pending}
          className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline disabled:opacity-50"
        >
          Forget passphrase on this browser
        </button>
        {error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      action={onSetPassphrase}
      className="space-y-3"
    >
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Passphrase</span>
        <input
          name="passphrase"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
          placeholder="At least 8 characters"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Confirm</span>
        <input
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save passphrase"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <p className="text-[11px] text-slate-400">
        We can&apos;t recover this for you. Use a password manager.
      </p>
    </form>
  );
}
