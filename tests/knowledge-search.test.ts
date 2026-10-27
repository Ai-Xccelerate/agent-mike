import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeIndexState } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { INDEX_SOURCE, clearRefreshMemory, refreshKnowledgeIndexIfStale, syncKnowledgeIndex } from "@/lib/knowledge-index";
import { DEFAULT_TUNING, MIN_MEANING_SCORE, clearKnowledgeSearchCache, searchKnowledgeIndex } from "@/lib/knowledge-search";
import type { IndexPage, IndexSource } from "@/lib/tools-integrations/atlassian";
import { worthRewriting } from "@/lib/query-rewrite";

// The other tests search as they always did: no model call to rewrite the question.
vi.mock("@/lib/query-rewrite", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/query-rewrite")>()), rewriteForSearch: vi.fn(async () => null) }));

// A stand-in for meaning: texts about the same idea land on the same axis, whatever words they use.
const AXES = [
  ["audit", "trail", "altered", "edits", "history", "activity"],
  ["register", "registration", "signup", "enrol"],
  ["utilization", "report", "employer"],
  ["kubernetes", "ingress", "controller"],
  ["cooking", "pasta", "boil"],
];
const embed = vi.fn(async (texts: string[]) =>
  texts.map((text) => {
    const lower = text.toLowerCase();
    const v = AXES.map((words) => words.filter((w) => lower.includes(w)).length);
    // Text about none of these topics sits on its own axis, apart from every topic above.
    return [...v, v.every((n) => n === 0) ? 1 : 0];
  }),
);

type P = { id: string; title: string; text: string };
function source(pages: P[]): IndexSource {
  return {
    source: "confluence",
    listMetadata: async () => pages.map((p) => ({ id: p.id, title: p.title, version: 1, link: null })),
    fetchPages: async (ids): Promise<IndexPage[]> => pages.filter((p) => ids.includes(p.id)).map((p) => ({ id: p.id, title: p.title, text: p.text, link: null })),
  };
}
const FILL = " This section describes the topic in enough words to be a section of its own and to be worth finding later.";

let orgId: string;
beforeEach(async () => {
  orgId = `org-search-${crypto.randomUUID()}`;
  await ensureOrganization(orgId);
  clearKnowledgeSearchCache();
  clearRefreshMemory();
  embed.mockClear();
});

async function indexed(pages: P[]) {
  await syncKnowledgeIndex(orgId, { source: source(pages), embed });
  embed.mockClear();
}

describe("searching the saved copy", () => {
  it("finds a section by keyword, with its title and heading", async () => {
    await indexed([
      { id: "1", title: "Self-Scheduler Registration", text: `## Register\nShare the link with the member and ask them to register.${FILL}` },
      { id: "2", title: "Cooking", text: `## Pasta\nBoil water.${FILL}` },
    ]);
    const { matches } = await searchKnowledgeIndex(orgId, "How do members register?", { embed });
    expect(matches[0]).toMatchObject({ title: "Self-Scheduler Registration", heading: "Register", documentId: "confluence:1" });
    expect(matches.map((m) => m.title)).not.toContain("Cooking");
  });

  it("returns nothing for a question unrelated to every page, and reports the scores it judged by", async () => {
    await indexed([
      { id: "1", title: "Audit Trail", text: `## Who made edits
Every change to a file is logged.${FILL}` },
      { id: "2", title: "Cooking", text: `## Pasta
Boil water.${FILL}` },
    ]);
    const none = await searchKnowledgeIndex(orgId, "How do I configure a Kubernetes ingress controller?", { embed });
    expect(none.matches).toEqual([]);
    const some = await searchKnowledgeIndex(orgId, "Which tool tells me what colleagues altered?", { embed });
    expect(some.details[0]).toMatchObject({ title: "Audit Trail", meaning: expect.any(Number) });
    expect(some.details[0].meaning).toBeGreaterThanOrEqual(MIN_MEANING_SCORE);
  });

  it("finds a page by meaning when no word in the question is in the page", async () => {
    await indexed([
      { id: "1", title: "Audit Trail", text: `## Who made edits\nEvery change to a file is logged with the person and the time.${FILL}` },
      { id: "2", title: "Cooking", text: `## Pasta\nBoil water.${FILL}` },
    ]);
    const { matches, timings } = await searchKnowledgeIndex(orgId, "Which tool tells me what colleagues altered?", { embed });
    expect(timings.meaning).toBe("used");
    expect(matches[0].title).toBe("Audit Trail");
  });

  it("still answers from keywords when the meaning search is down", async () => {
    await indexed([{ id: "1", title: "Self-Scheduler Registration", text: `## Register\nAsk the member to register.${FILL}` }]);
    const down = vi.fn(async () => {
      throw new Error("embeddings request failed with 500");
    });
    const { matches, timings } = await searchKnowledgeIndex(orgId, "How do members register?", { embed: down });
    expect(timings.meaning).toBe("failed");
    expect(matches[0].title).toBe("Self-Scheduler Registration");
  });

  it("puts a section both searches like ahead of one only a single search likes", async () => {
    await indexed([
      { id: "1", title: "Utilization Report", text: `## Run it for an employer\nChoose the employer, then Preview the utilization report.${FILL}` },
      { id: "2", title: "Billing", text: `## Employer invoices\nThe employer receives an invoice.${FILL}` },
    ]);
    const { matches } = await searchKnowledgeIndex(orgId, "run a utilization report for one employer", { embed });
    expect(matches[0].documentId).toBe("confluence:1");
  });

  it("returns a page's sections in page order, at most three per page, and respects the limit", async () => {
    const steps = Array.from({ length: 6 }, (_, i) => `## Step ${i + 1}\nRegister step ${i + 1}: register the member.${FILL}`).join("\n\n");
    await indexed([
      { id: "1", title: "Registration Guide", text: steps },
      { id: "2", title: "Registration FAQ", text: `## Faq\nCan a member register twice? register.${FILL}` },
    ]);
    const { matches } = await searchKnowledgeIndex(orgId, "register a member", { embed, limit: 5 });
    expect(matches.length).toBeLessThanOrEqual(5);
    const fromGuide = matches.filter((m) => m.documentId === "confluence:1");
    expect(fromGuide.length).toBeLessThanOrEqual(3);
    const order = fromGuide.map((m) => Number(/Step (\d)/.exec(m.heading ?? "")?.[1]));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Same page together: no other page's section between two of the guide's.
    const ids = matches.map((m) => m.documentId);
    expect(ids.join(",").replace(/confluence:1(,confluence:1)*/, "G")).not.toMatch(/G.*confluence:1/);
  });

  it("uses the question inside a long message, not its opening", async () => {
    await indexed([{ id: "1", title: "Utilization Report", text: `## Run it\nChoose the employer and preview the utilization report.${FILL}` }]);
    const preamble = "Hi team, hope you are well and thanks for all your help over the past months, it is much appreciated by everyone here. ".repeat(5);
    const { matches } = await searchKnowledgeIndex(orgId, `${preamble}Anyway, the actual thing I wanted to ask is how I can run a utilization report for one employer. Thanks, Sam.`, { embed });
    expect(matches[0].title).toBe("Utilization Report");
    expect(embed.mock.calls[0][0][0]).toContain("utilization report");
    expect(embed.mock.calls[0][0][0]).not.toContain("hope you are well");
  });

  it("returns nothing, without calling the embedder, when the copy is empty", async () => {
    const { matches } = await searchKnowledgeIndex(orgId, "anything at all", { embed });
    expect(matches).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it("never returns another organization's sections", async () => {
    const other = `org-search-other-${crypto.randomUUID()}`;
    await ensureOrganization(other);
    await syncKnowledgeIndex(other, { source: source([{ id: "9", title: "Their Secret Register Guide", text: `## Register\nTheir register steps.${FILL}` }]), embed });
    await indexed([{ id: "1", title: "Our Cooking", text: `## Pasta\nBoil water.${FILL}` }]);
    const { matches } = await searchKnowledgeIndex(orgId, "register a member", { embed });
    expect(matches.map((m) => m.title)).not.toContain("Their Secret Register Guide");
  });

  it("picks up a new sync without a restart, and remembers a repeated question's numbers", async () => {
    await indexed([{ id: "1", title: "Cooking", text: `## Pasta\nBoil water.${FILL}` }]);
    expect((await searchKnowledgeIndex(orgId, "register a member", { embed })).matches.map((m) => m.title)).not.toContain("Registration");
    await new Promise((r) => setTimeout(r, 15));
    await indexed([
      { id: "1", title: "Cooking", text: `## Pasta\nBoil water.${FILL}` },
      { id: "2", title: "Registration", text: `## Register\nAsk the member to register.${FILL}` },
    ]);
    embed.mockClear();
    expect((await searchKnowledgeIndex(orgId, "register a member", { embed })).matches.map((m) => m.title)).toContain("Registration");
    // The question's numbers were worked out on the first search and are remembered.
    expect(embed).not.toHaveBeenCalled();
    await searchKnowledgeIndex(orgId, "a brand new question about registration", { embed });
    expect(embed).toHaveBeenCalledTimes(1);
  });
});

describe("a question whose rare word is buried among 'get to EAP Expert' pages", () => {
  const login = (i: number) => ({
    id: `l${i}`,
    title: i % 3 === 0 ? `Logging into EAP Expert ${i}` : `EAP Expert V3 access and sign in ${i}`,
    text: `## How to log in\nTo get to EAP Expert, open the sign-in page, log in to EAP Expert with your EAP Expert user name, and access EAP Expert from your computer.${FILL}`,
  });
  const parallels = [
    { id: "p1", title: "Parallels Support Guide", text: `## Overview\nParallels lets you reach EAP Expert from a Mac or a remote computer.${FILL}` },
    { id: "p2", title: "Installing Parallels", text: `## Install\nDownload the Parallels Client and install it.${FILL}` },
    { id: "p3", title: "Setting Up a Parallels Connection", text: `## Connection\nChoose Remote Application Server in Parallels and enter the server details to connect to EAP Expert.${FILL}` },
  ];

  it("returns them even when the question names the product, as 'Parallels EAP Expert' does on prod", async () => {
    await indexed([...Array.from({ length: 45 }, (_, i) => login(i)), ...parallels]);
    for (const question of ["Parallels EAP Expert", "Parallels to get to EAP Expert", "How do I use Parallels to log in to EAP Expert?"]) {
      const { matches } = await searchKnowledgeIndex(orgId, question, { embed, rewrite: false });
      expect(matches.some((m) => /Parallels/.test(m.title)), question).toBe(true);
    }
  });

  it("brings them in on the strength of the title alone, even if every ranking prefers the product's pages", async () => {
    // Title signal off and the Parallels text never saying "Parallels": only the rule for a rare title word can find them.
    const quiet = parallels.map((page) => ({ ...page, text: `## Overview\nSteps for reaching EAP Expert from a Mac or a remote computer.${FILL}` }));
    await indexed([...Array.from({ length: 45 }, (_, i) => login(i)), ...quiet]);
    const { matches } = await searchKnowledgeIndex(orgId, "Parallels EAP Expert", { embed, rewrite: false, tuning: { weights: { keyword: 1, meaning: 1, title: 0 } } });
    expect(matches.some((m) => /Parallels/.test(m.title))).toBe(true);
  });

  it("ignores a word that is in few titles but in the text of most pages, as 'system' is", async () => {
    // "How do I send an email or text to a member from the system?": the pages named for "system" must not take the slots.
    const filler = Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, title: `Guide ${i}`, text: `## Steps\nIn the system you open the module and use the system menu.${FILL}` }));
    const memberPages = Array.from({ length: 8 }, (_, i) => ({ id: `mp${i}`, title: `Member guide ${i}`, text: `## Steps\nHow to manage a member in the system.${FILL}` }));
    const siblings = ["Providers", "Employer Contacts", "Clients", "Staff", "Counsellors", "Vendors", "Members"].map((who, i) => ({
      id: `e${i}`,
      title: `Emailing and Texting ${who} through the Communication Hub`,
      text: `## Steps\nOpen the Communication Hub, choose the ${who.toLowerCase()} and send an email or a text.${FILL}`,
    }));
    const systemPages = [
      { id: "s1", title: "System Customization", text: `## Options\nCustomize the colours.${FILL}` },
      { id: "s2", title: "System Setup", text: `## Setup\nSet up the office.${FILL}` },
    ];
    await indexed([...filler, ...memberPages, ...siblings, ...systemPages]);
    const { matches } = await searchKnowledgeIndex(orgId, "How do I send an email or text to a member from the system?", { embed, rewrite: false, tuning: { weights: { keyword: 1, meaning: 1, title: 0 } } });
    expect(matches.filter((m) => /^System /.test(m.title))).toEqual([]);
    expect(matches.map((m) => m.title)).toContain("Emailing and Texting Members through the Communication Hub");
  });

  it("does not crowd out the ranking when the rare word is in no title, or in too many", async () => {
    await indexed([...Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, title: `Report guide ${i}`, text: `## Reports\nHow to run a report in the system.${FILL}` })), { id: "x", title: "Cooking", text: `## Pasta\nBoil water.${FILL}` }]);
    const { matches } = await searchKnowledgeIndex(orgId, "How do I run a report?", { embed, rewrite: false });
    expect(matches.length).toBeGreaterThan(3);
    expect(matches.every((m) => /Report guide/.test(m.title))).toBe(true);
  });

  it("still returns the Parallels pages for 'How do I use Parallels to get to EAP Expert?'", async () => {
    await indexed([...Array.from({ length: 45 }, (_, i) => login(i)), ...parallels]);
    const { matches } = await searchKnowledgeIndex(orgId, "How do I use Parallels to get to EAP Expert?", { embed, rewrite: false });
    const titles = matches.map((m) => m.title);
    expect(titles.some((title) => /Parallels/.test(title))).toBe(true);
    expect(matches.slice(0, 3).some((m) => /Parallels/.test(m.title))).toBe(true);
  });
});

