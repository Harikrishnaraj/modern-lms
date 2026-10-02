"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Bell, GraduationCap, LogOut, Menu, MoreHorizontal, UserCircle, X } from "lucide-react";
import { NAVIGATION, activeNavHref, allNavItems, type NavItem } from "@/config/navigation";
import type { Portal } from "@/types/portal";
import { cn } from "@/lib/utils/cn";

/* Per-portal visual treatment (DESIGN.md §5). Structure is shared; only density and palette differ. */
const THEME: Record<
  Portal,
  { aside: string; brand: string; groupLabel: string; item: string; active: string; idle: string }
> = {
  learner: {
    aside: "bg-surface border-r border-border",
    brand: "text-text",
    groupLabel: "text-text-secondary",
    item: "gap-3 px-3 py-2 text-sm",
    active: "bg-primary-light text-primary font-semibold",
    idle: "text-text-secondary hover:bg-border-subtle hover:text-text",
  },
  instructor: {
    aside: "bg-sidebar-dark border-r border-sidebar-dark-border",
    brand: "text-white",
    groupLabel: "text-sidebar-dark-muted",
    item: "gap-3 px-3 py-2 text-sm",
    active: "bg-primary/25 text-white font-semibold",
    idle: "text-sidebar-dark-text hover:bg-white/5 hover:text-white",
  },
  admin: {
    aside: "bg-surface border-r border-border",
    brand: "text-text",
    groupLabel: "text-text-secondary",
    item: "gap-2.5 px-2.5 py-1.5 text-[13px]",
    active: "bg-primary-light text-primary-dark font-semibold",
    idle: "text-text-secondary hover:bg-border-subtle hover:text-text",
  },
  org_admin: {
    aside: "bg-surface border-r border-border",
    brand: "text-text",
    groupLabel: "text-text-secondary",
    item: "gap-2.5 px-2.5 py-1.5 text-[13px]",
    active: "bg-primary-light text-primary-dark font-semibold",
    idle: "text-text-secondary hover:bg-border-subtle hover:text-text",
  },
};

function Brand({ portal }: { portal: Portal }) {
  const nav = NAVIGATION[portal];
  return (
    <Link href={nav.home} className="flex items-center gap-2.5 rounded-control">
      <span className="flex size-9 items-center justify-center rounded-control bg-primary text-white">
        <GraduationCap className="size-5" aria-hidden="true" />
      </span>
      <span className="leading-tight">
        <span className={cn("block font-display text-[15px] font-bold", THEME[portal].brand)}>
          Modern LMS
        </span>
        <span
          className={cn(
            "block text-[10px] font-semibold tracking-wider uppercase",
            THEME[portal].groupLabel,
          )}
        >
          {nav.label}
        </span>
      </span>
    </Link>
  );
}

