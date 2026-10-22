#!/usr/bin/env node
// Copy one organization's worker configuration to another. See docs/ORG-CLONE.md.
//
//   MIKE_TOKEN=<bearer> node scripts/clone-org.mjs export  --api <url> --out eap-export.json
//   MIKE_TOKEN=<bearer> node scripts/clone-org.mjs import  --api <url> --in  eap-export.json          (dry run)
//   MIKE_TOKEN=<bearer> node scripts/clone-org.mjs import  --api <url> --in  eap-export.json --apply   (writes, after a backup)
//   MIKE_TOKEN=<bearer> node scripts/clone-org.mjs knowledge --api <url> --dir seed/eap-knowledge [--apply]  (load a folder of articles)
//   MIKE_TOKEN=<bearer> node scripts/clone-org.mjs restore --api <url> --backup <backup.json>
//
// The token is read from the environment so it never appears in a command line, a file or the repo. A Clerk session
// token lasts about a minute: fetch a fresh one just before each command.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  applyKnowledge,
  applyPlan,
  backupOrg,
  createClient,
  describePlan,
  exportOrg,
  planImport,
  planKnowledge,
  readKnowledgeDir,
  readTarget,
  restoreBackup,
} from "./clone-org-lib.mjs";

const [command, ...rest] = process.argv.slice(2);
const flags = new Map();
const headers = {};
for (let i = 0; i < rest.length; i++) {
  const arg = rest[i];
  if (!arg.startsWith("--")) continue;
  const name = arg.slice(2);
  if (name === "header") {
    const [key, ...value] = String(rest[++i] ?? "").split("=");
    if (key) headers[key] = value.join("=");
  } else if (["apply", "allow-production"].includes(name)) flags.set(name, true);
  else flags.set(name, rest[++i]);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const api = flags.get("api");
if (!["export", "import", "restore", "knowledge"].includes(command) || !api) {
  fail("Usage: clone-org.mjs <export|import|restore|knowledge> --api <url> [--out|--in|--backup <file>] [--apply] [--header k=v]");
}
const token = process.env.MIKE_TOKEN;
if (!token && Object.keys(headers).length === 0) fail("Set MIKE_TOKEN to a manager bearer token (or pass --header for a local deployment).");

const client = createClient({ api, token, headers });
const host = new URL(api).host;
const looksSafe = /staging|localhost|127\.0\.0\.1/i.test(host);

async function main() {
  if (command === "export") {
    const out = flags.get("out");
    if (!out) fail("--out <file> is required");
    const bundle = await exportOrg(client);
    writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);
    console.log(`Exported ${bundle.customSkills.length} custom skill(s), ${bundle.builtInSkillsEnabled.length} built-in on, ${bundle.knowledge.length} article(s) from ${host} to ${out}`);
    console.log("Nothing was changed on the source. The file holds the worker's instructions and articles: keep it out of the repo.");
    return;
  }

  if (command === "restore") {
    if (!looksSafe && !flags.get("allow-production")) fail(`${host} does not look like staging or local. Pass --allow-production if you really mean it.`);
    const backup = JSON.parse(readFileSync(flags.get("backup"), "utf8"));
    await restoreBackup(client, backup);
    console.log(`Restored the profile and skills from ${flags.get("backup")}. Skills and articles an import added are still there.`);
    return;
  }

  if (command === "knowledge") {
    if (!looksSafe && !flags.get("allow-production")) fail(`${host} does not look like staging or local, so this will not write to it. Pass --allow-production if you really mean it.`);
    const dir = flags.get("dir");
    if (!dir) fail("--dir <folder of .md articles> is required");
    const files = readKnowledgeDir(dir, { readdir: readdirSync, readFile: (file) => readFileSync(file, "utf8") });
    const plan = planKnowledge(files, await client.get("/knowledge"));
    for (const entry of plan) console.log(`  ${entry.action.padEnd(6)} ${entry.conceptId}`);
    if (!flags.get("apply")) return console.log("\nDry run: nothing was written. Add --apply to write. Existing articles are updated, never deleted.");
    await applyKnowledge(client, plan, (line) => console.log(`  ${line}`));
    console.log("Done.");
    return;
  }

  // import
  if (!looksSafe && !flags.get("allow-production")) {
    fail(`${host} does not look like staging or local, so this will not write to it. Pass --allow-production if you really mean it.`);
  }
  const bundle = JSON.parse(readFileSync(flags.get("in") ?? "", "utf8"));
  const target = await readTarget(client);
  const plan = planImport(bundle, target);
  console.log(`From ${bundle.source?.organizationName ?? "the export"} (${bundle.exportedAt}) into ${host}:`);
  for (const line of describePlan(plan)) console.log(`  ${line}`);

  if (!flags.get("apply")) {
    console.log("\nDry run: nothing was written. Add --apply to write, after a backup.");
    return;
  }
  const backup = await backupOrg(client);
  const dir = ".org-clone-backups";
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${host.replace(/[^a-z0-9]+/gi, "_")}.json`);
  writeFileSync(file, `${JSON.stringify(backup, null, 2)}\n`);
  console.log(`\nBacked up the target's current settings to ${file}`);
  await applyPlan(client, bundle, plan, (line) => console.log(`  ${line}`));
  console.log(`Done. To undo the profile and skill changes: restore --api ${api} --backup ${file}`);
}

main().catch((error) => fail(`Failed: ${error.message}`));
