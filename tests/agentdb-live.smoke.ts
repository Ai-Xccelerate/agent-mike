/**
 * Live smoke check against the real AgentDB staging service. Not part of the
 * unit suite — run it with:
 *
 *   npx vite-node tests/agentdb-live.smoke.ts
 *
 * It asserts nothing; it prints what the real service says so the error
 * mapping in lib/agentdb.ts can be verified against a live deployment.
 */
import { checkAgentDbConnection, resolveWorkspaces, AgentDbError } from "../lib/agentdb";

process.env.AGENTDB_API_URL ||= "https://agentdb-aix-staging.up.railway.app";

async function main() {
  console.log("api url:", process.env.AGENTDB_API_URL);
  console.log("enable jwt present:", Boolean(process.env.AGENTDB_ENABLE_JWT));

  const orgId = process.env.AGENTDB_ORG_ID || "default";
  const agentId = process.env.AGENTDB_AGENT_ID || "ai-worker";

  try {
    const resolved = await resolveWorkspaces(orgId, agentId);
    console.log("resolve:", JSON.stringify(resolved, null, 2));
  } catch (error) {
    const known = error instanceof AgentDbError;
    console.log("resolve failed:", known ? `[${error.kind}] ${error.message}` : error);
  }

  const check = await checkAgentDbConnection({ orgId, agentId });
  console.log("mcp check:", JSON.stringify(check, null, 2));
}

void main();