function NavLink({
  item,
  portal,
  active,
  onNavigate,
}: {
  item: NavItem;
  portal: Portal;
  active: boolean;
  onNavigate?: () => void;
}) {
  const t = THEME[portal];
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center rounded-control transition-colors",
        t.item,
        active ? t.active : t.idle,
      )}
    >
      <Icon
        className={cn("size-[18px] shrink-0", item.accent === "ai" && !active && "text-ai")}
        aria-hidden="true"
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavTree({ portal, onNavigate }: { portal: Portal; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = activeNavHref(portal, pathname);
  const nav = NAVIGATION[portal];
  const dense = portal === "admin";
  return (
    <nav aria-label={`${nav.label} navigation`} className={dense ? "space-y-3" : "space-y-5"}>
      {nav.groups.map((group, gi) => (
        <div key={group.label ?? gi}>
          {group.label && (
            <p
              className={cn(
                "mb-1 px-3 text-[11px] font-semibold tracking-wider uppercase",
                THEME[portal].groupLabel,
              )}
            >
              {group.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink
                  item={item}
                  portal={portal}
                  active={item.href === active}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Mobile/tablet navigation drawer. Native <dialog> gives focus trap, Escape and inert background. */
function NavDrawer({
  portal,
  dialogRef,
}: {
  portal: Portal;
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  const pathname = usePathname();
  const close = () => dialogRef.current?.close();

  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname, dialogRef]);

  return (
    <dialog
      ref={dialogRef}
      id="nav-drawer"
      aria-label="Navigation"
      className={cn(
        "m-0 h-dvh max-h-dvh w-[280px] max-w-[85vw] p-0 backdrop:bg-text/40",
        THEME[portal].aside,
      )}
      onClick={(e) => {
        if (e.target === dialogRef.current) close();
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-4">
          <Brand portal={portal} />
          <button
            type="button"
            onClick={close}
            className={cn("rounded-control p-2", THEME[portal].idle)}
            aria-label="Close navigation"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <NavTree portal={portal} onNavigate={close} />
        </div>
      </div>
    </dialog>
  );
}

/** Learner mobile bottom bar (DESIGN.md §24 keeps it). */
function LearnerBottomBar({ onOpenMore }: { onOpenMore: () => void }) {
  const pathname = usePathname();
  const nav = NAVIGATION.learner;
  const active = activeNavHref("learner", pathname);
  const items = allNavItems("learner").filter((i) => nav.mobileBar?.includes(i.href));
  const moreActive = !!active && !nav.mobileBar?.includes(active);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === active;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                  isActive ? "text-primary" : "text-text-secondary",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.shortLabel ?? item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onOpenMore}
            aria-haspopup="dialog"
            aria-controls="nav-drawer"
            className={cn(
              "flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
              moreActive ? "text-primary" : "text-text-secondary",
            )}
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

function UserMenu({ email, profileHref, onLogout }: { email: string; profileHref?: string; onLogout: () => Promise<void> }) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[180px] truncate text-sm text-text-secondary sm:inline">
        {email}
      </span>
      {profileHref && (
        <Link href={profileHref} className="rounded-control p-2 text-text-secondary hover:bg-border-subtle hover:text-text" aria-label="My profile">
          <UserCircle className="size-4" aria-hidden="true" />
        </Link>
      )}
      <form action={onLogout}>
        <button
          type="submit"
          className="rounded-control p-2 text-text-secondary hover:bg-border-subtle hover:text-text"
          aria-label="Log out"
        >
          <LogOut className="size-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

function NotificationBell({ href, unread }: { href: string; unread: number }) {
  return (
    <Link
      href={href}
      className="relative rounded-control p-2 text-text-secondary hover:bg-border-subtle hover:text-text"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
    >
      <Bell className="size-5" aria-hidden="true" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

export function PortalShell({
  portal,
  user,
  onLogout,
  unreadNotifications,
  profileHref,
  children,
}: {
  portal: Portal;
  user: { email: string } | null;
  onLogout: () => Promise<void>;
  /** When set, a bell linking to the portal notifications page is shown. */
  unreadNotifications?: number;
  /** When set, a profile icon linking here is shown next to the user's email. */
  profileHref?: string;
  children: ReactNode;
}) {
  const t = THEME[portal];
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDialogElement>(null);
  const openDrawer = () => drawerRef.current?.showModal();

  // Course player is distraction-free: no sidebar or bottom bar, the page draws its own header.
  if (portal === "learner" && /^\/learner\/courses\/[^/]+\/(learn|assessments)\//.test(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside className={cn("sticky top-0 hidden h-dvh w-60 shrink-0 flex-col lg:flex", t.aside)}>
        <div className="px-4 py-5">
          <Brand portal={portal} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <NavTree portal={portal} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={openDrawer}
            aria-haspopup="dialog"
            aria-controls="nav-drawer"
            className="rounded-control p-2 text-text-secondary hover:bg-border-subtle lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <div className="lg:hidden">
            <span className="font-display text-[15px] font-bold">Modern LMS</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {unreadNotifications !== undefined && <NotificationBell href={`/${portal}/notifications`} unread={unreadNotifications} />}
            {user && <UserMenu email={user.email} profileHref={profileHref} onLogout={onLogout} />}
          </div>
        </header>

        <main
          id="main"
          className={cn(
            "mx-auto w-full flex-1 px-4 py-6 md:px-6 lg:px-8 lg:py-8",
            portal === "admin" ? "max-w-[1400px]" : "max-w-[1200px]",
            portal === "learner" && "pb-24 md:pb-8",
          )}
        >
          {children}
        </main>
      </div>

      <NavDrawer portal={portal} dialogRef={drawerRef} />
      {portal === "learner" && <LearnerBottomBar onOpenMore={openDrawer} />}
    </div>
  );
}
