"use client";

import { useState } from "react";

export function DataExport() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ filename: string; size: number; files: number } | null>(null);

  async function onDownload() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `${res.status}`);
      }
      const blob = await res.blob();
      const filenameHeader =
        res.headers.get("Content-Disposition") ?? "";
      const match = filenameHeader.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `atomictracker-export.zip`;
      const fileCount = parseInt(
        res.headers.get("X-AtomicTracker-Files") ?? "0",
        10,
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revoke so the browser has time to start the download
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setLast({ filename, size: blob.size, files: fileCount });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onDownload}
        disabled={pending}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Building zip…" : "Download all my data (.zip)"}
      </button>
      {last ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
          ✓ Downloaded <code className="font-mono">{last.filename}</code> · {last.files} files · {formatBytes(last.size)}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900">
          {error}
        </p>
      ) : null}
      <p className="text-[11px] text-slate-400">
        Mirrors your /AtomicTracker Drive folder (config, plans, grocery lists,
        prep state). Open in any text editor or Sheets/Excel.
      </p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
