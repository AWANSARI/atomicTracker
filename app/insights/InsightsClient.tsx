"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, Lightbulb } from "lucide-react";
import type { InsightCard, InsightSeverity } from "@/lib/tracker/insights";

type Props = {
  cards: InsightCard[];
};

export function InsightsClient({ cards }: Props) {
  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
        <Lightbulb className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
        <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-50">
          Not enough data yet
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Most rules need at least 3 days of logs in the last 7-14 days. Log
          energy, sleep, and tick off habits for a few days, and insight cards
          will show up here.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {cards.map((card) => (
        <li key={card.id}>
          <Card card={card} />
        </li>
      ))}
    </ul>
  );
}

function Card({ card }: { card: InsightCard }) {
  const sev = card.severity;
  return (
    <article
      className={`rounded-xl border-l-4 ${borderColor(sev)} border-y border-r ${edgeColor(sev)} bg-white p-4 dark:bg-slate-900`}
    >
      <header className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5 shrink-0">
          <SeverityIcon sev={sev} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            {card.title}
          </h3>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {card.dataWindow}
          </p>
        </div>
      </header>
      <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {card.body}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {card.suggestedAction ? (
          card.suggestedAction.href ? (
            <Link
              href={card.suggestedAction.href}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {card.suggestedAction.label}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {card.suggestedAction.label}
            </span>
          )
        ) : null}

        {card.citations && card.citations.length > 0 ? (
          <details className="group text-xs">
            <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              {card.citations.length} citation
              {card.citations.length === 1 ? "" : "s"} · tap to view
            </summary>
            <ul className="mt-2 max-w-xs space-y-0.5 rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
              {card.citations.map((c) => (
                <li key={c} className="font-mono">
                  {c}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </article>
  );
}

function SeverityIcon({ sev }: { sev: InsightSeverity }) {
  if (sev === "warn") {
    return (
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
    );
  }
  if (sev === "success") {
    return (
      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
    );
  }
  return <Info className="h-4 w-4 text-brand-600 dark:text-brand-400" />;
}

function borderColor(sev: InsightSeverity): string {
  switch (sev) {
    case "warn":
      return "border-l-amber-500";
    case "success":
      return "border-l-emerald-500";
    default:
      return "border-l-brand-600";
  }
}

function edgeColor(sev: InsightSeverity): string {
  // Pair the warn / success / info accent with a soft top/right/bottom edge.
  // Kept neutral so the left-rule reads as the dominant signal.
  switch (sev) {
    case "warn":
      return "border-amber-200 dark:border-amber-900";
    case "success":
      return "border-emerald-200 dark:border-emerald-900";
    default:
      return "border-slate-200 dark:border-slate-800";
  }
}
