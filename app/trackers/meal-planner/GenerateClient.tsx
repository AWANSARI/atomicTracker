"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decryptJson } from "@/lib/crypto/webcrypto";
import { loadPassphrase } from "@/lib/storage/passphrase";
import type { ProviderId } from "@/lib/ai/providers";
import { readConnectorEnvelope } from "@/app/settings/actions";

type ConnectorsPayload = {
  v: 1;
  ai?: { provider: ProviderId; apiKey: string; addedAt: string };
};

type Phase = "idle" | "decrypting" | "calling" | "saving" | "error";

export function GenerateClient({ googleSub }: { googleSub: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    setError(null);
    setPhase("decrypting");
    try {
      const passphrase = await loadPassphrase();
      if (!passphrase) {
        throw new Error("Set your encryption passphrase in Settings first.");
      }
      const envelope = await readConnectorEnvelope();
      if (!envelope) {
        throw new Error("Connect an AI provider in Settings first.");
      }
      const payload = await decryptJson<ConnectorsPayload>(envelope, passphrase, googleSub);
      const ai = payload.ai;
      if (!ai) {
        throw new Error("No AI provider configured.");
      }

      setPhase("calling");
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: ai.provider, apiKey: ai.apiKey }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const errMsg =
          (j as { error?: string }).error ?? `${res.status} ${res.statusText}`;
        throw new Error(errMsg);
      }
      const data = (await res.json()) as { plan: { weekId: string } };

      setPhase("saving");
      router.push(`/trackers/meal-planner/plan?week=${data.plan.weekId}`);
      router.refresh();
      setPhase("idle");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = phase !== "idle" && phase !== "error";
  const label =
    phase === "decrypting"
      ? "Decrypting key…"
      : phase === "calling"
        ? "Asking your AI for 7 meals…"
        : phase === "saving"
          ? "Saving draft to Drive…"
          : "Generate next week";

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onGenerate}
        disabled={busy}
        className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {label}
      </button>
      {phase === "calling" ? (
        <p className="text-center text-[11px] text-slate-400">
          This usually takes 5–15 seconds. Keep this tab open.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900">
          {error}
        </p>
      ) : null}
    </div>
  );
}
