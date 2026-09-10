import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { workerProfiles } from "@/db/schema";
import { getIdentityAdapter } from "@/lib/identity";
import { getOrCreateProfile } from "@/lib/bootstrap";

const patchSchema = z
  .object({
    name: z.string().min(1),
    displayName: z.string().min(1),
    avatarInitials: z.string().min(1).max(4),
    email: z.string().email().nullable(),
    tone: z.string().min(1),
    role: z.string().min(1),
    jobDescription: z.string().nullable(),
    systemPromptTemplate: z.string().min(1),
    model: z.string().min(1),
    maxAgentTurns: z.number().int().min(1).max(10),
    confidenceThreshold: z.number().min(0).max(1),
    escalationTerms: z.array(z.string()),
    allowedDomains: z.array(z.string()),
    requireUserVerification: z.boolean(),
    managerName: z.string().min(1),
    managerEmail: z.string().email().nullable(),
    autoReply: z.boolean(),
    toolsConfig: z.record(z.string(), z.boolean()),
    channelsConfig: z.object({ email: z.boolean(), chat: z.boolean(), voice: z.boolean() }),
    ticketPrefix: z.string().min(1).max(12),
  })
  .partial();

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);
  return NextResponse.json(profile);
}

export async function PATCH(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  const profile = await getOrCreateProfile(tenant.orgId);

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(workerProfiles)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(workerProfiles.id, profile.id))
    .returning();

  return NextResponse.json(updated);
}
