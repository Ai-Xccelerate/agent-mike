#!/usr/bin/env node
// Interleaved latency benchmark for the customer chat. Start one server per configuration (same build, same
// database, different env), then:
//
//   node scripts/bench-latency.mjs baseline=http://localhost:3101 risk=http://localhost:3103 --rounds 3
//
// Each question goes to every server in rotating order, so provider-latency drift hits every configuration alike.
// Every turn is a fresh conversation. Needs a knowledge base the questions can hit (docs/test-kb) and a manager
// route that works without login (APP_ENV=local, no Clerk). Per-stage numbers come from the servers' `[timing]` log
// lines (lib/timing.ts). See docs/LATENCY-WORK.md.
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const roundsAt = args.indexOf("--rounds");
const rounds = roundsAt >= 0 ? Number(args[roundsAt + 1]) : 3;
const targets = args.filter((arg) => arg.includes("=")).map((arg) => arg.split(/=(.*)/s).slice(0, 2));
if (targets.length < 1) {
  console.error("Usage: node scripts/bench-latency.mjs <name>=<api url> [<name>=<api url> ...] [--rounds N]");
  process.exit(2);
}

const questions = [
  ["grounded", "How do I reset my password?"],
  ["grounded", "I can't sign in, what should I check?"],
  ["grounded", "How do I add a teammate?"],
  ["grounded", "What plans do you offer?"],
  ["grounded", "How long is the free trial?"],
  ["grounded", "What are AI workers?"],
  ["grounded", "How do I get started?"],
  ["ungrounded", "How do I configure a Kubernetes ingress controller?"],
  ["handoff", "I was charged twice this month and I want a refund."],
  ["smalltalk", "Hi there, thanks for the help!"],
];

async function turn(url, message) {
  const started = Date.now();
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/v1/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await response.json().catch(() => ({}));
  return { ms: Date.now() - started, status: response.status, escalated: body.escalated };
}

for (const [, url] of targets) await turn(url, "hello"); // warm-up
const rows = [];
for (let round = 0; round < rounds; round++) {
  for (const [index, [kind, question]] of questions.entries()) {
    for (let k = 0; k < targets.length; k++) {
      const [name, url] = targets[(k + round + index) % targets.length];
      const result = await turn(url, question);
      rows.push({ round, config: name, kind, question, ...result });
      console.log(`${round}.${index} ${name} ${result.ms}ms escalated=${result.escalated}`);
    }
  }
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
console.log("\nmedian ms by config (all / grounded / handoff)");
for (const [name] of targets) {
  const mine = rows.filter((row) => row.config === name);
  const of = (kind) => median(mine.filter((row) => row.kind === kind).map((row) => row.ms));
  console.log(`${name.padEnd(12)} ${median(mine.map((row) => row.ms))} / ${of("grounded")} / ${of("handoff")}`);
}
writeFileSync("bench-results.json", JSON.stringify(rows, null, 1));
console.log("Raw rows: bench-results.json");
