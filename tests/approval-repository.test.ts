import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { toolApprovals } from "@/db/schema";
import { ensureOrganization } from "@/lib/bootstrap";
import {
  createPendingApproval,
  decideApproval,
  getApproval,
  listPendingApprovals,
} from "@/lib/tools-integrations/approval-repository";

describe("approval repository", () => {
  it("creates a pending approval, lists it, decides once, and refuses a second decision", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Approval test org");

    const pending = await createPendingApproval({
      organizationId: orgId,
      toolId: "create_crm_lead",
      input: { name: "Ada Lovelace", email: "ada@example.com" },
    });

    expect(pending.status).toBe("pending");
    expect(pending.decidedBy).toBeNull();
    expect(pending.decidedAt).toBeNull();

    const listed = await listPendingApprovals(orgId);
    expect(listed.map((row) => row.id)).toEqual([pending.id]);

    const approved = await decideApproval(pending.id, "approved", "manager-1");
    expect(approved.status).toBe("approved");
    expect(approved.decidedBy).toBe("manager-1");
    expect(approved.decidedAt).toBeInstanceOf(Date);

    const fetched = await getApproval(pending.id);
    expect(fetched?.status).toBe("approved");
    expect(await listPendingApprovals(orgId)).toEqual([]);

    await expect(decideApproval(pending.id, "rejected", "manager-2")).rejects.toThrow(
      "Approval is not pending and cannot be decided again",
    );

    const unchanged = await getApproval(pending.id);
    expect(unchanged?.status).toBe("approved");
    expect(unchanged?.decidedBy).toBe("manager-1");

    await db.delete(toolApprovals).where(eq(toolApprovals.id, pending.id));
  });
});
