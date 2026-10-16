#!/usr/bin/env node
// Replays a demo scenario (a visitor's messages, in order) against a Mike API through the website widget's endpoint.
//
//   MIKE_SITE_TOKEN=... node scripts/run-demo-scenario.mjs docs/demo-scenarios/office-outage.json --api https://mike-api-staging.aiworkforce.md
//
// The widget site token comes from the environment, never from the command line or the repo. Production runs need an
// approved scenario and --production. See docs/demo-scenarios/README.md.
import { readFileSync } from "node:fs";
import { checkExpectations, checkTarget, parseScenario, summarizeReply } from "./demo-scenario-lib.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const file = args.find((arg) => !arg.startsWith("--") && arg !== option("--api"));
const apiUrl = option("--api");
const die = (message) => {
  console.error(message);
  process.exit(2);
};

if (!file || !apiUrl) die("Usage: MIKE_SITE_TOKEN=... node scripts/run-demo-scenario.mjs <scenario.json> --api <api url> [--production] [--dry-run]");

let scenario;
try {
  scenario = parseScenario(JSON.parse(readFileSync(file, "utf8")));
} catch (error) {
  die(error instanceof Error ? error.message : String(error));
}

const target = checkTarget({ apiUrl, scenario, productionFlag: flag("--production") });
if (!target.ok) die(target.reason);

console.log(`Scenario: ${scenario.name} (${scenario.approved ? "approved" : "not approved yet"}) on ${target.host}${target.production ? " (production)" : ""}`);
console.log(scenario.description);

if (flag("--dry-run")) {
  scenario.turns.forEach((turn, index) => console.log(`  ${index + 1}. visitor: ${turn.say}`));
  console.log("Dry run: nothing was sent.");
  process.exit(0);
}

const token = process.env.MIKE_SITE_TOKEN;
if (!token) die("Set MIKE_SITE_TOKEN to the widget site token (Settings > Channels).");

const replies = [];
let conversationId;
for (const [index, turn] of scenario.turns.entries()) {
  console.log(`\n${index + 1}. visitor: ${turn.say}`);
  const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/v1/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-worker-site-token": token },
    body: JSON.stringify({ message: turn.say, ...(conversationId ? { conversation_id: conversationId } : {}) }),
    signal: AbortSignal.timeout(170_000),
  }).catch((error) => die(`Request failed: ${error.message}`));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) die(`The API answered ${response.status}: ${body.error ?? "no detail"}`);
  const reply = summarizeReply(body);
  conversationId = reply.conversationId ?? conversationId;
  replies.push(reply);
  console.log(`   worker: ${reply.body.replace(/\s+/g, " ").slice(0, 400)}`);
  console.log(`   status: ${reply.status}${reply.ticketKey ? `, ticket ${reply.ticketKey}` : ""}${reply.requestType ? ` (${reply.requestType})` : ""}`);
}

console.log(`\nconversation: ${conversationId}`);
const problems = checkExpectations(scenario.expect, replies);
if (problems.length) {
  console.log("FAILED:");
  problems.forEach((problem) => console.log(`  - ${problem}`));
  process.exit(1);
}
console.log("Passed.");
