"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Button from "@/components/ui/button/Button";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import { Modal } from "@/components/ui/modal";
import ConnectorsSettings from "@/components/worker/settings/ConnectorsSettings";
import DirectoryHeading from "@/components/worker/settings/DirectoryHeading";
import { IntegrationStatusPill } from "@/components/worker/settings/IntegrationCard";
import MailboxCard from "@/components/worker/settings/MailboxCard";
import SettingsPageHeader from "@/components/worker/settings/SettingsPageHeader";
import ToolsSettings from "@/components/worker/settings/ToolsSettings";
import { useIntegrationCategory, type CategoryInput, type VendorState } from "@/components/worker/settings/useIntegrationCategory";
import { EnvelopeIcon, GmailIcon, GoogleCalendarIcon, JiraIcon, LinearLogoIcon, MoreDotIcon, OutlookIcon, ZohoIcon } from "@/icons";
import { isConnectionTab } from "@/lib/connections";
import { apiFetch, type MailboxStatus } from "@/lib/worker-api";

const iconClass = "size-6";

type Kind = "email" | "apps";

/** Every vendor a worker can sign in to, in the order the directory shows them. */
const EMAIL: CategoryInput = {
  integrationType: "email",
  title: "Email",
  description: "Where the worker sends and receives email.",
  vendors: [
    { system: "gmail", label: "Gmail", icon: <GmailIcon className={iconClass} />, description: "Gmail sends and receives." },
    { system: "outlook", label: "Outlook", icon: <OutlookIcon className={iconClass} />, description: "Sends and looks up messages, but does not receive yet." },
  ],
};
const CRM: CategoryInput = {
  integrationType: "crm",
  title: "Business system of record",
  description: "CRM, helpdesk, ticketing, or project-management tool.",
  vendors: [{ system: "zoho", label: "Zoho", icon: <ZohoIcon className={iconClass} /> }],
};
const HELPDESK: CategoryInput = {
  integrationType: "helpdesk",
  title: "Helpdesk",
  description: "Raise a ticket when the worker hands over, and let customers check their own tickets.",
  vendors: [{ system: "jira", label: "Jira", icon: <JiraIcon className={iconClass} /> }],
};
const PROJECTS: CategoryInput = {
  integrationType: "project_management",
  title: "Project management",
  description: "Linear issues, searchable by the worker.",
  vendors: [{ system: "linear", label: "Linear", icon: <LinearLogoIcon className={iconClass} /> }],
};
const CALENDAR: CategoryInput = {
  integrationType: "calendar",
  title: "Calendar",
  description: "Search events on the connected calendar.",
  vendors: [{ system: "googlecalendar", label: "Google Calendar", icon: <GoogleCalendarIcon className={iconClass} /> }],
};
const KNOWLEDGE: CategoryInput = {
  integrationType: "knowledge_base",
  title: "Knowledge base",
  description: "Pages the worker searches before answering and grounds its replies in.",
  vendors: [
    {
      system: "confluence",
      label: "Confluence",
      icon: <Image src="/images/integrations/confluence.png" alt="" width={24} height={24} className={iconClass} />,
    },
  ],
};

/** What stops working, said before a disconnect goes through. */
const DISCONNECT_EFFECT: Record<string, string> = {
  jira: "The worker stops raising tickets, and customers can no longer check theirs.",
  confluence: "The worker stops answering from these pages.",
  gmail: "The worker can no longer send or receive email through Gmail.",
  outlook: "The worker can no longer send through Outlook, including the emailed code.",
  zoho: "The worker can no longer look things up in Zoho.",
  linear: "The worker can no longer search Linear issues.",
  googlecalendar: "The worker can no longer search the calendar.",
};

/** Where an old tab address lands on the one page. */
const SECTION_FOR_TAB = { email: "connections-available", apps: "connections-available", tools: "connections-tools", connectors: "connections-custom" } as const;

const panelRowClass = "flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4";

