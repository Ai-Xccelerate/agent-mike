"use client";

import AgentAvatar from "@/components/aix/AgentAvatar";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { CheckCircleIcon, DocsIcon, EnvelopeIcon, PlugInIcon, UserCircleIcon } from "@/icons";
import { AgentProfile, NylasMailbox, apiFetch } from "@/lib/mike-api";
import { useEffect, useState } from "react";

const fallback: AgentProfile = {
  id: "demo",
  name: "Mike",
  display_name: "Agent Mike",
  email: "agent.mike@wkr.email",
  role: "Level 1 product support specialist for trained products and solutions.",
  tone: "Warm, concise, practical, and honest about uncertainty.",
  manager_name: "Charan Naik",
  manager_email: "charan@aixccelerate.com",
  auto_reply: true,
  confidence_threshold: 0.72,
  max_agent_turns: 3,
  guardrails: [
    "Never invent product behavior or policies.",
    "Never request passwords, secrets, or full payment card details.",
    "Escalate billing disputes, security incidents, legal threats, and account deletion.",
    "Use only the supplied knowledge when making product-specific claims.",
  ],
  escalation_terms: ["refund", "chargeback", "lawyer", "breach", "security incident", "delete my account", "cancel subscription"],
  updated_at: new Date().toISOString(),
};

const sections = [
  { id: "identity", label: "Identity", icon: UserCircleIcon },
  { id: "role", label: "Role", icon: DocsIcon },
  { id: "guardrails", label: "Guardrails", icon: CheckCircleIcon },
  { id: "manager", label: "Human manager", icon: UserCircleIcon },
  { id: "integrations", label: "Integrations", icon: PlugInIcon },
];

const fieldClass = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const textareaClass = "w-full resize-y rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm leading-6 text-gray-800 shadow-theme-xs outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";
const cardClass = "scroll-mt-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6";

