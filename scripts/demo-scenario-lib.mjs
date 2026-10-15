// Pure helpers for scripts/run-demo-scenario.mjs, kept apart so tests can import them.

/** Production API hosts. A scenario only runs against these when it is approved and the run says so. */
export const DEFAULT_PRODUCTION_HOSTS = ["mike-api.aiworkforce.md"];

export function productionHosts(env = process.env) {
  const extra = (env.DEMO_PRODUCTION_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_PRODUCTION_HOSTS, ...extra])];
}

/** Checks the shape of a scenario file and returns it, or throws with what is wrong. */
export function parseScenario(raw) {
  const fail = (message) => {
    throw new Error(`Invalid scenario: ${message}`);
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("it must be a JSON object");
  if (typeof raw.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(raw.name)) fail('"name" must be lowercase letters, digits and dashes');
  if (typeof raw.description !== "string" || !raw.description.trim()) fail('"description" is required');
  if (typeof raw.approved !== "boolean") fail('"approved" must be true or false');
  if (!Array.isArray(raw.turns) || raw.turns.length === 0) fail('"turns" must list at least one message');
  raw.turns.forEach((turn, index) => {
    if (!turn || typeof turn.say !== "string" || !turn.say.trim()) fail(`turn ${index + 1} needs a non-empty "say"`);
    if (turn.say.length > 4000) fail(`turn ${index + 1} is too long`);
  });
  const expect = raw.expect ?? {};
  if (expect.finalStatus !== undefined && !["open", "needs_human"].includes(expect.finalStatus)) fail('"expect.finalStatus" must be open or needs_human');
  if (expect.ticketRaised !== undefined && typeof expect.ticketRaised !== "boolean") fail('"expect.ticketRaised" must be true or false');
  if (expect.requestType !== undefined && (typeof expect.requestType !== "string" || !expect.requestType.trim())) fail('"expect.requestType" must be a request type name');
  if (expect.mustMention !== undefined && !(Array.isArray(expect.mustMention) && expect.mustMention.every((text) => typeof text === "string"))) {
    fail('"expect.mustMention" must be a list of strings');
  }
  return { ...raw, expect };
}

/**
 * Decides whether a run may go ahead. Anything that is not a known production
 * host is a test environment and always may. Production needs an approved
 * scenario and an explicit flag, so a scenario still being tried can never
 * land in the demo by accident.
 */
export function checkTarget({ apiUrl, scenario, productionFlag, env = process.env }) {
  let host;
  try {
    host = new URL(apiUrl).host.toLowerCase();
  } catch {
    return { ok: false, reason: `"${apiUrl}" is not a valid URL` };
  }
  if (!productionHosts(env).includes(host)) return { ok: true, production: false, host };
  if (!scenario.approved) return { ok: false, reason: `"${scenario.name}" is not approved, so it will not run on production (${host}). Try it on staging first.` };
  if (!productionFlag) return { ok: false, reason: `${host} is production. Add --production to run the approved scenario "${scenario.name}" there.` };
  return { ok: true, production: true, host };
}

/** What one chat reply says, for the printout and for the checks. */
export function summarizeReply(response) {
  const message = response?.message ?? {};
  const ticket = (message.cards ?? []).find((card) => card?.kind === "helpdesk_ticket");
  return {
    status: response?.status ?? null,
    escalated: Boolean(response?.escalated),
    body: typeof message.body === "string" ? message.body : "",
    ticketKey: ticket?.data?.key ?? null,
    requestType: typeof ticket?.data?.requestType === "string" ? ticket.data.requestType : null,
    conversationId: response?.conversation_id ?? null,
  };
}

/** Compares a finished run with what the scenario expects. Returns the list of problems; empty means it passed. */
export function checkExpectations(expect, replies) {
  const problems = [];
  const last = replies[replies.length - 1];
  if (!last) return ["no reply came back"];
  if (expect.finalStatus !== undefined && last.status !== expect.finalStatus) {
    problems.push(`the conversation ended ${last.status}, expected ${expect.finalStatus}`);
  }
  if (expect.ticketRaised !== undefined) {
    const raised = replies.some((reply) => reply.ticketKey);
    if (raised !== expect.ticketRaised) problems.push(expect.ticketRaised ? "no helpdesk ticket was raised" : "a helpdesk ticket was raised and should not have been");
  }
  if (expect.requestType !== undefined) {
    const got = [...replies].reverse().find((reply) => reply.requestType)?.requestType ?? null;
    if (!got) problems.push(`no ticket named a request type, expected ${expect.requestType}`);
    else if (got.toLowerCase() !== expect.requestType.toLowerCase()) problems.push(`the ticket was raised as ${got}, expected ${expect.requestType}`);
  }
  for (const text of expect.mustMention ?? []) {
    if (!replies.some((reply) => reply.body.toLowerCase().includes(text.toLowerCase()))) problems.push(`no reply mentioned "${text}"`);
  }
  return problems;
}