describe("a message with several separate questions", () => {
  // One axis of meaning per topic; text about several topics at once sits between the axes.
  const TOPIC_AXES = [["provider", "add"], ["email"], ["reminder", "appointment"], ["export", "accounting"], ["close", "case"]];
  const topicEmbed = vi.fn(async (texts: string[]) =>
    texts.map((text) => {
      const lower = text.toLowerCase();
      const v = TOPIC_AXES.map((words) => words.filter((w) => lower.includes(w)).length);
      return [...v, v.every((n) => n === 0) ? 1 : 0];
    }),
  );
  const QUESTION = "How do I add a new provider, change a provider's email address, set up appointment reminders, export account data and close a case file?";
  const TOPICS = ["add a new provider", "change a provider's email address", "set up appointment reminders", "export account data to accounting", "close a case file"];
  const pages = [
    { id: "t1", title: "Add a New Provider", text: `## Steps\nTo add a new provider, open Providers and choose New.${FILL}` },
    { id: "t2", title: "Change a Provider's Email", text: `## Steps\nOpen the provider record and replace the email address.${FILL}` },
    { id: "t3", title: "Appointment Reminders", text: `## Steps\nTurn on appointment reminders under Options.${FILL}` },
    { id: "t4", title: "Accounting Export", text: `## Steps\nExport the accounting data to a file.${FILL}` },
    { id: "t5", title: "Closing a Case File", text: `## Steps\nTo close a case file, open it and choose Close.${FILL}` },
    // Pages that touch every topic a little: together they match the whole message better than any one topic's page does.
    ...Array.from({ length: 14 }, (_, i) => ({
      id: `m${i}`,
      title: `Office overview ${i}`,
      text: `## Overview\nThe office adds a provider, changes an email address, sets reminders for an appointment, runs an export for accounting data and can close a case.${FILL}`,
    })),
  ];
  const noTitleSignal = { weights: { keyword: 1, meaning: 1, title: 0 } };

  it("finds the page for every topic when the message is searched question by question", async () => {
    await indexed(pages);
    const { matches } = await searchKnowledgeIndex(orgId, QUESTION, { embed: topicEmbed, rewrite: false, topics: async () => TOPICS, tuning: noTitleSignal });
    const titles = matches.map((m) => m.title);
    for (const wanted of ["Add a New Provider", "Change a Provider's Email", "Appointment Reminders", "Accounting Export", "Closing a Case File"]) expect(titles, wanted).toContain(wanted);
    expect(matches.length).toBeGreaterThan(8);
  });

  it("would miss some of them as one search, which is why it is split", async () => {
    await indexed(pages);
    const { matches } = await searchKnowledgeIndex(orgId, QUESTION, { embed: topicEmbed, rewrite: false, topics: false, tuning: noTitleSignal });
    const found = ["Add a New Provider", "Change a Provider's Email", "Appointment Reminders", "Accounting Export", "Closing a Case File"].filter((wanted) => matches.some((m) => m.title === wanted));
    expect(found.length).toBeLessThan(5);
  });

  it("changes nothing when the model finds no separate questions, or fails", async () => {
    await indexed(pages);
    const none = await searchKnowledgeIndex(orgId, QUESTION, { embed: topicEmbed, rewrite: false, topics: async () => [], tuning: noTitleSignal });
    const off = await searchKnowledgeIndex(orgId, QUESTION, { embed: topicEmbed, rewrite: false, topics: false, tuning: noTitleSignal });
    expect(none.matches.map((m) => m.title)).toEqual(off.matches.map((m) => m.title));
    const failed = await searchKnowledgeIndex(orgId, QUESTION, { embed: topicEmbed, rewrite: false, topics: async () => { throw new Error("down"); }, tuning: noTitleSignal });
    expect(failed.matches.map((m) => m.title)).toEqual(off.matches.map((m) => m.title));
  });
});

