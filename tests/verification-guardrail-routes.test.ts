import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PATCH as patchWorker } from "@/app/api/v1/worker/route";
import { ensureOrganization } from "@/lib/bootstrap";
import { getIdentityAdapter, setIdentityAdapter, type IdentityAdapter } from "@/lib/identity";
import {
  markConnectionActive,
  upsertPendingConnection,
} from "@/lib/tools-integrations/connection-repository";
import { VERIFY_CUSTOMER_SKILL_ID } from "@/lib/tools-integrations/skills-catalog";

const previousAdapter = getIdentityAdapter();

afterEach(() => {
  setIdentityAdapter(previousAdapter);
});

function adapterFor(orgId: string): IdentityAdapter {
  return {
    resolveManagerRequest: async () => ({
      orgId,
      userId: "test-manager",
      role: "owner",
      source: "test",
    }),
    resolveWidgetRequest: async () => null,
  };
}

type PatchResult = {
  status: number;
  body: {
    requireUserVerification?: boolean;
    enabledSkills?: string[];
    errors?: Record<string, string>;
  };
};

async function patch(body: unknown): Promise<PatchResult> {
  const res = await patchWorker(
    new NextRequest("http://localhost/api/v1/worker", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      duplex: "half" as const,
    }),
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

async function orgWithCrm(name: string): Promise<string> {
  const orgId = `org-${crypto.randomUUID()}`;
  await ensureOrganization(orgId, name);
  setIdentityAdapter(adapterFor(orgId));
  const pending = await upsertPendingConnection({
    organizationId: orgId,
    integrationType: "crm",
    system: "zoho",
    composioAuthConfigId: "ac_zoho",
    connectedBy: "test-manager",
  });
  await markConnectionActive(pending.id, "ca_zoho_active");
  return orgId;
}

describe("require user verification guardrail", () => {
  it("refuses to turn on without a CRM, and writes nothing", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Verification without CRM");
    setIdentityAdapter(adapterFor(orgId));

    const rejected = await patch({ requireUserVerification: true });
    expect(rejected.status).toBe(422);
    expect(rejected.body.errors?.requireUserVerification).toContain("Connect a CRM");

    // The guardrail must not be left half-on.
    const untouched = await patch({ escalationTerms: ["refund"] });
    expect(untouched.status).toBe(200);
    expect(untouched.body.requireUserVerification).toBe(false);
    expect(untouched.body.enabledSkills).toEqual([]);
  });

  it("turns the Verify customer skill on when the guardrail goes on", async () => {
    await orgWithCrm("Verification with CRM");

    const saved = await patch({ requireUserVerification: true });
    expect(saved.status).toBe(200);
    expect(saved.body.requireUserVerification).toBe(true);
    // The whole point: the toggle is the default, not a notice pointing at a
    // switch the manager still has to find.
    expect(saved.body.enabledSkills).toContain(VERIFY_CUSTOMER_SKILL_ID);
  });

  it("leaves the skill on when the guardrail goes back off", async () => {
    await orgWithCrm("Verification toggled off");
    await patch({ requireUserVerification: true });

    const off = await patch({ requireUserVerification: false });
    expect(off.status).toBe(200);
    expect(off.body.requireUserVerification).toBe(false);
    // A manager may have rewritten the skill and still want it running.
    expect(off.body.enabledSkills).toContain(VERIFY_CUSTOMER_SKILL_ID);
  });

  it("lets the manager switch the skill off from Skills while the guardrail stays on", async () => {
    await orgWithCrm("Verification skill independent");
    await patch({ requireUserVerification: true });

    // Only the off->on transition enables it, so this is not re-added.
    const removed = await patch({ enabledSkills: [] });
    expect(removed.status).toBe(200);
    expect(removed.body.requireUserVerification).toBe(true);
    expect(removed.body.enabledSkills).toEqual([]);
  });

  it("refuses to newly enable a skill whose integration is not connected", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    await ensureOrganization(orgId, "Skill requirements unmet");
    setIdentityAdapter(adapterFor(orgId));

    const rejected = await patch({ enabledSkills: [VERIFY_CUSTOMER_SKILL_ID] });
    expect(rejected.status).toBe(422);
    expect(rejected.body.errors?.enabledSkills).toContain("not connected");
  });

  it("still accepts a skill that was already enabled before its connection went away", async () => {
    await orgWithCrm("Skill enabled before disconnect");
    await patch({ requireUserVerification: true });

    // Requirements are re-checked at chat time; an unrelated edit here must not
    // start failing for a reason the manager cannot see on this screen.
    const unrelated = await patch({
      enabledSkills: [VERIFY_CUSTOMER_SKILL_ID],
      escalationTerms: ["chargeback"],
    });
    expect(unrelated.status).toBe(200);
    expect(unrelated.body.enabledSkills).toEqual([VERIFY_CUSTOMER_SKILL_ID]);
  });
});
