"use client";

import { useEffect, useRef, useState } from "react";
import {
  Lock,
  LockOpen,
  MessageCircle,
  PlayCircle,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { decryptJson } from "@/lib/crypto/webcrypto";
import { loadPassphrase } from "@/lib/storage/passphrase";
import type { ProviderId } from "@/lib/ai/providers";
import { readConnectorEnvelope } from "@/app/settings/actions";
import type { Day, Meal, MealPlan } from "@/lib/tracker/meal-planner-plan";

type ChatMsg = { role: "user" | "assistant"; content: string };

type AcceptResult = {
  ok: boolean;
  partial?: boolean;
  csv?: { driveFileId: string; itemCount: number } | null;
  calendar?: {
    events: { name: string; ok: boolean; htmlLink?: string; error?: string }[];
    deleted?: { id: string; deleted: boolean; error?: string }[];
  };
  reaccept?: boolean;
};

type ConnectorsPayload = {
  v: 1;
  ai?: { provider: ProviderId; apiKey: string; addedAt: string };
  youtube?: { apiKey: string; addedAt: string };
};

async function getKey(googleSub: string) {
  const passphrase = await loadPassphrase();
  if (!passphrase) throw new Error("Set passphrase in Settings first");
  const envelope = await readConnectorEnvelope();
  if (!envelope) throw new Error("Connect an AI provider in Settings first");
  const payload = await decryptJson<ConnectorsPayload>(envelope, passphrase, googleSub);
  if (!payload.ai) throw new Error("No AI provider configured");
  return {
    provider: payload.ai.provider,
    apiKey: payload.ai.apiKey,
    youtubeKey: payload.youtube?.apiKey,
  };
}

export function PlanClient({
  initialPlan,
  googleSub,
}: {
  initialPlan: MealPlan;
  googleSub: string;
}) {
  const [plan, setPlan] = useState<MealPlan>(initialPlan);
  const [busyDay, setBusyDay] = useState<Day | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Accept state
  const [accepting, setAccepting] = useState(false);
  const [syncingDay, setSyncingDay] = useState<Day | null>(null);
  const [acceptResult, setAcceptResult] = useState<AcceptResult | null>(null);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, chatPending]);

  function toggleLock(day: Day) {
    setPlan((p) => ({
      ...p,
      meals: p.meals.map((m) =>
        m.day === day ? { ...m, locked: !m.locked } : m,
      ),
    }));
    // Note: we save to Drive only on swap/regenerate.
    // Lock state lives in memory until a network change triggers a write.
  }

  async function swapDay(day: Day) {
    setError(null);
    setBusyDay(day);
    try {
      const { provider, apiKey, youtubeKey } = await getKey(googleSub);
      const res = await fetch("/api/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey, youtubeKey, plan, dayToSwap: day }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `${res.status}`);
      }
      const data = (await res.json()) as { plan: MealPlan };
      // Preserve client-side locked flags on un-swapped days
      const merged: MealPlan = {
        ...data.plan,
        meals: data.plan.meals.map((newM) => {
          const oldM = plan.meals.find((x) => x.day === newM.day);
          if (newM.day === day) return newM;
          return { ...newM, locked: oldM?.locked };
        }),
      };
      setPlan(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyDay(null);
    }
  }

  async function regenerateAll() {
    setError(null);
    setBusyDay("all");
    try {
      const { provider, apiKey, youtubeKey } = await getKey(googleSub);
      const lockedDays = plan.meals.filter((m) => m.locked).map((m) => m.day);
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey, youtubeKey, plan, lockedDays }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `${res.status}`);
      }
      const data = (await res.json()) as { plan: MealPlan };
      setPlan(data.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyDay(null);
    }
  }

  async function onAccept() {
    setError(null);
    setAccepting(true);
    setAcceptResult(null);
    try {
      const tz =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch("/api/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId: plan.weekId, timezone: tz }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `${res.status}`);
      }
      const data = (await res.json()) as AcceptResult & { plan?: MealPlan };
      setAcceptResult(data);
      // Reflect accepted status locally + clear modifiedByDay markers
      if (data.plan) setPlan(data.plan);
      else setPlan((p) => ({ ...p, status: "accepted", modifiedByDay: {} }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAccepting(false);
    }
  }

  async function syncDay(day: Day) {
    setError(null);
    setSyncingDay(day);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch("/api/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId: plan.weekId,
          timezone: tz,
          onlyDays: [day],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `${res.status}`);
      }
      const data = (await res.json()) as AcceptResult & { plan?: MealPlan };
      if (data.plan) setPlan(data.plan);
      else
        setPlan((p) => ({
          ...p,
          modifiedByDay: Object.fromEntries(
            Object.entries(p.modifiedByDay ?? {}).filter(([d]) => d !== day),
          ),
        }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncingDay(null);
    }
  }

  async function sendChat() {
    const text = chatDraft.trim();
    if (!text || chatPending) return;
    setError(null);
    setChatDraft("");
    const newHistory: ChatMsg[] = [
      ...chatHistory,
      { role: "user", content: text },
    ];
    setChatHistory(newHistory);
    setChatPending(true);
    try {
      const { provider, apiKey } = await getKey(googleSub);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
          plan,
          history: newHistory,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `${res.status}`);
      }
      const data = (await res.json()) as { reply: string };
      setChatHistory((h) => [...h, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setChatHistory((h) => [
        ...h,
        {
          role: "assistant",
          content: `(error) ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setChatPending(false);
    }
  }

  const lockedCount = plan.meals.filter((m) => m.locked).length;
  const allLocked = lockedCount === 7;
  const isAccepted = plan.status === "accepted";

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Generated by{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {plan.generatedBy.provider}
            </span>{" "}
            ({plan.generatedBy.model})
          </p>
          {lockedCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
              <Lock className="h-3 w-3" />
              {lockedCount}/7
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={regenerateAll}
          disabled={busyDay !== null || allLocked}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-4 w-4 ${busyDay === "all" ? "animate-spin" : ""}`} />
          {busyDay === "all"
            ? "Regenerating…"
            : allLocked
              ? "All meals locked"
              : `Regenerate ${7 - lockedCount} unlocked`}
        </button>
        {error ? (
          <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}
      </section>

      <section className="mt-4 space-y-3">
        {plan.meals.map((m) => {
          const isStaleOnCalendar = Boolean(plan.modifiedByDay?.[m.day]);
          return (
            <MealCard
              key={m.day}
              meal={m}
              busy={busyDay === m.day || busyDay === "all"}
              syncing={syncingDay === m.day}
              isStaleOnCalendar={isStaleOnCalendar}
              onLock={() => toggleLock(m.day)}
              onSwap={() => swapDay(m.day)}
              onSync={() => syncDay(m.day)}
            />
          );
        })}
      </section>

      {/* Accept */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {isAccepted ? "Re-accept" : "Accept"}
        </h2>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {isAccepted
            ? "If you've swapped or regenerated meals, re-accept to overwrite the grocery CSV and replace the existing Calendar events with the new plan."
            : "Writes the grocery CSV to /grocery, marks the plan as accepted, and creates Friday + Sunday recurring reminders plus a Saturday grocery event on your Calendar."}
        </p>
        <button
          type="button"
          onClick={onAccept}
          disabled={accepting || busyDay !== null}
          className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {accepting
            ? "Updating Drive + Calendar…"
            : isAccepted
              ? "Re-accept · overwrite Calendar"
              : "Accept this plan"}
        </button>
        {acceptResult ? (
          <AcceptedSummary result={acceptResult} weekId={plan.weekId} />
        ) : null}
      </section>

      {/* Chat FAB */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        aria-label="Open chat"
        className="fixed bottom-24 right-6 z-30 grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700"
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      {chatOpen ? (
        <ChatSheet
          history={chatHistory}
          draft={chatDraft}
          pending={chatPending}
          scrollRef={chatScrollRef}
          onClose={() => setChatOpen(false)}
          onChange={setChatDraft}
          onSend={sendChat}
        />
      ) : null}
    </>
  );
}

function AcceptedSummary({
  result,
  weekId,
}: {
  result: AcceptResult;
  weekId: string;
}) {
  const events = result.calendar?.events ?? [];
  const deleted = result.calendar?.deleted ?? [];
  const deletedCount = deleted.filter((d) => d.deleted).length;
  return (
    <div className="mt-3 space-y-3 text-sm">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        {result.partial
          ? `Synced. Replaced ${deletedCount} stale Calendar event${deletedCount === 1 ? "" : "s"} for the changed day.`
          : result.reaccept
            ? `Re-accepted. Removed ${deletedCount} previous Calendar event${deletedCount === 1 ? "" : "s"} and rewrote the grocery list.`
            : "Plan accepted. Grocery list and Calendar events written."}
      </div>
      {result.csv ? (
        <a
          href={`https://drive.google.com/file/d/${result.csv.driveFileId}/view`}
          target="_blank"
          rel="noreferrer"
          className="block truncate rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          /AtomicTracker/grocery/{weekId}-list.csv ↗
        </a>
      ) : null}
      {events.length ? (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Calendar events
          </p>
          {events.map((ev, i) => (
            <div
              key={i}
              className={`flex items-center justify-between rounded-md p-2 text-xs ${
                ev.ok
                  ? "border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
                  : "border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
              }`}
            >
              <span className={ev.ok ? "text-slate-700 dark:text-slate-300" : "text-red-900 dark:text-red-300"}>
                {ev.ok ? "✓" : "✗"} {ev.name}
              </span>
              {ev.ok && ev.htmlLink ? (
                <a
                  href={ev.htmlLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 hover:underline dark:text-brand-400"
                >
                  Open ↗
                </a>
              ) : null}
              {!ev.ok && ev.error ? (
                <span className="text-[10px] text-red-700 dark:text-red-400">{ev.error}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChatSheet({
  history,
  draft,
  pending,
  scrollRef,
  onClose,
  onChange,
  onSend,
}: {
  history: ChatMsg[];
  draft: string;
  pending: boolean;
  scrollRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chat with your AI"
      className="fixed inset-0 z-40 flex flex-col bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mt-auto flex h-[80dvh] w-full flex-col rounded-t-xl border-t border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Chat about this plan
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Asks your saved AI provider. Suggestions only — apply with the
              Swap button.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {history.length === 0 ? (
            <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <p>Try asking:</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>&ldquo;Which meal is best for me on a busy day?&rdquo;</li>
                <li>&ldquo;Suggest a swap for Tuesday that&rsquo;s lighter.&rdquo;</li>
                <li>&ldquo;Why was Wednesday&rsquo;s fish chosen?&rdquo;</li>
                <li>&ldquo;What should I prep on Sunday?&rdquo;</li>
              </ul>
            </div>
          ) : (
            history.map((m, i) => (
              <div
                key={i}
                className={`max-w-[90%] rounded-lg p-3 text-sm ${
                  m.role === "user"
                    ? "ml-auto bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                }`}
              >
                {m.content}
              </div>
            ))
          )}
          {pending ? (
            <div className="max-w-[90%] rounded-lg bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              …
            </div>
          ) : null}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
          className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
        >
          <textarea
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Ask anything about this plan…"
            rows={1}
            className="min-h-[40px] flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

function MealCard({
  meal,
  busy,
  syncing,
  isStaleOnCalendar,
  onLock,
  onSwap,
  onSync,
}: {
  meal: Meal;
  busy: boolean;
  syncing: boolean;
  isStaleOnCalendar: boolean;
  onLock: () => void;
  onSwap: () => void;
  onSync: () => void;
}) {
  return (
    <article
      className={`rounded-xl border p-4 transition ${
        meal.locked
          ? "border-amber-300 bg-amber-50/30 dark:border-amber-700 dark:bg-amber-950/20"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      } ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {meal.day} · {meal.cuisine}
          </p>
          <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
            {meal.name}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onLock}
            disabled={busy}
            aria-label={meal.locked ? "Unlock meal" : "Lock meal"}
            title={meal.locked ? "Unlock" : "Lock — won't be replaced on regenerate"}
            className={`grid h-8 w-8 place-items-center rounded-md transition ${
              meal.locked
                ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
                : "border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500 dark:hover:bg-slate-800"
            } disabled:opacity-50`}
          >
            {meal.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
          </button>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            {meal.calories} kcal
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
        <Macro label="P" value={meal.macros.protein_g} />
        <Macro label="C" value={meal.macros.carbs_g} />
        <Macro label="F" value={meal.macros.fat_g} />
        <Macro label="Fib" value={meal.macros.fiber_g} />
      </div>

      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">{meal.health_notes}</p>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
          Ingredients ({meal.ingredients.length})
        </summary>
        <ul className="mt-2 space-y-0.5 text-slate-700 dark:text-slate-300">
          {meal.ingredients.map((ing, j) => (
            <li key={j}>
              {ing.qty} {ing.unit} {ing.name}
            </li>
          ))}
        </ul>
      </details>

      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
          Instructions
        </summary>
        <p className="mt-2 text-slate-700 dark:text-slate-300">{meal.instructions}</p>
      </details>

      {isStaleOnCalendar ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span>Calendar event is stale — meal changed after accept.</span>
          <button
            type="button"
            onClick={onSync}
            disabled={syncing || busy}
            className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
          >
            {syncing ? "Syncing…" : "Sync to Calendar"}
          </button>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {meal.recipe_video ? (
            <a
              href={meal.recipe_video.url}
              target="_blank"
              rel="noreferrer"
              title={`${meal.recipe_video.title} · ${meal.recipe_video.channel}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
            >
              <PlayCircle className="h-3 w-3 shrink-0" />
              <span className="truncate">{meal.recipe_video.title}</span>
            </a>
          ) : null}
          {meal.recipe_url ? (
            <a
              href={meal.recipe_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {meal.recipe_video ? "Browse more" : "Recipe video"}
            </a>
          ) : null}
          <button
            type="button"
            onClick={onSwap}
            disabled={busy || meal.locked}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
            {busy ? "…" : meal.locked ? "Locked" : "Swap"}
          </button>
        </div>
      </div>
    </article>
  );
}

function Macro({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {label} <span className="font-semibold">{value}</span>g
    </span>
  );
}
