"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Sliders } from "lucide-react";
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

type WeekOverride = {
  notes?: string;
  caloriesPerDay?: number;
  cuisines?: string[];
  ingredients?: string[];
};

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

  // Per-week override. Empty by default — the API uses the saved config.
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [kcal, setKcal] = useState("");
  const [cuisinesRaw, setCuisinesRaw] = useState("");
  const [ingredientsRaw, setIngredientsRaw] = useState("");

  function buildOverride(): WeekOverride | undefined {
    if (!overrideOpen) return undefined;
    const ov: WeekOverride = {};
    if (notes.trim()) ov.notes = notes.trim();
    if (kcal.trim()) {
      const n = Number(kcal);
      if (Number.isFinite(n) && n > 0) ov.caloriesPerDay = Math.round(n);
    }
    const cuisines = cuisinesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (cuisines.length) ov.cuisines = cuisines;
    const ingredients = ingredientsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ingredients.length) ov.ingredients = ingredients;
    return Object.keys(ov).length > 0 ? ov : undefined;
  }

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
    const weekOverride = buildOverride();
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: ai.provider,
        apiKey: ai.apiKey,
        youtubeKey: payload.youtube?.apiKey,
        weekId,
        overwrite,
        weekOverride,
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

  const overrideActive =
    overrideOpen &&
    (notes.trim() !== "" ||
      kcal.trim() !== "" ||
      cuisinesRaw.trim() !== "" ||
      ingredientsRaw.trim() !== "");

  const inputCls =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOverrideOpen((v) => !v)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        aria-expanded={overrideOpen}
      >
        <Sliders className="h-3 w-3" />
        {overrideOpen ? "Hide week customization" : "Customize for this week (optional)"}
        {overrideActive ? (
          <span className="inline-flex items-center rounded-full bg-brand-600 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-white">
            on
          </span>
        ) : null}
      </button>

      {overrideOpen ? (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            One-off override · saved config is unchanged
          </p>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Notes for this week
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. lighter dinners, no rice this week, prepping for Diwali on Friday"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Daily kcal target (override)
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
              placeholder="leave blank to use computed target"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Cuisines for this week (comma-separated, replaces saved)
            </label>
            <input
              type="text"
              value={cuisinesRaw}
              onChange={(e) => setCuisinesRaw(e.target.value)}
              placeholder="e.g. Indian, Mediterranean"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Pantry / ingredients for this week (comma-separated, replaces saved)
            </label>
            <textarea
              value={ingredientsRaw}
              onChange={(e) => setIngredientsRaw(e.target.value)}
              rows={2}
              placeholder="e.g. chicken, broccoli, brown rice, paneer, spinach, tomatoes"
              className={inputCls}
            />
          </div>
        </div>
      ) : null}

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
