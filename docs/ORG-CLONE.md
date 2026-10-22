# Copying one org's worker setup to another (`scripts/clone-org.mjs`)

Makes a staging org behave like the production org it stands in for, so a test on staging predicts production.

## What is copied

The worker's identity, role, tone, job description, additional instructions, guardrails (confidence, escalation phrases),
channels, ticket schema, identity mode, widget welcome message and quick actions; which built-in skills are on; the org's
own custom skills (full text); and its knowledge articles.

## What is not copied, on purpose

The slug, avatar, support email address, the manager's email, email-on-handoff, integration connections and their settings,
conversations, tickets, and anything a customer said. These belong to the environment: copying them could send real mail
or put real customer data (including protected health information) into a test system. The list is in
`NEVER_CLONED_PROFILE_FIELDS`, and a test checks that none of them travel.

## Use

A manager bearer token is read from `MIKE_TOKEN` so it never lands in a command line, a file or the repo. A session token
lasts about a minute, so fetch a fresh one just before each command (in the signed-in console: `await window.Clerk.session.getToken()`).

```bash
# 1. Read the source (read-only). Keep the file out of the repo: it holds the worker's instructions.
MIKE_TOKEN=... node scripts/clone-org.mjs export --api https://<source api> --out eap-export.json

# 2. See what would change on the target. Nothing is written.
MIKE_TOKEN=... node scripts/clone-org.mjs import --api https://<target api> --in eap-export.json

# 3. Write it. The target's current settings are saved to .org-clone-backups/ first.
MIKE_TOKEN=... node scripts/clone-org.mjs import --api https://<target api> --in eap-export.json --apply

# Undo the profile and skill changes:
MIKE_TOKEN=... node scripts/clone-org.mjs restore --api https://<target api> --backup .org-clone-backups/<file>.json
```

## Safety

- Writing needs a host that looks like staging or local; anything else is refused unless `--allow-production` is passed.
- Importing never deletes: articles only on the target are left alone and reported.
- Running it twice changes nothing the second time (skills match by name, articles by concept id).
- `restore` puts the profile and which skills are on back. Skills and articles an import added stay.
