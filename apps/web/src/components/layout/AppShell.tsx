import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ROLE_LABEL, useAuth, useMe } from "../../lib/auth";
import { api } from "../../lib/api";
import { Icon, Loading } from "../ui";
import { NAV, type NavItem } from "./nav";
import { OfflineBanner } from "./OfflineBanner";
import { EmailVerificationBanner } from "../EmailVerificationBanner";

function useUnreadCount() {
  const q = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => api<{ unread: number }>("/notifications/unread-count"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return q.data?.unread ?? 0;
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <img src="/logo-128.webp" alt={compact ? "Nihongo Class" : ""} width={compact ? 44 : 40} height={compact ? 44 : 40} className="shrink-0" />
      {compact ? null : <span className="text-lg font-semibold text-ink">Nihongo Class</span>}
    </div>
  );
}

function NavBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-ai px-1.5 text-xs font-semibold text-white">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

export function AppShell() {
  const me = useMe();
  const { signOut } = useAuth();
  const items = NAV[me.role];
  const unread = useUnreadCount();
  const tabs = items.filter((i) => i.tab);
  const bellItem = items.find((i) => i.icon === "bell");
  // Mobile drawer: non-tab items like Settings, plus Sign out, have no home in the bottom bar.
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const railLink = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-3 rounded-control px-3 no-underline ${isActive ? "bg-kasumi font-medium text-ai" : "text-ink-2 hover:bg-kasumi hover:text-ink"}`
      }
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
      {item.icon === "bell" ? <NavBadge count={unread} /> : null}
    </NavLink>
  );

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-paper focus:px-4 focus:py-2">
        Skip to content
      </a>

      {/* ≥1024px: full rail */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col print:!hidden border-r border-line bg-paper px-3 py-4 lg:flex" aria-label="Main">
        <Brand />
        <nav aria-label="Main navigation" className="mt-6 flex flex-1 flex-col gap-1">
          {items.map(railLink)}
        </nav>
        <div className={`border-t border-line pt-3 ${me.plan?.premium ? "border-l-4 border-l-amber-500 bg-amber-50 rounded-r-control px-1" : ""}`}>
          <p className="truncate px-3 text-sm font-medium">
            {me.name}
            {me.plan?.premium ? <span className="ml-1 text-amber-700" title="Premium">⭐</span> : null}
          </p>
          <p className="truncate px-3 text-sm text-ink-2">
            {ROLE_LABEL[me.role]}
            {me.school ? `, ${me.school.name}` : ""}
          </p>
          <button type="button" onClick={() => void signOut()} className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-ink-2 hover:bg-kasumi hover:text-ink">
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </aside>

      {/* 768–1023px: collapsed rail */}
      <aside className="fixed inset-y-0 left-0 hidden w-20 flex-col print:!hidden items-center border-r border-line bg-paper py-4 md:flex lg:hidden" aria-label="Main">
        <Brand compact />
        <nav aria-label="Main navigation" className="mt-6 flex flex-1 flex-col gap-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex w-16 flex-col items-center gap-0.5 rounded-control px-1 py-2 text-center text-[11px] leading-tight no-underline ${isActive ? "bg-kasumi font-medium text-ai" : "text-ink-2 hover:bg-kasumi hover:text-ink"}`
              }
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.icon === "bell" && unread ? <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-ai" aria-label={`${unread} unread`} /> : null}
            </NavLink>
          ))}
        </nav>
        <button type="button" onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className="flex h-11 w-11 items-center justify-center rounded-control text-ink-2 hover:bg-kasumi">
          <Icon name="logout" />
        </button>
      </aside>

      {/* <768px: top bar and bottom tabs */}
      <header className="sticky top-0 z-20 flex print:hidden items-center justify-between border-b border-line bg-paper px-4 py-1 md:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          {bellItem && !bellItem.tab ? (
            <NavLink to={bellItem.to} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-2">
              <Icon name="bell" />
              {unread ? <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-ai" /> : null}
            </NavLink>
          ) : null}
          <button type="button" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(true)} className="inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-2">
            <Icon name="menu" />
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-30 md:hidden print:hidden">
          <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-ink/40" />
          <aside className="absolute right-0 top-0 flex h-dvh w-[86%] max-w-80 flex-col gap-1 bg-paper px-3 py-4 shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-2">
                <Icon name="x" />
              </button>
            </div>
            <nav aria-label="All pages" className="mt-4 flex flex-col gap-1">
              {items.map(railLink)}
            </nav>
            <div className={`mt-auto border-t border-line pt-3 ${me.plan?.premium ? "border-l-4 border-l-amber-500 bg-amber-50 rounded-r-control px-1" : ""}`}>
              <p className="truncate px-3 text-sm font-medium">
                {me.name}
                {me.plan?.premium ? <span className="ml-1 text-amber-700" title="Premium">⭐</span> : null}
              </p>
              <p className="truncate px-3 text-sm text-ink-2">
                {ROLE_LABEL[me.role]}
                {me.school ? `, ${me.school.name}` : ""}
              </p>
              <button type="button" onClick={() => { setMenuOpen(false); void signOut(); }} className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-ink-2 hover:bg-kasumi hover:text-ink">
                <Icon name="logout" />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="md:pl-20 lg:pl-60 print:!pl-0">
        <OfflineBanner />
        <EmailVerificationBanner />
        <main id="main" className="mx-0 w-full max-w-[1120px] px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <nav aria-label="Main navigation" className="print:hidden fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) => `relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] no-underline ${isActive ? "font-medium text-ai" : "text-ink-2"}`}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.icon === "bell" && unread ? <span className="absolute right-[30%] top-2 h-2 w-2 rounded-full bg-ai" aria-label={`${unread} unread`} /> : null}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
