import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureOrganization } from "@/lib/bootstrap";
import { clearRefreshMemory, syncKnowledgeIndex } from "@/lib/knowledge-index";
import { clearKnowledgeSearchCache, searchKnowledgeIndex } from "@/lib/knowledge-search";
import { retrievalQueryFor, retrieveWithEarlierPages } from "@/lib/retrieval-query";
import type { KnowledgeMatch } from "@/lib/knowledge";
import type { IndexPage, IndexSource } from "@/lib/tools-integrations/atlassian";

// Search on a follow-up. EAP's chat, "I can't log in to Parallels", then "No error, connection fails": the search read "No error" as
// the word error, and pages with Error in their title pushed the Parallels Support Guide out of what the worker is given.
// The pages below have the shape of EAP's real ones (checked against a copy of its knowledge base); the stand-in for meaning puts
// every Parallels page on one axis, as the real embeddings do, so the keyword and title halves decide, as they did on prod.

vi.mock("@/lib/query-rewrite", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/query-rewrite")>()), rewriteForSearch: vi.fn(async () => null) }));

const AXES = [["parallels"], ["invoice", "billing", "contract"], ["report", "utilization"], ["wellness", "work-life"]];
const embed = vi.fn(async (texts: string[]) =>
  texts.map((text) => {
    const lower = text.toLowerCase();
    const v = AXES.map((words) => words.filter((w) => lower.includes(w)).length);
    return [...v, v.every((n) => n === 0) ? 1 : 0];
  }),
);

type P = { id: string; title: string; text: string };
const source = (pages: P[]): IndexSource => ({
  source: "confluence",
  listMetadata: async () => pages.map((p) => ({ id: p.id, title: p.title, version: 1, link: null })),
  fetchPages: async (ids): Promise<IndexPage[]> => pages.filter((p) => ids.includes(p.id)).map((p) => ({ id: p.id, title: p.title, text: p.text, link: null })),
});
const FILL = " This section describes the topic in enough words to be a section of its own and to be worth finding later.";

const GUIDE = "Parallels Support Guide";
const PAGES: P[] = [
  {
    id: "guide",
    title: GUIDE,
    text:
      `This article is for people who have trouble connecting to the software from within the Parallels application but have been able to connect before.${FILL}\n` +
      `## First Steps\nCheck the speed of the internet connection. Make sure the connection settings are correct: open the Parallels client, right-click the connection and choose Connection Properties. Send us your Parallels logs.${FILL}\n` +
      `## Suggestions\nIs it your VPN? Exclude the client from antivirus. Make sure the firewall allows traffic over port 443.${FILL}`,
  },
  { id: "pw-error", title: "Error [01/00000011] Failed to change password", text: `After the password is changed an error appears. Cause: incorrect username format.${FILL}\n## Resolution:\nThe username must include the domain.${FILL}` },
  { id: "app-error", title: "APPLICATION ERROR: The application has failed to start because its side-by-side configuration is incorrect", text: `An application error appears when starting the client.${FILL}\n## Resolution:\nRepair the installation of the runtime.${FILL}` },
  { id: "frequent", title: "Frequent Parallels Errors", text: "A list of frequent errors." },
  { id: "hosted", title: "Frequent Locally Hosted Errors", text: `Frequent errors on locally hosted systems.${FILL}` },
  { id: "setup", title: "Setting Up a Parallels Connection", text: `## Step-by-step guide\nInstall the Parallels client and update it to the latest version.${FILL}\n## Setting Up The Parallels Client (Version 18 and Under)\nOpen File, New Connection, enter the primary connection for your region.${FILL}` },
  { id: "install", title: "Installing Parallels", text: `Let's review the steps to install Parallels on your computer.${FILL}` },
  { id: "net", title: "Internet Connection", text: `## Check your connection\nCheck the speed of your connection.${FILL}` },
  { id: "billing", title: "Billing Administration", text: `Manage the billing frequency and period within a contract.${FILL}` },
  { id: "reports", title: "Work-Life Reports", text: `Report on work-life cases and utilization.${FILL}` },
  { id: "wl", title: "Work-Life Balance Support", text: `## Learning Objectives\nWork-life support for members.${FILL}` },
];

const customer = (body: string) => ({ senderType: "customer", body });
const agent = (body: string) => ({ senderType: "agent", body });

let orgId: string;
beforeEach(async () => {
  orgId = `org-followup-${crypto.randomUUID()}`;
  await ensureOrganization(orgId);
  clearKnowledgeSearchCache();
  clearRefreshMemory();
  await syncKnowledgeIndex(orgId, { source: source(PAGES), embed });
});

const search = async (query: string) => {
  clearKnowledgeSearchCache();
  const { matches } = await searchKnowledgeIndex(orgId, query, { embed, rewrite: false, topics: false });
  return { matches, sources: [] };
};
const titles = (matches: KnowledgeMatch[]) => [...new Set(matches.map((m) => m.title))];

describe("a short follow-up keeps the pages that answered the question before it", () => {
  const first = [customer("I can't log in to Parallels")];
  const question = agent("Does it show an error message, or does the connection fail without one?");
  const followUp = customer("No error, connection fails");

  it("finds the Support Guide for the first message", async () => {
    const { matches } = await retrieveWithEarlierPages(search, "widget", [], first[0]);
    expect(titles(matches)).toContain(GUIDE);
  });

  it("still gives the worker the Support Guide after 'No error, connection fails'", async () => {
    const { matches } = await retrieveWithEarlierPages(search, "widget", [first[0], question], followUp);
    expect(titles(matches)).toContain(GUIDE);
    // The guide's own steps, not just its title page.
    expect(matches.some((m) => m.title === GUIDE && m.heading === "First Steps")).toBe(true);
  });

  it("does not search for the word the customer said was absent", async () => {
    const query = retrievalQueryFor([first[0], question, followUp]);
    expect(query.toLowerCase()).not.toContain("error");
  });

  it("leaves a message that stands on its own alone", async () => {
    const { matches } = await retrieveWithEarlierPages(search, "widget", [customer("How do I update the budget report?"), agent("Which one?")], customer("How do I check the Parallels connection settings and the VPN for my whole office?"));
    expect(titles(matches)).toContain(GUIDE);
  });
});