export default function MikeSettings() {
  const [profile, setProfile] = useState(fallback);
  const [mailboxEmail, setMailboxEmail] = useState("agent.mike@wkr.email");
  const [mailbox, setMailbox] = useState<NylasMailbox | null>(null);
  const [grantFromEnv, setGrantFromEnv] = useState(false);
  const [active, setActive] = useState("identity");
  const [saving, setSaving] = useState(false);
  const [savingMailbox, setSavingMailbox] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    apiFetch<AgentProfile>("/agent").then(setProfile).catch(() => undefined);
    apiFetch<{ mailbox: NylasMailbox | null; grant_from_env?: boolean }>("/mailboxes")
      .then((data) => {
        setMailbox(data.mailbox);
        setGrantFromEnv(Boolean(data.grant_from_env));
        if (data.mailbox?.email) setMailboxEmail(data.mailbox.email);
      })
      .catch(() => undefined);
  }, []);

  function update<K extends keyof AgentProfile>(key: K, value: AgentProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setNotice("");
    try {
      const payload: Partial<AgentProfile> = { ...profile };
      delete payload.id;
      delete payload.updated_at;
      const updated = await apiFetch<AgentProfile>("/agent", { method: "PATCH", body: JSON.stringify(payload) });
      setProfile(updated);
      setNotice("Mike’s settings are live.");
    } catch {
      setNotice("Saved in this preview. Start the API to persist these settings.");
    } finally { setSaving(false); }
  }

  async function saveMailbox() {
    setSavingMailbox(true);
    setNotice("");
    try {
      const data = await apiFetch<{ mailbox: NylasMailbox; grant_from_env?: boolean }>("/mailboxes", {
        method: "PUT",
        body: JSON.stringify({ email: mailboxEmail }),
      });
      setMailbox(data.mailbox);
      setGrantFromEnv(Boolean(data.grant_from_env));
      setNotice("Nylas mailbox linked to this organization.");
    } catch {
      setNotice(
        grantFromEnv
          ? "Could not save mailbox. Check the email and try again."
          : "Could not save mailbox. NYLAS_GRANT_ID must be set on the API service.",
      );
    } finally {
      setSavingMailbox(false);
    }
  }

  function jump(id: string) { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  const nylasStatus = !grantFromEnv
    ? "Needs env config"
    : mailbox
      ? "Linked"
      : "Not linked";
  const nylasDetail = !grantFromEnv
    ? "Grant from environment"
    : mailbox
      ? mailbox.email
      : "Save mailbox email to bind this org";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-col gap-4 border-b border-gray-200/80 pb-4 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between md:pb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
            Mike settings
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Control who Mike is, what he can handle, and when you step in.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {notice && (
            <span className="text-xs text-success-600 dark:text-success-400">{notice}</span>
          )}
          <Button loading={saving} onClick={save}>
            Save changes
          </Button>
        </div>
      </header>

      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-5 md:mt-6 md:gap-6 lg:flex-row">
        <aside className="shrink-0 lg:w-60">
          <nav className="flex flex-wrap gap-1 lg:flex-col">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => jump(section.id)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                    active === section.id
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
                  }`}
                >
                  <Icon className="size-4" />
                  {section.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pb-2 md:space-y-6">
          <section id="identity" onMouseEnter={() => setActive("identity")} className={cardClass}>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <AgentAvatar name="Mike" size="lg" showStatus />
              <div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Identity</h2><Badge size="sm" color="success">Active</Badge></div><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">How Mike introduces himself across email and chat.</p></div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Internal name<input value={profile.name} onChange={(event) => update("name", event.target.value)} className={`${fieldClass} mt-2`} /></label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Customer-facing name<input value={profile.display_name} onChange={(event) => update("display_name", event.target.value)} className={`${fieldClass} mt-2`} /></label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">Support email address<div className="relative mt-2"><EnvelopeIcon className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" /><input value={profile.email} onChange={(event) => update("email", event.target.value)} className={`${fieldClass} pl-10`} /></div><span className="mt-1.5 block text-xs font-normal text-gray-500">Display address. Link the Nylas mailbox under Integrations for this org.</span></label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">Tone<textarea rows={3} value={profile.tone} onChange={(event) => update("tone", event.target.value)} className={`${textareaClass} mt-2`} /></label>
            </div>
          </section>

          <section id="role" onMouseEnter={() => setActive("role")} className={cardClass}>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Role and scope</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Define Level 1 support in plain language. This becomes part of Mike’s system prompt.</p>
            <label className="mt-5 block text-sm font-medium text-gray-700 dark:text-gray-300">Role description<textarea rows={5} value={profile.role} onChange={(event) => update("role", event.target.value)} className={`${textareaClass} mt-2`} /></label>
            <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]"><div><p className="text-sm font-medium text-gray-700 dark:text-gray-300">Automatic channel replies</p><p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Mike can send approved, high-confidence answers without review.</p></div><button role="switch" aria-checked={profile.auto_reply} onClick={() => update("auto_reply", !profile.auto_reply)} className={`relative h-6 w-11 rounded-full transition-colors ${profile.auto_reply ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"}`}><span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-theme-sm transition-transform ${profile.auto_reply ? "translate-x-5" : ""}`} /></button></div>
          </section>

          <section id="guardrails" onMouseEnter={() => setActive("guardrails")} className={cardClass}>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Guardrails and handoff</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Deterministic checks run before the model. Low-confidence answers never auto-send.</p>
            <div className="mt-5"><div className="flex items-center justify-between"><label className="text-sm font-medium text-gray-700 dark:text-gray-300">Minimum confidence</label><code className="font-mono text-sm font-semibold text-brand-600 dark:text-brand-400">{Math.round(profile.confidence_threshold * 100)}%</code></div><input type="range" min="0.5" max="0.95" step="0.01" value={profile.confidence_threshold} onChange={(event) => update("confidence_threshold", Number(event.target.value))} className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-brand-500 dark:bg-gray-800" /><div className="mt-2 flex justify-between text-[11px] text-gray-500"><span>More autonomous</span><span>More review</span></div></div>
            <label className="mt-5 block text-sm font-medium text-gray-700 dark:text-gray-300">Rules, one per line<textarea rows={6} value={profile.guardrails.join("\n")} onChange={(event) => update("guardrails", event.target.value.split("\n").filter(Boolean))} className={`${textareaClass} mt-2`} /></label>
            <label className="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-300">Escalation phrases<input value={profile.escalation_terms.join(", ")} onChange={(event) => update("escalation_terms", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} className={`${fieldClass} mt-2`} /><span className="mt-1.5 block text-xs font-normal text-gray-500">Comma-separated. Matches are case-insensitive.</span></label>
          </section>

          <section id="manager" onMouseEnter={() => setActive("manager")} className={cardClass}>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Human manager</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Mike routes sensitive or unsupported conversations to this person.</p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700 dark:text-gray-300">Manager name<input value={profile.manager_name} onChange={(event) => update("manager_name", event.target.value)} className={`${fieldClass} mt-2`} /></label><label className="text-sm font-medium text-gray-700 dark:text-gray-300">Manager email<input type="email" value={profile.manager_email} onChange={(event) => update("manager_email", event.target.value)} className={`${fieldClass} mt-2`} /></label></div>
          </section>

          <section id="integrations" onMouseEnter={() => setActive("integrations")} className={cardClass}>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">Integrations</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Grant is configured on the API service. This org binds to that mailbox when you save the display address. API key and webhook secret stay on the API.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-2">
                Mailbox email
                <input type="email" value={mailboxEmail} onChange={(event) => setMailboxEmail(event.target.value)} className={`${fieldClass} mt-2`} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button loading={savingMailbox} onClick={saveMailbox} disabled={!grantFromEnv}>
                Save mailbox
              </Button>
              <Badge size="sm" color={mailbox && grantFromEnv ? "success" : "warning"}>
                {mailbox && grantFromEnv ? "Linked to this org" : grantFromEnv ? "Not linked" : "Needs env config"}
              </Badge>
            </div>
            <div className="mt-5 divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
              {[
                { name: "OpenAI Agents SDK", detail: "gpt-5.6-luna · response generation", status: "Configured" },
                { name: "Nylas", detail: nylasDetail, status: nylasStatus },
                { name: "PostgreSQL", detail: "Conversations and OKF retrieval", status: "Healthy" },
                { name: "Website widget", detail: "Per-org site token from Chat → Copy embed", status: "Ready" },
              ].map((integration) => (
                <div key={integration.name} className="flex items-center gap-4 p-4">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"><PlugInIcon className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90">{integration.name}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{integration.detail}</p>
                  </div>
                  <Badge size="sm" color={integration.status === "Configured" || integration.status === "Healthy" || integration.status === "Ready" || integration.status === "Linked" ? "success" : "warning"}>{integration.status}</Badge>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
