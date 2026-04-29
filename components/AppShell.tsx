import Link from "next/link";

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
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-md items-center gap-3 px-6 py-3">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Back"
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ←
            </Link>
          ) : (
            <div
              aria-hidden
              className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-base font-bold text-white shadow-sm"
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
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-6 py-2">
        <NavItem href="/dashboard" label="Home" icon="🏠" />
        <NavItem href="/trackers" label="Trackers" icon="📋" />
        <NavItem href="/settings" label="Settings" icon="⚙️" />
      </div>
    </nav>
  );
}

function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex flex-1 flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900"
    >
      <span aria-hidden className="text-lg leading-none">
        {icon}
      </span>
      {label}
    </Link>
  );
}
