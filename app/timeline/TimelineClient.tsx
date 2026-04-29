"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckSquare,
  Pill,
  Square,
  UtensilsCrossed,
} from "lucide-react";
import type { TimelineEntry } from "@/lib/tracker/timeline";

export function TimelineClient({
  dateIso,
  entries,
  printMode = false,
  hasMeals,
  hasSupplements,
  hasHabits,
}: {
  dateIso: string;
  entries: TimelineEntry[];
  printMode?: boolean;
  hasMeals: boolean;
  hasSupplements: boolean;
  hasHabits: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (printMode) {
    return (
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wider text-slate-600">
            <th className="w-20 py-2">Time</th>
            <th className="py-2">What</th>
            <th className="w-20 py-2">Type</th>
            <th className="py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.key} className="border-b border-slate-100">
              <td className="py-2 align-top font-mono text-xs">{e.time}</td>
              <td className="py-2 align-top font-medium">{e.title}</td>
              <td className="py-2 align-top text-xs uppercase tracking-wider text-slate-500">
                {e.kind}
              </td>
              <td className="py-2 align-top text-xs text-slate-600">
                {e.subtitle ?? ""}
                {e.hasWarning && e.meta?.warnings ? (
                  <span className="block text-[11px] text-amber-700">
                    ⚠ {e.meta.warnings}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <section className="mt-4 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {dateIso} · {entries.length} entries
      </p>
      <ol className="space-y-1.5">
        {entries.map((e) => {
          const isOpen = openKey === e.key;
          return (
            <li
              key={e.key}
              className={`overflow-hidden rounded-lg border transition ${chipBorder(
                e,
              )} ${isOpen ? "shadow-sm" : ""}`}
            >
              <button
                type="button"
                onClick={() => setOpenKey(isOpen ? null : e.key)}
                className={`flex w-full items-start gap-3 px-3 py-2 text-left ${chipBg(
                  e,
                )}`}
                aria-expanded={isOpen}
              >
                <span className="w-12 shrink-0 pt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {e.time}
                </span>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/70 dark:bg-slate-900/70">
                  <KindIcon kind={e.kind} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                    {e.title}
                  </span>
                  {e.subtitle ? (
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {e.subtitle}
                    </span>
                  ) : null}
                </span>
                {e.hasWarning ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                ) : null}
              </button>
              {isOpen && e.meta ? (
                <div className="border-t border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  {Object.entries(e.meta).map(([k, v]) => (
                    <p key={k} className="flex justify-between gap-3 py-0.5">
                      <span className="text-slate-400 dark:text-slate-500">
                        {k}
                      </span>
                      <span className="text-right text-slate-700 dark:text-slate-300">
                        {v}
                      </span>
                    </p>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* Help-text: which trackers contributed to this view. */}
      <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
        Sources:{" "}
        {[
          hasMeals ? "meal plan" : null,
          hasSupplements ? "supplement schedule" : null,
          hasHabits ? "habits" : null,
        ]
          .filter(Boolean)
          .join(" · ") || "none yet"}
        .
      </p>
    </section>
  );
}

function KindIcon({ kind }: { kind: TimelineEntry["kind"] }) {
  if (kind === "meal") return <UtensilsCrossed className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />;
  if (kind === "supplement") return <Pill className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />;
  if (kind === "habit") return <Square className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />;
  return <CheckSquare className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />;
}

function chipBg(e: TimelineEntry): string {
  if (e.tone === "warn") {
    return "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50";
  }
  if (e.kind === "meal") {
    return "bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/30 dark:hover:bg-brand-950/50";
  }
  if (e.kind === "supplement") {
    return "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50";
  }
  if (e.kind === "habit") {
    return "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800";
  }
  return "bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/50";
}

function chipBorder(e: TimelineEntry): string {
  if (e.tone === "warn") return "border-amber-200 dark:border-amber-900";
  if (e.kind === "meal") return "border-brand-200 dark:border-brand-900";
  if (e.kind === "supplement") return "border-emerald-200 dark:border-emerald-900";
  if (e.kind === "habit") return "border-slate-200 dark:border-slate-800";
  return "border-rose-200 dark:border-rose-900";
}
