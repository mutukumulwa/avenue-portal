"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from "react";
import {
  LayoutDashboard,
  Inbox,
  UserCheck,
  FileText,
  Layers,
  ShieldCheck,
  FilePlus2,
  Banknote,
  ScrollText,
  BarChart3,
  IdCard,
  Users,
  KeyRound,
  Cable,
  LogOut,
  ChevronDown,
  Menu,
  X,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  resolveActiveProviderNavHref,
  type ProviderNavGroupView,
  type ProviderNavIconKey,
  type ProviderNavItemView,
} from "./provider-nav-model";
import { ROLE_LABELS, SignedInIdentity } from "./SignedInIdentity";

// iconKey → component map (icons cannot cross the server→client boundary as
// values, so the server passes a stable string key that we resolve here).
const ICONS: Record<ProviderNavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  eligibility: UserCheck,
  claims: FileText,
  cases: Layers,
  preauth: ShieldCheck,
  "new-claim": FilePlus2,
  settlements: Banknote,
  contracts: ScrollText,
  performance: BarChart3,
  profile: IdCard,
  users: Users,
  "api-keys": KeyRound,
  integrations: Cable,
};

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal";
const ACTIVE = "bg-brand-indigo/10 text-brand-indigo";
const IDLE = "text-brand-text-body hover:bg-brand-bg-alt hover:text-brand-indigo";

type Current = "page" | "true" | undefined;

/**
 * Every disclosure in the bar closes the same ways: Escape closes it and puts
 * focus back on its button; a press anywhere outside closes it and leaves focus
 * where the press put it. The listeners exist only while it is open.
 */
function useDismiss(open: boolean, container: RefObject<HTMLElement | null>, trigger: RefObject<HTMLButtonElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      close();
      trigger.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, container, trigger, close]);
}

/**
 * Tabbing out of an open disclosure closes it. A blur with no destination is
 * ignored: Safari does not focus a clicked button or link, so a click INSIDE
 * the panel looks like that — and closing then would swallow the click.
 * Presses outside are the pointer listener's job.
 */
function closeWhenFocusLeaves(close: () => void) {
  return (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && !event.currentTarget.contains(next)) close();
  };
}

/** Up/Down (and Home/End) move between the entries of an open panel. */
function moveBetweenEntries(event: KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const entries = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-nav-entry]"));
  if (entries.length === 0) return;
  event.preventDefault();
  const at = entries.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "Home" ? 0
    : event.key === "End" ? entries.length - 1
    : event.key === "ArrowDown" ? (at + 1) % entries.length
    : at <= 0 ? entries.length - 1 : at - 1;
  entries[next]?.focus();
}

function NavEntry({ item, current, onNavigate, layout }: { item: ProviderNavItemView; current: Current; onNavigate?: () => void; layout: "bar" | "list" }) {
  const Icon = ICONS[item.iconKey];
  const shape = layout === "bar" ? "gap-1.5 rounded-lg px-3 py-2" : "min-h-11 w-full gap-2 rounded-md px-3 py-2";
  return (
    <Link
      href={item.href}
      aria-current={current}
      data-nav-entry=""
      onClick={onNavigate}
      className={`flex items-center whitespace-nowrap text-sm font-semibold transition-colors ${shape} ${current ? ACTIVE : IDLE} ${FOCUS}`}
    >
      <Icon size={15} aria-hidden="true" className="shrink-0" />
      {item.label}
    </Link>
  );
}

