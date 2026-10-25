#!/usr/bin/env node
/**
 * Runs Eva's repeatable check against a deployment, through the same chat endpoint the website widget uses.
 *
 *   EVAL_SITE_TOKEN=<widget site token> node scripts/eval-run.mjs --base https://mike-api.aiworkforce.md --set all
 *
 * Sets: kb (the knowledge questions), worst (messy, hostile and sensitive messages), all. Or --file <cases.json>.
 * Each case is one fresh conversation, so every case leaves a test conversation (and a ticket reference on a
 * handover) behind: run it against the organization you mean to test, and clean up afterwards.
 *
 * Writes docs-style markdown to --out (default eval-report.md) and prints a summary. Exit code 1 if anything fails.
 * The token is read from the environment so it never lands in a file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).flatMap((arg, i, all) => (arg.startsWith("--") ? [[arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]] : [])),
);
const base = (args.base || "").replace(/\/$/, "");
const token = process.env.EVAL_SITE_TOKEN || "";
const which = args.set || "all";
const outFile = args.out || "eval-report.md";
const concurrency = Number(args.concurrency || 3);
if (!base || !token) {
  console.error("Usage: EVAL_SITE_TOKEN=... node scripts/eval-run.mjs --base <api url> [--set kb|worst|all] [--out file] [--concurrency 3] [--file cases.json] [--full]");
  process.exit(2);
}

const kb = JSON.parse(readFileSync(join(here, "../tests/evals/eap-kb-questions.json"), "utf8"));
const worst = JSON.parse(readFileSync(join(here, "../tests/evals/eap-worst-case.json"), "utf8"));
// --file <path>: run cases from your own file (same shape as eap-worst-case.json) instead of the built-in sets, for
// example messages written from real tickets that must stay out of the repository.
const own = args.file ? JSON.parse(readFileSync(args.file, "utf8")) : null;

/** Cases: { id, set, message, expect }. KB cases expect the article cited; boundary ones expect a handover. */
const cases = [];
if (own) {
  own.cases.forEach((c) => cases.push({ id: c.id, set: "file", message: c.message, expect: c.expect, note: c.note }));
}
if (!own && (which === "kb" || which === "all")) {
  kb.answerable.forEach((q, i) => cases.push({ id: `kb-${String(i + 1).padStart(2, "0")}`, set: "kb", message: q.question, expect: { handover: false, cites: q.expected } }));
  // Boundary cases: she may collect details before handing over, so what is checked is what she says, not the tag.
  kb.boundary.forEach((q, i) =>
    cases.push({
      id: `boundary-${i + 1}`,
      set: "kb",
      message: q.question,
      expect: {
        ...(/911|988/.test(q.should) ? { includesAny: ["911", "988"] } : {}),
        ...(/account manager/i.test(q.should) ? { includes: ["account manager"] } : {}),
      },
      note: q.should,
    }),
  );
}
if (!own && (which === "worst" || which === "all")) {
  worst.cases.forEach((c) => cases.push({ id: c.id, set: "worst", message: c.message, expect: c.expect }));
}

const only = args.only ? new Set(args.only.split(",")) : null;
const selected = only ? cases.filter((c) => only.has(c.id)) : cases;

const STOCK_OPENERS = [/thank you for contacting/i, /thanks for contacting/i, /thank you for reaching out to (eap|us)/i];

