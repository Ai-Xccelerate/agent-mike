export type FolderId =
  | "inbox"
  | "starred"
  | "snoozed"
  | "sent"
  | "drafts"
  | "archive"
  | "trash";

export type CategoryId = "primary" | "team" | "updates";

export type LabelId = "clients" | "agents" | "billing" | "internal";

export interface Attachment {
  name: string;
  size: string;
  type: string;
}

export interface Email {
  id: string;
  sender: string;
  senderEmail: string;
  isAgent?: boolean;
  subject: string;
  snippet: string;
  body: string[];
  attachments?: Attachment[];
  label?: LabelId;
  category: CategoryId;
  time: string;
  fullTime: string;
  unread: boolean;
  starred: boolean;
  folder: FolderId;
}

export const LABEL_META: Record<
  LabelId,
  { name: string; dot: string; chip: string }
> = {
  clients: {
    name: "Clients",
    dot: "bg-brand-500",
    chip: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  },
  agents: {
    name: "Agents",
    dot: "bg-success-500",
    chip: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
  },
  billing: {
    name: "Billing",
    dot: "bg-blue-light-500",
    chip: "bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/15 dark:text-blue-light-400",
  },
  internal: {
    name: "Internal",
    dot: "bg-theme-purple-500",
    chip: "bg-theme-purple-500/10 text-theme-purple-500 dark:bg-theme-purple-500/15",
  },
};

export const CATEGORIES: { id: CategoryId; name: string }[] = [
  { id: "primary", name: "Primary" },
  { id: "team", name: "Team" },
  { id: "updates", name: "Updates" },
];

