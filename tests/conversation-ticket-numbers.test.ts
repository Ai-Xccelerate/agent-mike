import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import { insertConversationWithTicket } from "@/lib/customer-turn";

describe("insertConversationWithTicket", () => {
  let orgId: string;

  beforeEach(async () => {
    orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Ticket number test");
  });

  afterEach(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it("gives conversations started at the same moment distinct ticket numbers instead of failing", async () => {
    const created = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        insertConversationWithTicket({ organizationId: orgId, channel: "widget", subject: `Visitor ${i}` }),
      ),
    );
    const numbers = created.map((row) => row.ticketNumber);
    expect(new Set(numbers).size).toBe(8);
    expect(Math.min(...numbers)).toBe(1001);
  });
});