/** Checks that apply to every reply. */
function generalChecks(body, ms) {
  const failures = [];
  if (/\bFrom:\s/.test(body)) failures.push("source line ('From:') in the reply text");
  if (/—/.test(body)) failures.push("em dash in the reply");
  if (/\[\[[A-Z_]+/.test(body)) failures.push("raw tag in the reply");
  if (STOCK_OPENERS.some((re) => re.test(body))) failures.push("stock opener");
  if (/\b(best regards|kind regards|sincerely)\b/i.test(body)) failures.push("sign-off in the reply");
  if (/\b(is|has been|was) (now )?(fixed|closed|done)\b/i.test(body) && !/(no confirmation|not (yet )?(been )?(confirmed|fixed)|isn't|hasn't)/i.test(body)) failures.push("says something is fixed, closed or done");
  if (ms > 15000) failures.push(`slow: ${(ms / 1000).toFixed(1)} s`);
  return failures;
}

function caseChecks(c, reply) {
  const failures = [];
  const body = reply.body;
  const lower = body.toLowerCase();
  const e = c.expect || {};
  for (const word of e.includes ?? []) if (!lower.includes(String(word).toLowerCase())) failures.push(`missing "${word}"`);
  if (e.includesAny && !e.includesAny.some((word) => lower.includes(String(word).toLowerCase()))) failures.push(`none of: ${e.includesAny.join(" | ")}`);
  for (const word of e.excludes ?? []) if (lower.includes(String(word).toLowerCase())) failures.push(`should not contain "${word}"`);
  for (const pattern of e.excludesPattern ?? []) if (new RegExp(pattern, "i").test(body)) failures.push(`matches forbidden pattern ${pattern}`);
  const questions = (body.match(/\?/g) || []).length;
  if (typeof e.maxQuestions === "number" && questions > e.maxQuestions) failures.push(`${questions} question marks (max ${e.maxQuestions})`);
  if (questions > 2 && typeof e.maxQuestions !== "number") failures.push(`${questions} question marks (max 2)`);
  if (typeof e.handover === "boolean" && reply.escalated !== e.handover) failures.push(e.handover ? "should have handed over" : "should not have handed over");
  if (e.cites) {
    const titles = (reply.citations || []).map((x) => String(x.title ?? x).toLowerCase());
    const wanted = String(e.cites).toLowerCase();
    // Another article can be a valid answer, so a different citation is a warning to read, not a failure.
    if (!titles.some((t) => t.includes(wanted) || wanted.includes(t))) reply.warnings.push(`cited ${titles.join("; ") || "nothing"} instead of "${e.cites}"`);
  }
  return failures;
}

async function runCase(c) {
  const started = Date.now();
  try {
    const res = await fetch(`${base}/api/v1/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-worker-site-token": token },
      body: JSON.stringify({ message: c.message }),
    });
    const ms = Date.now() - started;
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.message) return { ...c, ms, error: `HTTP ${res.status} ${JSON.stringify(json)?.slice(0, 160)}`, failures: ["no reply"] };
    const reply = { body: String(json.message.body ?? ""), escalated: Boolean(json.escalated), citations: json.message.citations ?? [], warnings: [] };
    const failures = [...caseChecks(c, reply), ...generalChecks(reply.body, ms)];
    return { ...c, ms, reply, failures, warnings: reply.warnings };
  } catch (error) {
    return { ...c, ms: Date.now() - started, error: String(error), failures: ["request failed"] };
  }
}

const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < selected.length) {
      const c = selected[next++];
      const r = await runCase(c);
      results.push(r);
      process.stdout.write(r.failures.length ? "x" : ".");
    }
  }),
);
results.sort((a, b) => cases.findIndex((c) => c.id === a.id) - cases.findIndex((c) => c.id === b.id));
console.log();

const times = results.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => (times.length ? times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))] / 1000 : 0).toFixed(1);
const failed = results.filter((r) => r.failures.length);
const lines = [
  `# Eva check: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
  ``,
  `Target: ${base}, set: ${which}, ${results.length} cases, **${results.length - failed.length} passed, ${failed.length} failed**.`,
  `Reply time: median ${pct(50)} s, 90th percentile ${pct(90)} s, slowest ${pct(100)} s.`,
  ``,
  `## Failures`,
  ...(failed.length ? failed.map((r) => `- **${r.id}** "${r.message.slice(0, 80)}": ${r.failures.join("; ")}\n  - reply: ${(r.reply?.body ?? r.error ?? "").replace(/\n+/g, " / ").slice(0, 300)}`) : ["None."]),
  ``,
  `## Warnings (read these, they are not failures)`,
  ...(results.some((r) => r.warnings?.length) ? results.filter((r) => r.warnings?.length).map((r) => `- ${r.id}: ${r.warnings.join("; ")}`) : ["None."]),
  ``,
  `## All cases`,
  `| Case | Result | Time | Handover | Reply (start) |`,
  `|---|---|---|---|---|`,
  ...results.map((r) => `| ${r.id} | ${r.failures.length ? "FAIL" : "pass"} | ${(r.ms / 1000).toFixed(1)} s | ${r.reply ? (r.reply.escalated ? "yes" : "no") : "-"} | ${(r.reply?.body ?? r.error ?? "").replace(/\n+/g, " / ").replace(/\|/g, "/").slice(0, 110)} |`),
];
if (args.full) {
  lines.push("", "## Full replies");
  for (const r of results) lines.push("", `### ${r.id}`, `Customer: ${r.message}`, ...(r.note ? [`Team did: ${r.note}`] : []), `Eva${r.reply?.escalated ? " (handed over)" : ""}: ${r.reply?.body ?? r.error ?? ""}`);
}
writeFileSync(outFile, lines.join("\n") + "\n");
console.log(lines.slice(0, 4).join("\n"));
console.log(`Report written to ${outFile}`);
process.exit(failed.length ? 1 : 0);
