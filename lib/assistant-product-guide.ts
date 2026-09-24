/**
 * What each Settings section actually does, for the admin Assistant to
 * explain the product accurately. Written against the live code, not the
 * UI's helper text: several fields are stored but not yet read by anything
 * at runtime, and the Assistant must say so rather than promise an effect
 * that doesn't exist. Keep this in step with the settings screens and
 * lib/agent.ts when either changes.
 */

export const PRODUCT_GUIDE_TOPICS = [
  "overview",
  "identity",
  "role",
  "agent_configuration",
  "guardrails",
  "manager",
  "channels",
  "tools",
  "skills",
  "knowledge",
  "integrations",
  "email_domains",
  "team",
  "assistant",
  "not_available",
] as const;

export type ProductGuideTopic = (typeof PRODUCT_GUIDE_TOPICS)[number];

const GUIDE: Record<ProductGuideTopic, string> = {
  overview: [
    "The AI Worker answers customers over chat (Playground + website widget) and can send email through a connected mailbox.",
    "Admin pages: Overview (stats, worker health), Assistant (this chat), Inbox (every customer conversation; read, take over or hand back, reply by hand, mark resolved or closed). Customer conversations can't be deleted; this Assistant's own chats can be archived from its History panel, Settings.",
    "Settings sections: Identity, Role, Agent configuration, Guardrails, Human manager, Channels, Tools, Skills, Knowledge, Integrations, Email domains, Team.",
    "Every setting lives on one worker profile per organization and saves from its Settings page.",
  ].join("\n"),

  identity: [
    "Settings > Identity (/settings/identity).",
    "- Customer-facing name: used in the worker's prompt ('You are …') and as the sender name on its replies.",
    "- Internal name: admin-only label; not used by the worker.",
    "- Slug: 2-32 lowercase letters/numbers/dashes, unique in the org; also used as the Parchment agent id.",
    "- Tone: goes straight into the worker's prompt and shapes every reply.",
    "- Timezone: added to the prompt so the worker reasons about local time.",
    "- Email signature: appended to outbound email only.",
    "- Avatar image, initials, accent colour: display only (sidebar, favicon, widget).",
    "- Support email address: only used as the login hint when connecting the mailbox.",
    "- Stored but NOT yet used at runtime: Status (active/paused: pausing does not stop replies yet), Short bio, Locale.",
  ].join("\n"),

  role: [
    "Settings > Role (/settings/role).",
    "- Role description: the core of the worker's prompt, and also what the out-of-scope guardrail compares customer questions against. Leaving the default placeholder ('Configure this worker's role and responsibilities.') makes scope checks meaningless.",
    "- Job description (optional): extra detail added to the prompt and to scope checks.",
    "- Automatic replies: stored but NOT yet enforced; the worker replies either way.",
  ].join("\n"),

  agent_configuration: [
    "Settings > Agent configuration (/settings/agent-configuration).",
    "- Model: gpt-5.6-luna (default) or gpt-5.6-sol. Used by the worker, this Assistant, and conversation summaries.",
    "- Max turns per reply (1-10, default 3): how many tool steps the worker may take per answer. This Assistant always uses at least 10.",
    "- Additional instructions: appended after the identity/role/tone block (which is built automatically and can't be lost by editing this).",
    "- If the API has no model key or demo mode is on, the worker and this Assistant can't answer at all.",
  ].join("\n"),

  guardrails: [
    "Settings > Guardrails (/settings/guardrails).",
    "- Minimum confidence (0.5-0.95, default 0.72): answers below it are handed to the human manager instead of sent.",
    "- Escalation phrases: topics that should go to a human (refund, chargeback, lawyer…). These feed a semantic intent check; they are not exact keyword matches, despite the helper text.",
    "- Require user verification: tells the worker to ask for the customer's email and check it against the CRM, via the verify-customer skill. Needs an active CRM integration (Zoho) and turning it on adds that skill. It's an instruction the worker follows, not a hard gate.",
    "- Let the Assistant take actions: lets this Assistant propose sending replies, changing ticket status, and publishing knowledge articles (always with your confirmation). Only the manager can switch this on, in Settings.",
    "- Allowed email domains: restricts who may message the worker (empty = anyone). A message from a sender whose email domain isn't listed, or whose email isn't known (anonymous website/Playground chat visitors), is handed to the human manager. So only set this if every customer writes in with a known email.",
    "- Email writes through Gmail wait for approval by default (no UI toggle for that yet).",
  ].join("\n"),

  manager: [
    "Settings > Human manager (/settings/manager).",
    "- Manager name: used when the worker hands off ('I'm bringing in {name}') and throughout this Assistant.",
    "- Manager email: stored but NOT yet used. No escalation notification email is sent to anyone yet; escalations only show up in Inbox as 'needs human'.",
  ].join("\n"),

  channels: [
    "Settings > Channels (/settings/channels).",
    "- Chat: Playground and the embeddable website widget. When on, the page offers 'Open playground' and 'Copy widget snippet'. Note: turning it off does not currently stop the widget from answering.",
    "- Email: lets the worker send email. Needs a connected mailbox (Settings > Tools > External tools > Mailbox), and every recipient's domain must be approved under Settings > Email domains. Inbound email (the worker reading a support inbox on its own) is not built yet.",
    "- Voice: coming soon; the switch is disabled.",
  ].join("\n"),

  tools: [
    "Settings > Tools (/settings/tools).",
    "- Internet: gives the worker general web search.",
    "- Browser use: stored but NOT yet wired; it does nothing today.",
    "- Internal tools (each needs server credentials to be 'available'; active = available and switched on):",
    "  - Parchment (on by default): searches the organization's Parchment knowledge base. Read-only.",
    "  - Scribe: searches internal meeting transcripts (lookback window configurable).",
    "  - Agent Wiki: searches a wiki space (write access is stored but unused).",
    "  - AgentDB and Agent Artifacts: can be switched on but are NOT yet used by the worker.",
    "- External tools > Mailbox (Nylas): the sending mailbox for the Email channel. States: Not configured, Not connected, Reconnect needed, Connected.",
  ].join("\n"),

  skills: [
    "Settings > Skills (/settings/skills).",
    "- A skill is a named set of instructions the worker loads when relevant. Built-in: collect-before-escalate, stay-on-topic, verify-customer (needs CRM).",
    "- Custom skills are written per organization (Settings > Skills > New skill, or from an uploaded file in this Assistant).",
    "- A skill that needs an integration stays off until that integration is connected; one enabled earlier but whose integration was later disconnected is silently skipped.",
    "- Skill repository card: lets the worker search a shared skills library (needs an API key).",
  ].join("\n"),

  knowledge: [
    "Settings > Knowledge (/settings/knowledge).",
    "- Upload PDF, Markdown, or text files, or write an article by hand (New doc). Each becomes a searchable article the worker cites when answering.",
    "- OKF format: Markdown with OKF frontmatter is stored as written. Minimum frontmatter: type (required, e.g. reference), title, description, tags. PDFs and text are wrapped into a concept document automatically. Markdown without frontmatter is rejected on upload; add frontmatter or use New doc.",
    "- An article's id comes from its filename (or the frontmatter id); re-uploading the same file updates that article, which is the intended way to replace one.",
    "- Keep one concept per article and use headings. Retrieval works on chunks, and an article that covers six things answers none of them cleanly.",
    "- Articles can be viewed, edited in place (id, description and tags are kept), or deleted from the page.",
    "- Answers are grounded in this knowledge plus any active Parchment / Scribe / Agent Wiki source. With none of those, the worker has nothing to cite and will escalate or hedge.",
    "- From this Assistant: attach a file and choose 'Add to knowledge base' to add or update an article (same rules), or ask to change wording in an article (edited in place). Always with your confirmation.",
    "- An external knowledge-base connector is not available yet.",
  ].join("\n"),

  integrations: [
    "Settings > Integrations (/settings/integrations). One connection per type, via OAuth. All read-only unless noted:",
    "- CRM (Zoho): contact lookup; required by the verify-customer skill.",
    "- Helpdesk (Jira): issue search.",
    "- Project management (Linear): issue search.",
    "- Email (Gmail or Outlook): look up messages; Gmail can also send/reply, queued for approval.",
    "- Calendar (Google Calendar): event search.",
    "- Ticketing is listed internally but has no connector yet.",
  ].join("\n"),

  email_domains: [
    "Settings > Email domains (/settings/email-domains).",
    "- Outbound email may only go to approved domains (exact match). Anything not approved is refused.",
    "- This list only controls where the worker may send email. It does not affect who can chat with the worker (that's Guardrails > Allowed email domains).",
  ].join("\n"),

  team: [
    "Settings > Team (/settings/users): read-only list of people from AIX Core. Invites and roles are managed in AIX Core, not here.",
  ].join("\n"),

  assistant: [
    "This Assistant can:",
    "- Answer: look up conversations, summarize one by ticket number, search knowledge, report and audit the worker's configuration, explain any setting.",
    "- Draft: replies, knowledge articles, emails (shown in chat; nothing is saved or sent by drafting).",
    "- Configure (always after your explicit confirmation): role, tone, escalation phrases, channels, skills on/off, manager name/email, email domains, customer-facing and internal name, initials, accent colour, timezone, email signature, job description, additional instructions, model, max turns, minimum confidence, user verification, internet search; plus knowledge articles and custom skills from uploaded files.",
    "- Act (only if 'Let the Assistant take actions' is on, and always after confirmation): send a reply on a ticket, change a ticket's status, publish a knowledge article.",
    "- Files: attach up to 5 files (PDF, Markdown, text, CSV, JSON, HTML, YAML; 8 MB each) and choose: use in this chat, add to knowledge base, or turn into a skill. Word/PowerPoint/Excel files and scanned PDFs without a text layer aren't supported yet.",
    "- Panels: it can show interactive panels for skills, knowledge, integrations (including the mailbox), tools, channels and email domains, with buttons to turn things on/off or connect them. Every button still goes through your approval; connecting opens a sign-in window after you approve.",
    "- It cannot change: its own 'Let the Assistant take actions' permission, the avatar image, or team members (AIX Core). It explains where to do those.",
  ].join("\n"),

  not_available: [
    "Not built yet (say so plainly if asked, and suggest the nearest workaround):",
    "- Voice channel.",
    "- Inbound email handling (the worker reading and answering a support inbox by itself).",
    "- Escalation notifications by email (Manager email is stored but unused).",
    "- Pausing the worker (Status is stored but not enforced), Automatic replies toggle, Locale, Short bio, Browser use tool.",
    "- AgentDB and Agent Artifacts in the worker's own answers.",
    "- External knowledge-base connector; Ticketing integration.",
    "- In this Assistant: .docx/.pptx/.xlsx uploads, OCR of scanned PDFs, image understanding, editing Settings it has no tool for.",
  ].join("\n"),
};

export function productGuide(topic: ProductGuideTopic): string {
  return GUIDE[topic];
}
