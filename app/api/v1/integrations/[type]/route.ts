import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIdentityAdapter } from "@/lib/identity";
import { isOrgAdmin } from "@/lib/org-roles";
import { getAccountStatus } from "@/lib/tools-integrations/composio-client";
import {
  getConnectionForOrg,
  markConnectionActive,
  markConnectionFailed,
  saveConnectionSettings,
  type IntegrationConnection,
} from "@/lib/tools-integrations/connection-repository";
import {
  connectionSettingsSchema,
  jiraSettingsProblem,
  listJiraProjects,
  readConnectionSettings,
  type JiraSettings,
} from "@/lib/tools-integrations/atlassian";
import { disconnectIntegration } from "@/lib/tools-integrations/disconnect";
import { startReceivingIfGmail } from "@/lib/composio-email";
import { getIntegrationType } from "@/lib/tools-integrations/registry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { type: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!getIntegrationType(params.type)) {
    return NextResponse.json({ error: `Unknown integration type "${params.type}"` }, { status: 400 });
  }

  let row = await getConnectionForOrg(tenant.orgId, params.type);
  if (row?.composioConnectedAccountId && row.status === "pending") {
    try {
      const composioStatus = await getAccountStatus(row.composioConnectedAccountId);
      const normalized = composioStatus.toUpperCase();
      if (normalized === "ACTIVE") {
        row = await markConnectionActive(row.id, row.composioConnectedAccountId);
        // A connected Gmail is also the worker's inbox: start receiving.
        await startReceivingIfGmail(row);
      } else if (normalized === "EXPIRED" || normalized === "FAILED") {
        // A terminal, non-active state — the manager never finished (or was
        // never able to finish) signing in. Without this, a dead attempt sits
        // in "pending" forever: the frontend keeps polling and the card keeps
        // saying "Connecting..." with no way to tell the manager to retry.
        row = await markConnectionFailed(row.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Composio status check failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  return NextResponse.json(withSettings(row));
}

/** The row plus its settings with defaults filled in, so the screen never has to know the defaults. */
function withSettings(row: IntegrationConnection | null) {
  if (!row) return row;
  const settings = readConnectionSettings(row);
  return settings ? { ...row, settings } : row;
}

/**
 * Settings > Integrations: the settings a connection has of its own (Jira's
 * project and issue type for handoff tickets, Confluence's space). Body:
 * { settings: { ...only the fields being changed } }.
 */
export async function PATCH(req: NextRequest, { params }: { params: { type: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  if (!getIntegrationType(params.type)) {
    return NextResponse.json({ error: `Unknown integration type "${params.type}"` }, { status: 400 });
  }
  const row = await getConnectionForOrg(tenant.orgId, params.type);
  if (!row) return NextResponse.json({ error: "Connect it first" }, { status: 404 });
  const schema = connectionSettingsSchema(row.integrationType, row.system);
  if (!schema) {
    return NextResponse.json({ error: `${row.system} has no settings of its own` }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { settings?: unknown } | null;
  const patch = schema.partial().strict().safeParse(body?.settings ?? null);
  if (!patch.success) {
    return NextResponse.json(
      { error: patch.error.issues.map((issue) => `${issue.path.join(".") || "settings"}: ${issue.message}`).join("; ") },
      { status: 400 },
    );
  }

  const merged = schema.parse({ ...readConnectionSettings(row), ...patch.data });

  // A project or issue type Jira doesn't have would make every handoff ticket
  // fail, so it's checked against Jira before it's saved, not discovered at
  // the next handoff.
  const jira = merged as JiraSettings;
  const changesTarget = "projectKey" in patch.data || "issueType" in patch.data;
  if (row.system === "jira" && changesTarget && jira.projectKey && jira.issueType) {
    if (row.status !== "active" || !row.composioConnectedAccountId) {
      return NextResponse.json({ error: "Finish connecting Jira first." }, { status: 409 });
    }
    const projects = await listJiraProjects(tenant.orgId, row.composioConnectedAccountId);
    if (!projects) {
      return NextResponse.json({ error: "Couldn't check the project with Jira. Try again in a moment." }, { status: 502 });
    }
    const problem = jiraSettingsProblem(projects, jira.projectKey, jira.issueType);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  const saved = await saveConnectionSettings(row.id, merged as Record<string, unknown>);
  return NextResponse.json(withSettings(saved));
}

export async function DELETE(req: NextRequest, { params }: { params: { type: string } }) {
  const tenant = await getIdentityAdapter().resolveManagerRequest(req);
  if (!isOrgAdmin(tenant.role)) {
    return NextResponse.json({ error: "Only org admins can do this" }, { status: 403 });
  }
  if (!getIntegrationType(params.type)) {
    return NextResponse.json({ error: `Unknown integration type "${params.type}"` }, { status: 400 });
  }

  const disconnected = await disconnectIntegration(tenant.orgId, params.type);
  if (!disconnected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