describe("a word in nearly every page title", () => {
  it("does not bury the page for the word that says what the question is about", async () => {
    const common = Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`,
      title: `Acme Expert Guide ${i}`,
      text: `## Using Acme Expert\nHow to use Acme Expert to log in to Acme Expert and get to your Acme Expert items.${FILL}`,
    }));
    await indexed([...common, { id: "p", title: "Installing Quartzlink", text: `## Install\nDownload Quartzlink and install it on your computer.${FILL}` }]);
    const { matches } = await searchKnowledgeIndex(orgId, "How do I use Quartzlink to get to Acme Expert?", { embed });
    expect(matches.map((m) => m.title)).toContain("Installing Quartzlink");
  });
});

describe("the chosen settings", () => {
  it("are the ones the experiment on EAP's pages picked: title counts triple, shorter sections favoured, sharper merge, eight sections", () => {
    expect(DEFAULT_TUNING).toMatchObject({ limit: 8, perPage: 3, rrfK: 20, keywordNorm: 1, weights: { keyword: 1, meaning: 1, title: 3 } });
  });

  it("return up to eight sections, grouped by page", async () => {
    const pages = Array.from({ length: 6 }, (_, i) => ({ id: String(i + 1), title: `Registration topic ${i + 1}`, text: `## Register\nAsk the member to register, topic ${i + 1}.${FILL}\n\n## Help\nRegister help ${i + 1}.${FILL}` }));
    await indexed(pages);
    const { matches } = await searchKnowledgeIndex(orgId, "how do members register", { embed });
    expect(matches.length).toBeGreaterThan(6);
    expect(matches.length).toBeLessThanOrEqual(8);
  });
});

