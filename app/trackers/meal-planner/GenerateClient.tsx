"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { decryptJson } from "@/lib/crypto/webcrypto";
import { loadPassphrase } from "@/lib/storage/passphrase";
import type { ProviderId } from "@/lib/ai/providers";
import { readConnectorEnvelope } from "@/app/settings/actions";

type ConnectorsPayload = {
  v: 1;
  ai?: { provider: ProviderId; apiKey: string; addedAt: string };
  youtube?: { apiKey: string; addedAt: string };
};

type Phase = "idle" | "decrypting" | "calling" | "saving" | "error";

export function GenerateClient({
  googleSub,
  weekId,
  weekLabel,
  hasExisting,
  variant = "primary",
}: {
  googleSub: string;
  /** Optional: target a specific week. Defaults to next week server-side. */
  weekId?: string;
  /** Label for the button (e.g. "Generate next week" or "Regenerate W19"). */
  weekLabel?: string;
  /** Hint to the UI: existing plan present (button shows "Regenerate"). */
  hasExisting?: boolean;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function fire(overwrite = false): Promise<{ weekId: string } | null> {
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
    if (!ai) throw new Error("No AI provider configured.");

    setPhase("calling");
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: ai.provider,
        apiKey: ai.apiKey,
        youtubeKey: payload.youtube?.apiKey,
        weekId,
        overwrite,
      }),
    });

    if (res.status === 409) {
      const j = (await res.json().catch(() => ({}))) as {
        existingStatus?: "draft" | "accepted";
      };
      const status = j.existingStatus ?? "existing";
      const ok = window.confirm(
        `A ${status} plan already exists for this week. Overwrite it?`,
      );
      if (!ok) return null;
      return await fire(true);
    }

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const msg = (j as { error?: string }).error ?? `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }

    const data = (await res.json()) as { plan: { weekId: string } };
    return { weekId: data.plan.weekId };
  }

  async function onGenerate() {
    setError(null);
    setPhase("decrypting");
    try {
      const result = await fire(false);
      if (!result) {
        // user declined the overwrite confirm
        setPhase("idle");
        return;
      }
      setPhase("saving");
      router.push(`/trackers/meal-planner/plan?week=${result.weekId}`);
      router.refresh();
      setPhase("idle");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = phase !== "idle" && phase !== "error";
  const baseLabel = hasExisting
    ? `Regenerate${weekLabel ? ` · ${weekLabel}` : ""}`
    : `Generate${weekLabel ? ` · ${weekLabel}` : " plan"}`;
  const label =
    phase === "decrypting"
      ? "Decrypting key…"
      : phase === "calling"
        ? "Asking your AI for meals…"
        : phase === "saving"
          ? "Saving draft to Drive…"
          : baseLabel;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onGenerate}
        disabled={busy}
        className={
          variant === "primary"
            ? "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            : "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        }
      >
        <Sparkles className="h-4 w-4" />
        {label}
      </button>
      {phase === "calling" ? (
        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
          5–15 seconds. Keep this tab open.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
