import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { DEFAULT_GRID, runSearchExperiment, type ExperimentResult } from "@/lib/knowledge-search-eval";

// Reads the DB and calls the embedding service per request — never statically prerender or cache this route.
export const dynamic = "force-dynamic";

type Job = { startedAt: string; finishedAt: string | null; error: string | null; results: ExperimentResult[] | null };
const jobs = new Map<string, Job>();

const bodySchema = z.object({
  configs: z.array(z.object({ name: z.string().max(120), tuning: z.record(z.string(), z.unknown()) })).max(40).optional(),
  questions: z.array(z.object({ q: z.string().min(1).max(2000), expected: z.string().min(1).max(300) })).max(200).default([]),
  boundary: z.array(z.string().min(1).max(2000)).max(50).default([]),
});

/**
 * Admin-only, read-only: scores settings of the saved-copy search on one question per indexed page plus the questions
 * sent. POST starts it in the background (it takes a few minutes); GET returns the latest run.
 */
export async function POST(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Check the request" }, { status: 422 });
  const running = jobs.get(tenant.orgId);
  if (running && !running.finishedAt) return NextResponse.json({ error: "An experiment is already running" }, { status: 409 });

  const job: Job = { startedAt: new Date().toISOString(), finishedAt: null, error: null, results: null };
  jobs.set(tenant.orgId, job);
  const configs = (parsed.data.configs ?? DEFAULT_GRID) as Parameters<typeof runSearchExperiment>[1];
  void runSearchExperiment(tenant.orgId, configs, parsed.data.questions, parsed.data.boundary).then(
    (results) => {
      job.results = results;
      job.finishedAt = new Date().toISOString();
    },
    (error) => {
      job.error = error instanceof Error ? error.message : "experiment failed";
      job.finishedAt = new Date().toISOString();
    },
  );
  return NextResponse.json({ started: true, configs: configs.length }, { status: 202 });
}

export async function GET(req: NextRequest) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  return NextResponse.json(jobs.get(tenant.orgId) ?? { startedAt: null, finishedAt: null, error: null, results: null });
}
