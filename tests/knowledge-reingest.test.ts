import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeDocuments, organizations } from "@/db/schema";
import { editKnowledgeDocument, ingestOkf, wrapAsOkf } from "@/lib/knowledge";

const okf = (title: string, extra = "") =>
  `---\ntype: reference\nid: stories\ntitle: "${title}"\ndescription: "Four stories."\ntags: [case-study]\nresource: "https://example.com/stories"\n${extra}---\n\nSource: https://example.com/stories\n\nThe stories.`;

let orgId: string;
beforeEach(async () => {
  orgId = `reingest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await db.insert(organizations).values({ id: orgId, name: orgId });
});

const stored = async () =>
  (await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.organizationId, orgId)))[0];

describe("re-ingesting an article", () => {
  it("applies a changed title even when the body is the same", async () => {
    await ingestOkf(orgId, "stories", okf("Customer proof stories"));
    await ingestOkf(orgId, "stories", okf("Customer case studies (proof stories)"));
    expect((await stored()).title).toBe("Customer case studies (proof stories)");
  });

  it("leaves the article alone when nothing changed", async () => {
    const first = await ingestOkf(orgId, "stories", okf("Customer proof stories"));
    const again = await ingestOkf(orgId, "stories", okf("Customer proof stories"));
    expect(again.id).toBe(first.id);
    expect((await stored()).title).toBe("Customer proof stories");
  });

  it("keeps the description, tags and source URL when a plain re-upload only changes the title", async () => {
    await ingestOkf(orgId, "stories", okf("Customer proof stories"));
    await ingestOkf(orgId, "stories", wrapAsOkf("stories", "Case studies", "Source: https://example.com/stories\n\nThe stories."));
    const row = await stored();
    expect(row.title).toBe("Case studies");
    expect(row.description).toBe("Four stories.");
    expect(row.tags).toEqual(["case-study"]);
    expect(row.resource).toBe("https://example.com/stories");
  });

  it("keeps the source URL when an article is edited from the Knowledge page", async () => {
    const saved = await ingestOkf(orgId, "stories", okf("Customer proof stories"));
    await editKnowledgeDocument(orgId, saved, "Customer case studies", "Source: https://example.com/stories\n\nThe stories, edited.");
    const row = await stored();
    expect(row.title).toBe("Customer case studies");
    expect(row.resource).toBe("https://example.com/stories");
    expect(row.description).toBe("Four stories.");
  });
});
