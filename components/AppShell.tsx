import Link from "next/link";
import { ClipboardList, Home, Settings, ArrowLeft } from "lucide-react";

/**
 * Shared layout shell with a sticky header at the top, scrollable content
 * in the middle, and a fixed bottom nav.
 *
 * Page usage:
 *   <AppShell title="Dashboard" backHref="/">
 *     <YourPageContent />
 *   </AppShell>
 */
export function AppShell({
  title,
  subtitle,
  backHref,
  rightSlot,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-[#0d1117]/90">
        <div className="mx-auto flex max-w-md items-center gap-3 px-6 py-3">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Back"
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          ) : (
            <div
              aria-hidden
              className="grid h-9 w-9 place-items-center rounded-md bg-brand-600 text-sm font-bold text-white"
            >
              A
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            ) : null}
          </div>
          {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <div className="mx-auto max-w-md px-6 py-6">{children}</div>
      </main>

      <BottomNav />
    </div>
  );
}

function BottomNav() {
  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-[#0d1117]/95"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-6 py-2">
        <NavItem href="/dashboard" label="Home" Icon={Home} />
        <NavItem href="/trackers" label="Trackers" Icon={ClipboardList} />
        <NavItem href="/settings" label="Settings" Icon={Settings} />
      </div>
    </nav>
  );
}

function NavItem({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="flex flex-1 flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-[10px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