describe("keeping the copy fresh", () => {
  const stateRow = (finishedAgoMinutes: number | null, runningForMinutes: number | null = null) => ({
    organizationId: orgId,
    source: INDEX_SOURCE,
    lastFinishedAt: finishedAgoMinutes === null ? null : new Date(Date.now() - finishedAgoMinutes * 60_000),
    runningUntil: runningForMinutes === null ? null : new Date(Date.now() + runningForMinutes * 60_000),
  });

  it("starts a background sync when the copy is old, and not again for a few minutes", async () => {
    await db.insert(knowledgeIndexState).values(stateRow(30));
    const run = vi.fn(async () => ({ pages: 0, added: 0, changed: 0, removed: 0, unchanged: 0, sections: 0, embedded: 0, ms: 1 }));
    expect(await refreshKnowledgeIndexIfStale(orgId, run)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(await refreshKnowledgeIndexIfStale(orgId, run)).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("leaves a fresh copy and a running sync alone, and syncs one that never ran", async () => {
    const run = vi.fn(async () => ({ pages: 0, added: 0, changed: 0, removed: 0, unchanged: 0, sections: 0, embedded: 0, ms: 1 }));
    await db.insert(knowledgeIndexState).values(stateRow(2));
    expect(await refreshKnowledgeIndexIfStale(orgId, run)).toBe(false);
    await db.update(knowledgeIndexState).set({ lastFinishedAt: new Date(Date.now() - 60 * 60_000), runningUntil: new Date(Date.now() + 5 * 60_000) }).where(eq(knowledgeIndexState.organizationId, orgId));
    clearRefreshMemory();
    expect(await refreshKnowledgeIndexIfStale(orgId, run)).toBe(false);
    expect(run).not.toHaveBeenCalled();
    const fresh = `org-search-fresh-${crypto.randomUUID()}`;
    await ensureOrganization(fresh);
    expect(await refreshKnowledgeIndexIfStale(fresh, run)).toBe(true);
  });
});

describe("searching with a clean English version of the question too", () => {
  const pages = [
    { id: "1", title: "Registration", text: `## Register\nTo register a new member, open the member list and choose Register.${FILL}` },
    { id: "2", title: "Cooking", text: `## Pasta\nBoil water.${FILL}` },
  ];

  it("finds the page for a question in another language once it is rewritten, and not before", async () => {
    await indexed(pages);
    const spanish = "¿Cómo inscribo a un socio nuevo en el sistema?";
    expect((await searchKnowledgeIndex(orgId, spanish, { embed })).matches).toEqual([]);
    const { matches } = await searchKnowledgeIndex(orgId, spanish, { embed, rewrite: async () => "register a new member" });
    expect(matches[0]).toMatchObject({ title: "Registration" });
  });

  it("keeps the original search, so a rewrite never loses what the plain search found", async () => {
    await indexed(pages);
    const { matches } = await searchKnowledgeIndex(orgId, "How do members register?", { embed, rewrite: async () => "boil pasta" });
    expect(matches.map((m) => m.title)).toContain("Registration");
  });

  it("carries on as normal when the rewrite fails, is empty, or is switched off", async () => {
    await indexed(pages);
    const plain = (await searchKnowledgeIndex(orgId, "How do members register?", { embed, rewrite: false })).matches.map((m) => m.title);
    expect(plain).toContain("Registration");
    for (const rewrite of [async () => { throw new Error("model down"); }, async () => null, async () => ""]) {
      const got = (await searchKnowledgeIndex(orgId, "How do members register?", { embed, rewrite })).matches.map((m) => m.title);
      expect(got).toEqual(plain);
    }
  });

  it("decides which messages are worth rewriting", () => {
    expect(worthRewriting("hi")).toBe(false);
    expect(worthRewriting("How do I add a client?")).toBe(false);
    expect(worthRewriting("How do we submit claims? I see the authorization number under open files")).toBe(true);
    expect(worthRewriting("¿Cómo agrego una organización?")).toBe(true);
    expect(worthRewriting("Comment ajouter une organisation cliente?")).toBe(true);
    expect(worthRewriting("")).toBe(false);
  });
});