function Logo({ children }: { children: ReactNode }) {
  return <span className="flex size-9 shrink-0 items-center justify-center">{children}</span>;
}

/** The three dots at the end of a connected row: everything that can be done to that connection. */
function RowMenu({ label, items }: { label: string; items: { label: string; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} actions`}
        title={`${label} actions`}
        onClick={() => setOpen((value) => !value)}
        className="dropdown-toggle flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors duration-150 ease-out hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
      >
        <MoreDotIcon className="size-5" />
      </button>
      <Dropdown isOpen={open} onClose={close} anchor={anchor} aria-label={`${label} actions`} className="w-44 p-1">
        {items.map((item) => (
          <DropdownItem key={item.label} onItemClick={close} onClick={item.onSelect} className="rounded-lg">
            {item.label}
          </DropdownItem>
        ))}
      </Dropdown>
    </>
  );
}

function ConnectedRow({
  icon,
  name,
  category,
  detail,
  menu,
}: {
  icon: ReactNode;
  name: string;
  category: string;
  detail?: string;
  menu: { label: string; onSelect: () => void }[];
}) {
  return (
    <li className={panelRowClass}>
      <Logo>{icon}</Logo>
      <div className="min-w-0 flex-[1_1_16rem]">
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
          {name}
          <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">{category}</span>
        </p>
        {detail && <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>}
      </div>
      <IntegrationStatusPill status="connected" />
      <RowMenu label={name} items={menu} />
    </li>
  );
}

/**
 * One thing that can be connected. Every card has the same shape (icon, name, what kind of thing it is, one button at
 * the bottom) so a row of them lines up; the description shows over the card on hover or focus, never inside it, so
 * a long one cannot push a button out of line.
 */
function DirectoryCard({
  icon,
  name,
  category,
  description,
  note,
  actionLabel,
  onAction,
  loading = false,
  disabled = false,
}: {
  icon: ReactNode;
  name: string;
  category: string;
  description: string;
  note?: string;
  actionLabel: string;
  onAction?: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const unavailable = !onAction;
  return (
    <article
      tabIndex={0}
      className="group relative flex h-full flex-col gap-4 rounded-xl border border-gray-300/70 bg-white p-5 transition-colors duration-150 ease-out hover:border-gray-400/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700"
    >
      <p
        role="note"
        className="glass-popover pointer-events-none invisible absolute inset-x-3 bottom-[calc(100%-0.375rem)] z-10 rounded-xl border border-gray-200 px-3 py-2.5 text-xs leading-5 text-gray-700 opacity-0 transition-opacity duration-150 ease-out group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 group-focus:visible group-focus:opacity-100 dark:border-white/[0.08] dark:text-gray-300"
      >
        {description}
        {note ? ` ${note}` : ""}
      </p>
      <div className={`flex items-start gap-3 ${unavailable ? "opacity-70" : ""}`}>
        <Logo>{icon}</Logo>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{name}</p>
          <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">{category}</p>
        </div>
      </div>
      <Button size="sm" variant="outline" className="mt-auto w-full" onClick={onAction} loading={loading} disabled={disabled || unavailable}>
        {actionLabel}
      </Button>
    </article>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; count: number }[]; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-gray-800 dark:bg-white/[0.04]">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => !active && onChange(option.value)}
            className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
              active
                ? "bg-white text-gray-800 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-white/90 dark:ring-gray-700"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {option.label}
            <span className="ml-1.5 tabular-nums text-gray-400 dark:text-gray-500">{option.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Settings > Connections: one page, in the order an admin needs it. What is connected comes first as rows, then a
 * directory of what can be connected, then tools (switches, nothing to sign in to), then custom connectors last.
 * It was four tabs (Email, Apps, Tools, Connectors); their old addresses still work and scroll to the right block.
 */
export default function ConnectionsSettings() {
  const email = useIntegrationCategory(EMAIL);
  const crm = useIntegrationCategory(CRM);
  const helpdesk = useIntegrationCategory(HELPDESK);
  const projects = useIntegrationCategory(PROJECTS);
  const calendar = useIntegrationCategory(CALENDAR);
  const knowledge = useIntegrationCategory(KNOWLEDGE);

  const [mailbox, setMailbox] = useState<MailboxStatus | null>(null);
  const [mailboxOpen, setMailboxOpen] = useState(false);
  const loadMailbox = useCallback(() => {
    apiFetch<MailboxStatus>("/mailbox")
      .then(setMailbox)
      .catch(() => setMailbox(null));
  }, []);
  useEffect(loadMailbox, [loadMailbox]);

  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<VendorState | null>(null);

  // An old address (?tab=tools, /settings/connectors) lands on its block.
  const requested = useSearchParams().get("tab");
  useEffect(() => {
    if (!isConnectionTab(requested)) return;
    document.getElementById(SECTION_FOR_TAB[requested])?.scrollIntoView({ block: "start" });
  }, [requested]);

  const all: { kind: Kind; state: VendorState }[] = useMemo(
    () => [
      ...email.vendors.map((state) => ({ kind: "email" as const, state })),
      ...[helpdesk, knowledge, crm, projects, calendar].flatMap((category) => category.vendors.map((state) => ({ kind: "apps" as const, state }))),
    ],
    [email.vendors, helpdesk, knowledge, crm, projects, calendar],
  );
  const connected = all.filter((entry) => entry.state.status === "connected");
  const available = all.filter((entry) => entry.state.status !== "connected");
  const mailboxConnected = Boolean(mailbox?.mailbox);

  const outlookAddress = mailbox?.mail?.platform === "outlook" || mailbox?.mail?.platform === "gmail" ? mailbox.mail.address : null;
  const detailFor = (state: VendorState) =>
    state.integrationType === "email" && outlookAddress ? `${outlookAddress}. ${state.description}` : (state.note ?? state.description);

  const matches = (kind: Kind, text: string) => (filter === "all" || filter === kind) && (!query || text.toLowerCase().includes(query));
  const shownVendors = available.filter((entry) => matches(entry.kind, `${entry.state.vendor.label} ${entry.state.category} ${entry.state.description}`));
  const showMailbox = !mailboxConnected && matches("email", "mailbox email sign in with google or outlook");
  const count = (kind: Kind) => available.filter((entry) => entry.kind === kind).length + (kind === "email" && !mailboxConnected ? 1 : 0);
  const errors = [email, crm, helpdesk, projects, calendar, knowledge].map((category) => category.error).filter(Boolean);

  return (
    <div className="space-y-6 md:space-y-8" data-aix-id="AIX-163">
      <SettingsPageHeader title="Connections" description="Everything this worker connects to or can use." />

      <section aria-labelledby="connections-connected" className="space-y-3">
        <DirectoryHeading id="connections-connected" title="Connected" count={connected.length + (mailboxConnected ? 1 : 0)} />
        {connected.length === 0 && !mailboxConnected ? (
          <p className="rounded-2xl border border-dashed border-gray-300 px-5 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Nothing is connected yet. Pick one below to get started.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-300/70 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-white/[0.03]">
            {mailboxConnected && (
              <ConnectedRow
                icon={<span className="flex size-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400"><EnvelopeIcon className="size-5" /></span>}
                name="Mailbox"
                category="Email"
                detail={mailbox?.mail?.platform === "mailbox" && mailbox.mail.address ? `${mailbox.mail.address}. The worker sends and receives email from this address.` : "The worker sends and receives email from this address."}
                menu={[{ label: "Manage", onSelect: () => setMailboxOpen(true) }]}
              />
            )}
            {connected.map(({ state }) => (
              <ConnectedRow
                key={state.vendor.system}
                icon={state.vendor.icon}
                name={state.vendor.label}
                category={state.category}
                detail={detailFor(state)}
                menu={[
                  ...(state.openSettings ? [{ label: "Settings", onSelect: state.openSettings }] : []),
                  { label: "Disconnect", onSelect: () => setConfirming(state) },
                ]}
              />
            ))}
          </ul>
        )}
        {errors.map((error) => (
          <p key={error} role="alert" className="text-xs font-medium text-error-600 dark:text-error-400">
            {error}
          </p>
        ))}
      </section>

      <section aria-labelledby="connections-available" className="scroll-mt-4 space-y-3">
        <DirectoryHeading id="connections-available" title="Available to connect" count={shownVendors.length + (showMailbox ? 1 : 0)}>
          <Segmented
            label="Filter by type"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: count("email") + count("apps") },
              { value: "email", label: "Email", count: count("email") },
              { value: "apps", label: "Apps", count: count("apps") },
            ]}
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value.trim().toLowerCase())}
            placeholder="Search"
            aria-label="Search available connections"
            className="h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 sm:w-52 dark:border-gray-700 dark:text-white/90 dark:placeholder:text-gray-500"
          />
        </DirectoryHeading>
        {shownVendors.length === 0 && !showMailbox ? (
          <p className="rounded-2xl border border-dashed border-gray-300 px-5 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {available.length === 0 && mailboxConnected ? "Everything is connected." : "Nothing matches. Clear the search or pick All."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
            {showMailbox && (
              <DirectoryCard
                icon={<span className="flex size-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400"><EnvelopeIcon className="size-5" /></span>}
                name="Mailbox"
                category="Email"
                description="Sign in with Google or Outlook. The worker sends and receives email from this address."
                actionLabel="Connect mailbox"
                onAction={() => setMailboxOpen(true)}
              />
            )}
            {shownVendors.map(({ state }) => (
              <DirectoryCard
                key={state.vendor.system}
                icon={state.vendor.icon}
                name={state.vendor.label}
                category={state.category}
                description={state.description}
                note={state.note}
                actionLabel={state.connectLabel ?? "Unavailable"}
                onAction={state.connectLabel ? state.connect : undefined}
                loading={state.connecting}
                disabled={state.busy}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="connections-tools" className="scroll-mt-4">
        <ToolsSettings />
      </section>

      <section aria-labelledby="connections-custom" className="scroll-mt-4 space-y-5 md:space-y-6">
        <ConnectorsSettings />
      </section>

      {[email, crm, helpdesk, projects, calendar, knowledge].map((category, index) => (
        <div key={index}>{category.dialogs}</div>
      ))}

      <Modal
        isOpen={mailboxOpen}
        onClose={() => {
          setMailboxOpen(false);
          loadMailbox();
        }}
        ariaLabel="Mailbox"
        className="m-4 max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 dark:bg-gray-900"
      >
        <h2 className="pr-10 text-lg font-semibold text-gray-800 dark:text-white/90">Mailbox</h2>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">Sign in with Google or Outlook. The worker sends and receives email from this address.</p>
        <div className="mt-5">
          <Suspense fallback={null}>
            <MailboxCard />
          </Suspense>
        </div>
      </Modal>

      <Modal
        isOpen={confirming !== null}
        onClose={() => !confirming?.disconnecting && setConfirming(null)}
        ariaLabel="Disconnect"
        className="m-4 w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900"
      >
        <h2 className="pr-10 text-lg font-semibold text-gray-800 dark:text-white/90">Disconnect {confirming?.vendor.label}?</h2>
        <p className="mt-1.5 text-sm leading-6 text-gray-500 dark:text-gray-400">
          {confirming ? (DISCONNECT_EFFECT[confirming.vendor.system] ?? "The worker can no longer use it.") : ""} You can connect again at any time.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const target = confirming;
              setConfirming(null);
              if (target) void target.disconnect().then(loadMailbox);
            }}
          >
            Disconnect
          </Button>
        </div>
      </Modal>
    </div>
  );
}