/** One task-labelled menu of the desktop bar (disclosure pattern: a button and a list of links). */
function NavMenu({ group, open, onToggle, onClose, currentFor, alignEnd }: {
  group: ProviderNavGroupView;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  currentFor: (href: string) => Current;
  alignEnd: boolean;
}) {
  const container = useRef<HTMLLIElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useDismiss(open, container, trigger, onClose);
  const panelId = `provider-nav-${group.group}`;
  const holdsCurrent = group.items.some((item) => currentFor(item.href) !== undefined);
  const afterNavigate = () => {
    onClose();
    trigger.current?.focus();
  };

  return (
    <li ref={container} className="relative" onBlur={closeWhenFocusLeaves(onClose)} onKeyDown={open ? moveBetweenEntries : undefined}>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-current={holdsCurrent ? "true" : undefined}
        onClick={onToggle}
        className={`flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${holdsCurrent || open ? ACTIVE : IDLE} ${FOCUS}`}
      >
        {group.label}
        <ChevronDown size={14} aria-hidden="true" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <ul
        id={panelId}
        aria-label={group.label}
        hidden={!open}
        className={`absolute top-full z-50 mt-1 min-w-[14rem] space-y-0.5 rounded-lg border border-[#EEEEEE] bg-white p-1 shadow-lg ${alignEnd ? "right-0" : "left-0"}`}
      >
        {group.items.map((item) => (
          <li key={item.key}>
            <NavEntry item={item} current={currentFor(item.href)} onNavigate={afterNavigate} layout="list" />
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * Below `xl` the bar is one button. Its panel lists every group as a labelled
 * section, and it sits straight after the button in the document so Tab moves
 * from the button into it.
 */
function CompactMenu({ groups, open, onToggle, onClose, currentFor }: {
  groups: ProviderNavGroupView[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  currentFor: (href: string) => Current;
}) {
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useDismiss(open, container, trigger, onClose);
  const afterNavigate = () => {
    onClose();
    trigger.current?.focus();
  };

  return (
    <div ref={container} className="shrink-0 xl:hidden" onBlur={closeWhenFocusLeaves(onClose)} onKeyDown={open ? moveBetweenEntries : undefined}>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="provider-nav-panel"
        onClick={onToggle}
        className={`flex h-10 items-center gap-1.5 rounded-lg border border-[#EEEEEE] px-2.5 text-sm font-semibold text-brand-text-heading transition-colors hover:bg-brand-bg-alt ${FOCUS}`}
      >
        {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        <span className="sr-only sm:not-sr-only">Menu</span>
      </button>
      <nav
        id="provider-nav-panel"
        aria-label="Provider"
        hidden={!open}
        className="absolute inset-x-0 top-full max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-[#EEEEEE] bg-white shadow-lg"
      >
        <div className="mx-auto grid max-w-7xl gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const labelId = `provider-nav-panel-${group.group}`;
            return (
              <div key={group.group} className="min-w-0">
                <p id={labelId} className="px-3 pb-1 text-[11px] font-bold uppercase text-brand-text-muted">{group.label}</p>
                <ul aria-labelledby={labelId} className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.key}>
                      <NavEntry item={item} current={currentFor(item.href)} onNavigate={afterNavigate} layout="list" />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
}

/**
 * Identity, the facility profile, and logout. Its button shows the signed-in
 * name and persona at every width (DEF-001/DEF-002), in space of its own.
 */
function AccountMenu({ providerName, actorName, roleLabel, items, open, onToggle, onClose, currentFor }: {
  providerName: string;
  actorName: string | null;
  roleLabel: string | null;
  items: ProviderNavItemView[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  currentFor: (href: string) => Current;
}) {
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useDismiss(open, container, trigger, onClose);
  const persona = roleLabel ?? ROLE_LABELS.PROVIDER_USER;
  const afterNavigate = () => {
    onClose();
    trigger.current?.focus();
  };

  return (
    // `flex` so the button can shrink with its box and truncate the name,
    // rather than keep its full width and push past the viewport edge.
    <div ref={container} className="relative ml-auto flex min-w-0" onBlur={closeWhenFocusLeaves(onClose)} onKeyDown={open ? moveBetweenEntries : undefined}>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="provider-account-menu"
        // Spelled out so name and persona are read as two words everywhere,
        // not run together from two stacked spans; it contains the visible text.
        aria-label={actorName ? `Account: ${actorName}, ${persona}` : `Account, ${persona}`}
        onClick={onToggle}
        className={`flex min-w-0 max-w-[14rem] items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-brand-bg-alt ${FOCUS}`}
      >
        {/* Decorative; below `sm` its width goes to the name instead. */}
        <span aria-hidden="true" className="hidden h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-indigo/10 text-xs font-bold text-brand-indigo sm:grid">
          {actorName ? initialsOf(actorName) : <UserRound size={16} />}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-brand-text-heading">{actorName ?? "Account"}</span>
          <span className="block truncate text-[11px] text-brand-text-muted">{persona}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-brand-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        id="provider-account-menu"
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] space-y-1 rounded-lg border border-[#EEEEEE] bg-white p-2 shadow-lg"
      >
        {/* DEF-001/DEF-002: signed-in actor, real persona label (falls back to
            the generic "Provider" when no persona role is resolved), facility. */}
        <SignedInIdentity variant="sidebar" name={actorName} role="PROVIDER_USER" roleLabel={roleLabel} subtitle={providerName} />
        {items.length > 0 && (
          <ul aria-label="Account" className="space-y-0.5">
            {items.map((item) => (
              <li key={item.key}>
                <NavEntry item={item} current={currentFor(item.href)} onNavigate={afterNavigate} layout="list" />
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          data-nav-entry=""
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={`flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-brand-error transition-colors hover:bg-red-50 ${FOCUS}`}
        >
          <LogOut size={15} aria-hidden="true" />
          Logout
        </button>
      </div>
    </div>
  );
}

/**
 * F1.4: renders the already permission-filtered nav computed server-side
 * (computeProviderNav). It receives only browser-safe {key,label,href,iconKey}
 * items — never permissions, provider id, or branch scope. Hiding an item is
 * convenience only; every route stays server-authorized.
 *
 * Family Hospital UAT plan P06 (FH-08). The old bar put every destination,
 * the identity block and Logout in one fixed-height row that could not wrap,
 * so with a facility administrator's items it ran over the brand and Dashboard
 * could not be clicked. Now:
 *
 * - the brand and the account menu share a top row with nothing else in it;
 * - from `xl` a second row holds the direct destinations and one menu per
 *   task group; it may wrap, so it can never overflow or overlap;
 * - below `xl` that row is a single Menu button with a panel listing every
 *   group, so nothing is laid out beneath the logo at compact widths;
 * - the current destination is marked, and so is the menu that holds it.
 *
 * Only one disclosure is open at a time. Like the drawer (P11.02), the open
 * state records the path it was opened on, so navigating closes it without an
 * effect to keep in step.
 */
export function ProviderNav({ providerName, groups, actorName, roleLabel }: { providerName: string; groups: ProviderNavGroupView[]; actorName?: string | null; roleLabel?: string | null }) {
  const pathname = usePathname();
  const [openFor, setOpenFor] = useState<{ key: string; path: string } | null>(null);
  const isOpen = (key: string) => openFor?.key === key && openFor.path === pathname;
  const toggle = (key: string) => setOpenFor((prev) => (prev?.key === key && prev.path === pathname ? null : { key, path: pathname }));
  const close = useCallback(() => setOpenFor(null), []);

  const activeHref = resolveActiveProviderNavHref(pathname, groups.flatMap((group) => group.items.map((item) => item.href)));
  const currentFor = (href: string): Current => (href !== activeHref ? undefined : pathname === href ? "page" : "true");

  const direct = groups.filter((group) => group.presentation === "direct").flatMap((group) => group.items);
  const menus = groups.filter((group) => group.presentation === "menu");
  const accountItems = groups.filter((group) => group.presentation === "account").flatMap((group) => group.items);
  const navGroups = groups.filter((group) => group.presentation !== "account");

  return (
    <header data-provider-shell="" className="sticky top-0 z-40 border-b border-[#EEEEEE] bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3">
        {navGroups.length > 0 && (
          <CompactMenu groups={navGroups} open={isOpen("compact")} onToggle={() => toggle("compact")} onClose={close} currentFor={currentFor} />
        )}
        {/* Below `sm` there is no facility name and the mark never shrinks — the
            account button gives way instead. From `sm` the facility name truncates. */}
        <Link href="/provider/dashboard" className={`flex shrink-0 items-center gap-2 rounded-lg sm:min-w-0 sm:shrink ${FOCUS}`}>
          <span aria-hidden="true" className="h-7 w-7 shrink-0 rounded-full bg-brand-indigo" />
          <span className="shrink-0 font-heading text-lg font-bold text-brand-indigo">Medvex</span>
          <span className="hidden min-w-0 truncate text-sm text-brand-text-muted sm:inline">· {providerName}</span>
        </Link>
        <AccountMenu
          providerName={providerName}
          actorName={actorName?.trim() || null}
          roleLabel={roleLabel ?? null}
          items={accountItems}
          open={isOpen("account")}
          onToggle={() => toggle("account")}
          onClose={close}
          currentFor={currentFor}
        />
      </div>
      {navGroups.length > 0 && (
        <nav aria-label="Provider" className="hidden border-t border-[#EEEEEE] xl:block">
          <ul className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-1.5">
            {direct.map((item) => (
              <li key={item.key}>
                <NavEntry item={item} current={currentFor(item.href)} layout="bar" />
              </li>
            ))}
            {menus.map((group, index) => (
              <NavMenu
                key={group.group}
                group={group}
                open={isOpen(group.group)}
                onToggle={() => toggle(group.group)}
                onClose={close}
                currentFor={currentFor}
                alignEnd={index === menus.length - 1}
              />
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
