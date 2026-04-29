"use client";

import { useMemo, useState } from "react";

type SuccessState = {
  year: number;
  planCount: number;
  webViewLink: string;
};

type ApiResponse = {
  ok?: boolean;
  year?: number;
  planCount?: number;
  fileId?: string;
  driveFileId?: string;
  webViewLink?: string;
  error?: string;
  reason?: string;
};

export function ArchiveSection() {
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const options: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) {
      options.push(y);
    }
    return options;
  }, [currentYear]);

  const [year, setYear] = useState<number>(currentYear - 1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  async function onBuild() {
    setError(null);
    setSuccess(null);
    setPending(true);
    try {
      const res = await fetch("/api/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok || !data.ok) {
        if (data.reason === "no_plans") {
          throw new Error(
            `No accepted plans found for ${year}. Accept at least one plan first.`,
          );
        }
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const fileId = data.fileId ?? data.driveFileId ?? "";
      const webViewLink =
        data.webViewLink ??
        (fileId ? `https://drive.google.com/file/d/${fileId}/view` : "");
      setSuccess({
        year: data.year ?? year,
        planCount: data.planCount ?? 0,
        webViewLink,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Year
        </span>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          disabled={pending}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:[color-scheme:dark]"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
              {y === currentYear ? " (in progress)" : ""}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onBuild}
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Building…" : `Build ${year} archive`}
      </button>
      {success ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="font-medium">
            Archive built for {success.year} ({success.planCount}{" "}
            {success.planCount === 1 ? "plan" : "plans"}).
          </p>
          {success.webViewLink ? (
            <a
              href={success.webViewLink}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block underline underline-offset-2 hover:text-emerald-700 dark:hover:text-emerald-100"
            >
              Open {success.year}.xlsx in Drive
            </a>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Bundles every accepted plan from the chosen year into a single XLSX in
        /AtomicTracker/archive/. Re-running overwrites the existing file.
      </p>
    </div>
  );
}
