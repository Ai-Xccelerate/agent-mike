import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureOrganization } from "@/lib/bootstrap";
import { clearRefreshMemory, syncKnowledgeIndex } from "@/lib/knowledge-index";
import { clearKnowledgeSearchCache, searchKnowledgeIndex } from "@/lib/knowledge-search";
import type { IndexPage, IndexSource } from "@/lib/tools-integrations/atlassian";

// Gaps found in the 25 Nov audit of how Eva finds EAP's help pages (SDS-27, SDS-28 and the replay of EAP's own questions).
// Each gap has a control that passes today (the same question worded so search copes) and a test that states the behaviour we want.
// The wanted-behaviour tests are marked `it.fails`: they pass while the gap exists and FAIL when it is fixed, which is the cue to
// change them to plain `it`. The pages below are cut down from EAP's real ones; the numbers for "meaning" are a stand-in, so
// what is tested is the keyword, title and merge logic, the half that is deterministic.

vi.mock("@/lib/query-rewrite", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/query-rewrite")>()), rewriteForSearch: vi.fn(async () => null) }));

type P = { id: string; title: string; sections: { heading?: string; text: string }[] };
const FILL = " This section describes the topic in enough words to be a section of its own and to be worth finding later.";
const source = (pages: P[]): IndexSource => ({
  source: "confluence",
  listMetadata: async () => pages.map((p) => ({ id: p.id, title: p.title, version: 1, link: null })),
  fetchPages: async (ids): Promise<IndexPage[]> =>
    pages
      .filter((p) => ids.includes(p.id))
      .map((p) => ({ id: p.id, title: p.title, text: p.sections.map((s, i) => `${i === 0 && !s.heading ? "" : `## ${s.heading ?? `Part ${i + 1}`}\n`}${s.text}${FILL}`).join("\n"), link: null })),
});

/** Meaning stand-in: every text goes to one of a few axes by its words. Axis words are lower-case substrings. */
const axesEmbed = (axes: string[][]) =>
  vi.fn(async (texts: string[]) =>
    texts.map((text) => {
      const lower = text.toLowerCase();
      const v = axes.map((words) => words.filter((w) => lower.includes(w)).length);
      return [...v, v.every((n) => n === 0) ? 1 : 0];
    }),
  );
/** No meaning signal at all: what rare names, typos and jargon get from the real embeddings. */
const silentEmbed = () => vi.fn(async (texts: string[]) => texts.map(() => [0, 0, 0, 0]));

const filler = (n: number): P[] =>
  Array.from({ length: n }, (_, i) => ({ id: `fill${i}`, title: `Unrelated Topic ${i}`, sections: [{ text: `Notes about topic number ${i} for another module.` }] }));

let orgId: string;
beforeEach(() => {
  orgId = `org-gaps-${crypto.randomUUID()}`;
  clearKnowledgeSearchCache();
  clearRefreshMemory();
});

async function search(pages: P[], embed: ReturnType<typeof axesEmbed>, query: string) {
  await ensureOrganization(orgId);
  await syncKnowledgeIndex(orgId, { source: source(pages), embed });
  clearKnowledgeSearchCache();
  const { matches } = await searchKnowledgeIndex(orgId, query, { embed, rewrite: false, topics: false });
  return matches.map((m) => `${m.title} > ${m.heading ?? "-"}`);
}

describe("SDS-28: a product name typed as one word, when the pages spell it as two", () => {
  const pages: P[] = [
    { id: "le", title: "Life Expert Integration", sections: [{ text: "Completed files arrive each night at 11:59 p.m. EST." }] },
    { id: "leo", title: "LifeExpert", sections: [{ text: "A short overview of the partner." }] },
    { id: "sched", title: "Scheduler", sections: [{ text: "Working hours and the schedule for each counselor." }] },
    { id: "cal", title: "Calendar Sync Set-Up", sections: [{ text: "Choose how often the calendar runs on a schedule." }] },
    ...filler(30),
  ];
  const embed = silentEmbed();

  it("control: typed as two words, the Life Expert pages are found", async () => {
    expect(await search(pages, embed, "Does Life Expert run on a timed schedule?")).toContain("Life Expert Integration > -");
  });

  it.fails("typed as one word, the Life Expert pages are found too", async () => {
    expect(await search(pages, embed, "Does LifeExpert run on a timed schedule?")).toContain("Life Expert Integration > -");
  });
});

describe("an alias the worker's own instructions define: LE means Life Expert", () => {
  const pages: P[] = [
    { id: "le", title: "Life Expert Integration", sections: [{ text: "Completed records arrive each night at 11:59 p.m. EST." }] },
    { id: "cal", title: "Calendar Sync Set-Up", sections: [{ text: "Choose how long the calendar waits between runs, in minutes." }] },
    ...filler(30),
  ];
  it.fails("a question that says LE finds the Life Expert pages", async () => {
    const result = await search(pages, silentEmbed(), "How often does LE refresh?");
    expect(result).toContain("Life Expert Integration > -");
  });
});

describe("a rare word in a section's text against pages named for the generic words (SDS-27)", () => {
  const cloudPages: P[] = [
    "Getting Started with EAP Expert Cloud",
    "EAP Expert Cloud Overview",
    "EAP Expert Cloud Support",
    "EAP Expert Cloud Release Notes",
    "EAP Expert Cloud Browser Setup",
    "EAP Expert Cloud Training",
    "Difference Between EAPX Cloud and EAP Expert Win",
    "EAP Expert Cloud Sign In Page",
    "EAP Expert Cloud Single Page Layout",
    "Set Up Checklist for EAP Expert Cloud",
  ].map((title, i) => ({ id: `cloud${i}`, title, sections: [{ text: "How to get started with EAP Expert Cloud and set up your account." }, { heading: "Support", text: "Where to get help with EAP Expert Cloud." }] }));
  const pages: P[] = [
    ...cloudPages,
    {
      id: "int",
      title: "Integrations Options",
      sections: [
        { heading: "Reminder", text: "Appointment reminders are sent for sessions scheduled in the past." },
        { heading: "OKTA", text: "OKTA assists EAP Expert Cloud users with single sign-on (SSO). An OKTA account is required. Fill in the OKTA App Embed Link and the OKTA Certification Public Key." },
      ],
    },
    ...filler(30),
  ];
  const embed = axesEmbed([["okta", "single sign-on", "sso"], ["eap expert cloud"], ["reminder"]]);

  it("control: asked with the one distinctive word alone, the OKTA section is found", async () => {
    expect(await search(pages, embed, "okta")).toContain("Integrations Options > OKTA");
  });

  it.fails("asked in a full sentence that also says EAP Expert Cloud, the OKTA section is still found", async () => {
    const result = await search(pages, embed, "We use Okta, how do we set up single sign-on for EAP Expert Cloud?");
    expect(result).toContain("Integrations Options > OKTA");
  });
});

describe("a page the worker's instructions name, against five pages named for the same product word", () => {
  const pages: P[] = [
    ...["Installing Parallels", "Frequent Parallels Errors", "Setting Up a Parallels Connection", "How to work around a frozen screen in Parallels?"].map((title, i) => ({
      id: `p${i}`,
      title,
      sections: [{ text: `Overview of ${title}.` }, { heading: "Steps", text: `The steps for ${title}.` }],
    })),
    { id: "guide", title: "Parallels Support Guide", sections: [{ text: "For people who have trouble connecting from the Parallels application." }, { heading: "First Steps", text: "Check the connection settings and send your Parallels logs." }] },
    { id: "lh", title: "Login Help", sections: [{ text: "Help with login problems." }, { heading: "Forgot your password?", text: "Reset a forgotten login password." }] },
    { id: "la", title: "Login Assistance", sections: [{ text: "Login assistance for users." }, { heading: "Forgot password?", text: "Use the forgot password link at login." }] },
    { id: "lg", title: "Logging into EAP Expert", sections: [{ text: "How to log in to the software." }] },
    ...filler(30),
  ];
  const embed = axesEmbed([["parallels"], ["login", "log in"]]);
  it.fails("a Parallels login question brings the Support Guide into the sections the worker is given", async () => {
    const result = await search(pages, embed, "I cannot login to my parallels account");
    expect(result.some((r) => r.startsWith("Parallels Support Guide"))).toBe(true);
  });
});