export const initialEmails: Email[] = [
  {
    id: "e1",
    sender: "Dana Whitfield",
    senderEmail: "dana.whitfield@meridianlogistics.com",
    subject: "Adding George to our plan",
    snippet:
      "Hi Rahul, we ran the numbers — 62 accounts up for renewal by December and the team can barely keep up. We'd like to move forward with George starting August 1.",
    body: [
      "Hi Rahul,",
      "Thanks for the detail on the HubSpot integration — that answered our last open question. We ran the numbers on our side: we have 62 accounts up for renewal between now and December, and honestly the team can barely keep up with the check-ins. The renewal summary attached shows where things stand today.",
      "We'd like to move forward with adding George to our plan starting August 1. Two things before we sign: can George pick up the usage data we're already tracking (Q2 export attached), and what does the first 30 days of onboarding look like for the team? If those check out, send over the updated agreement and I'll get it through procurement this week.",
      "Best,\nDana",
    ],
    attachments: [
      { name: "Meridian-renewal-summary.pdf", size: "1.2 MB", type: "PDF" },
      { name: "Account-usage-Q2.xlsx", size: "348 KB", type: "XLSX" },
    ],
    label: "clients",
    category: "primary",
    time: "9:24 AM",
    fullTime: "Today, 9:24 AM",
    unread: true,
    starred: true,
    folder: "inbox",
  },
  {
    id: "e2",
    sender: "Pepper",
    senderEmail: "pepper@aixccelerate.com",
    isAgent: true,
    subject: "Weekly inbound digest — 34 leads routed",
    snippet:
      "This week I qualified 51 inbound leads, routed 34 to the sales team, and flagged 6 for nurture. Average first-response time held at 41 seconds.",
    body: [
      "Here's your inbound summary for the week of June 29.",
      "I qualified 51 inbound leads, routed 34 to the sales team, and flagged 6 for nurture. Average first-response time held at 41 seconds, and 3 leads booked meetings directly from the qualification flow.",
      "Two leads mentioned competitors by name — I tagged both conversations for your review. Full breakdown is in the dashboard.",
    ],
    label: "agents",
    category: "primary",
    time: "8:02 AM",
    fullTime: "Today, 8:02 AM",
    unread: true,
    starred: false,
    folder: "inbox",
  },
  {
    id: "e3",
    sender: "Marcus Lee",
    senderEmail: "marcus.lee@brightlinefreight.com",
    subject: "Brightline contract redlines",
    snippet:
      "Legal came back with two small changes on the SLA section. Nothing blocking — can you approve by end of day so we can route for signature?",
    body: [
      "Rahul,",
      "Legal came back with two small changes on the SLA section — response-time language and the escalation contact. Nothing blocking on our side.",
      "Can you approve by end of day so we can route for signature this week? Redlined copy attached.",
      "Marcus",
    ],
    attachments: [
      { name: "Brightline-MSA-redlines-v3.docx", size: "212 KB", type: "DOCX" },
    ],
    label: "clients",
    category: "primary",
    time: "Yesterday",
    fullTime: "Yesterday, 4:47 PM",
    unread: true,
    starred: false,
    folder: "inbox",
  },
  {
    id: "e4",
    sender: "Jules",
    senderEmail: "jules@aixccelerate.com",
    isAgent: true,
    subject: "Meeting confirmed — Halvorsen Freight discovery",
    snippet:
      "Erik Halvorsen accepted for Tuesday, July 8 at 10:00 AM CST. I've added context on their fleet expansion to the meeting brief.",
    body: [
      "Erik Halvorsen accepted the discovery call for Tuesday, July 8 at 10:00 AM CST. Calendar invite is on your schedule.",
      "Context worth knowing: they announced a 40-truck fleet expansion in May and posted three ops roles last week — good signal that headcount pressure is real. I've added the full brief to the meeting notes.",
    ],
    label: "agents",
    category: "primary",
    time: "Yesterday",
    fullTime: "Yesterday, 2:15 PM",
    unread: false,
    starred: true,
    folder: "inbox",
  },
  {
    id: "e5",
    sender: "Scribe",
    senderEmail: "scribe@aixccelerate.com",
    isAgent: true,
    subject: "Transcript ready — Northwind renewal call",
    snippet:
      "Your 38-minute call with Northwind Traders is transcribed and summarized. 4 action items detected, 2 assigned to you.",
    body: [
      "The transcript for your call with Northwind Traders (38 minutes, 3 participants) is ready.",
      "Summary: renewal sentiment is cautious but recoverable. Their ops lead raised two integration concerns, both addressable. 4 action items were detected — 2 assigned to you, 2 routed to George.",
      "Transcript and summary attached.",
    ],
    attachments: [
      { name: "Northwind-renewal-call-transcript.pdf", size: "96 KB", type: "PDF" },
    ],
    label: "agents",
    category: "primary",
    time: "Yesterday",
    fullTime: "Yesterday, 11:30 AM",
    unread: false,
    starred: false,
    folder: "inbox",
  },
  {
    id: "e6",
    sender: "Stripe",
    senderEmail: "receipts@stripe.com",
    subject: "Your June invoice receipt — $4,800.00",
    snippet:
      "Invoice INV-2026-0614 for $4,800.00 has been paid. A copy of the receipt is attached for your records.",
    body: [
      "Invoice INV-2026-0614 for $4,800.00 has been paid on June 30, 2026.",
      "A copy of the receipt is attached for your records. You can also view and download it anytime from your billing dashboard.",
    ],
    attachments: [
      { name: "Receipt-INV-2026-0614.pdf", size: "42 KB", type: "PDF" },
    ],
    label: "billing",
    category: "primary",
    time: "Jun 30",
    fullTime: "Jun 30, 5:12 PM",
    unread: false,
    starred: false,
    folder: "inbox",
  },
  {
    id: "e7",
    sender: "George",
    senderEmail: "george@aixccelerate.com",
    isAgent: true,
    subject: "Churn risk flagged — Northwind Traders",
    snippet:
      "Usage dipped 18% month over month and their champion hasn't logged in for 12 days. I recommend a check-in call this week.",
    body: [
      "Flagging a churn risk on Northwind Traders.",
      "Usage dipped 18% month over month, and their champion (Alicia Torres) hasn't logged in for 12 days. Support ticket volume is flat, which usually means disengagement rather than frustration.",
      "I recommend a check-in call this week, ideally before their July invoice lands. I've drafted talking points and queued a soft outreach you can approve or edit.",
    ],
    label: "agents",
    category: "primary",
    time: "Jun 28",
    fullTime: "Jun 28, 7:05 AM",
    unread: true,
    starred: false,
    folder: "inbox",
  },
  {
    id: "e8",
    sender: "Tony",
    senderEmail: "tony@aixccelerate.com",
    isAgent: true,
    subject: "API scoping answers for Brightline security review",
    snippet:
      "Answered all 9 technical questions from their security review. Two items need your sign-off: data residency and the SSO provisioning window.",
    body: [
      "Brightline's security review is nearly closed out. I answered all 9 technical questions from their questionnaire — responses are logged in the deal room.",
      "Two items need your sign-off before I send: the data residency statement (US-only hosting on Railway) and the SSO provisioning window (they asked for 5 business days, we typically commit to 10).",
    ],
    label: "agents",
    category: "primary",
    time: "Jun 27",
    fullTime: "Jun 27, 3:40 PM",
    unread: false,
    starred: false,
    folder: "inbox",
  },
  {
    id: "e9",
    sender: "Priya Raman",
    senderEmail: "priya.raman@atlassupply.co",
    subject: "Can we add Jules to the Q3 rollout?",
    snippet:
      "Pepper has been great with inbound — the team is asking if we can add outbound next quarter. What would adding Jules look like commercially?",
    body: [
      "Hi Rahul,",
      "Pepper has been great with inbound — response times are down to under a minute and the team stopped complaining about lead routing, which I consider a miracle.",
      "Now they're asking about outbound. What would adding Jules to the Q3 rollout look like commercially? If there's a bundle that makes sense with what we already have, send it over and I'll socialize it internally.",
      "Priya",
    ],
    label: "clients",
    category: "primary",
    time: "Jun 26",
    fullTime: "Jun 26, 10:18 AM",
    unread: false,
    starred: false,
    folder: "inbox",
  },
  {
    id: "e10",
    sender: "Sarah Okafor",
    senderEmail: "sarah@aixccelerate.com",
    subject: "Q3 pipeline review — agenda",
    snippet:
      "Sharing the agenda ahead of Thursday. Main topics: Meridian expansion, Northwind renewal risk, and the Brightline close plan.",
    body: [
      "Team,",
      "Sharing the agenda ahead of Thursday's pipeline review. Main topics: the Meridian expansion (George add-on), Northwind renewal risk and the save plan, and the Brightline close plan for July.",
      "Add anything you want covered to the doc by Wednesday EOD.",
    ],
    label: "internal",
    category: "team",
    time: "Jun 29",
    fullTime: "Jun 29, 9:00 AM",
    unread: true,
    starred: false,
    folder: "inbox",
  },
  {
    id: "e11",
    sender: "Devon Park",
    senderEmail: "devon@aixccelerate.com",
    subject: "Onboarding checklist for the Atlas kickoff",
    snippet:
      "Kickoff is set for July 10. Checklist attached — I need your sign-off on the fluency workshop dates and who's leading the P1 session.",
    body: [
      "Rahul,",
      "Atlas Supply kickoff is set for July 10. Onboarding checklist attached — most of it is handled, but I need your sign-off on the AI fluency workshop dates and who's leading the P1 session.",
      "If it's you, I'll block the morning slot; you've said afternoons are a no-go for workshops.",
    ],
    attachments: [
      { name: "Atlas-onboarding-checklist.pdf", size: "180 KB", type: "PDF" },
    ],
    label: "internal",
    category: "team",
    time: "Jun 25",
    fullTime: "Jun 25, 1:22 PM",
    unread: false,
    starred: false,
    folder: "inbox",
  },
  {
    id: "e12",
    sender: "Railway",
    senderEmail: "notifications@railway.app",
    subject: "Deployment succeeded — aix-platform v2.14",
    snippet:
      "Your deployment of aix-platform (production) completed successfully in 2m 41s. All health checks passing.",
    body: [
      "Your deployment of aix-platform to the production environment completed successfully in 2m 41s.",
      "All health checks are passing. View logs and metrics in your Railway dashboard.",
    ],
    category: "updates",
    time: "Jun 24",
    fullTime: "Jun 24, 8:57 PM",
    unread: false,
    starred: false,
    folder: "inbox",
  },
  {
    id: "e13",
    sender: "Dana Whitfield",
    senderEmail: "dana.whitfield@meridianlogistics.com",
    subject: "Re: Adding George to our plan",
    snippet:
      "Draft — Dana, great news. George reads your existing usage exports natively, and onboarding is a 30-day guided ramp…",
    body: [
      "Dana, great news. George reads your existing usage exports natively — no manual sync — and onboarding is a 30-day guided ramp with weekly check-ins.",
      "Updated agreement coming your way today.",
    ],
    label: "clients",
    category: "primary",
    time: "Jul 2",
    fullTime: "Jul 2, 6:40 PM",
    unread: false,
    starred: false,
    folder: "drafts",
  },
  {
    id: "e14",
    sender: "Alex Fontaine",
    senderEmail: "alex@ridgelinecapital.vc",
    subject: "Seed round intro follow-up",
    snippet:
      "Draft — Alex, appreciated the intro to your partner. Attaching the updated deck and the headcount-budget thesis we discussed…",
    body: [
      "Alex, appreciated the intro to your partner last week.",
      "Attaching the updated deck and the headcount-budget thesis we discussed — the short version: we capture headcount budget, not software budget, and the unit economics reflect that.",
    ],
    category: "primary",
    time: "Jul 1",
    fullTime: "Jul 1, 9:10 PM",
    unread: false,
    starred: false,
    folder: "drafts",
  },
  {
    id: "e15",
    sender: "Dana Whitfield",
    senderEmail: "dana.whitfield@meridianlogistics.com",
    subject: "Updated agreement — Meridian Logistics",
    snippet:
      "Dana, updated agreement attached with George added effective August 1. Onboarding plan for the first 30 days is on page 4.",
    body: [
      "Dana,",
      "Updated agreement attached with George added effective August 1. The onboarding plan for the first 30 days is on page 4 — guided ramp, weekly check-ins, and your Q2 usage data imported in week one.",
      "Once procurement signs off, we'll schedule the kickoff.",
    ],
    attachments: [
      { name: "Meridian-agreement-v2.pdf", size: "640 KB", type: "PDF" },
    ],
    label: "clients",
    category: "primary",
    time: "Jul 3",
    fullTime: "Jul 3, 11:05 AM",
    unread: false,
    starred: false,
    folder: "sent",
  },
];
