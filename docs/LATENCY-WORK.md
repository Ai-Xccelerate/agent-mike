# Customer chat latency: tracking

Replies from the customer chat (Playground and website widget) were slow. This file tracks what was found, what
changed, what was measured and what is left. Update the checkboxes as work lands.

## Where the time goes

One turn used to run, in series: input intent check (LLM), the main answer (LLM, plus tool loops), the output reply
check (LLM), and on a block a repair run (main + output check again). Everything else (database, retrieval, tool
build) measured about 40 ms locally.

`lib/timing.ts` logs one line per turn: `[timing] {"turn":"customer-chat","channel":"widget","totalMs":…,"stages":[…]}`.
Stages overlap (the input check runs beside the main call), so they do not sum to `totalMs`.

## Changes

| # | Change | Where | Switch | Status |
|---|---|---|---|---|
| 1 | Per-turn stage timings | `lib/timing.ts`, `chat-turn.ts`, `customer-turn.ts`, `agent.ts`, `guardrails.ts` | always on | in this PR |
| 3 | Input intent check runs beside the main call, not before it. The SDK still waits for it before any tool runs, so a write action cannot fire on a message that trips it | `lib/guardrails.ts` | `INPUT_GUARDRAIL_SERIAL=true` restores the old serial check | in this PR |
| 2 | Output reply check skipped on grounded, non-handoff replies; audited afterwards (`[guardrail-shadow]` when the model would have acted) | `lib/guardrails.ts` | `OUTPUT_GUARDRAIL_MODE=risk` (default `always`); `OUTPUT_GUARDRAIL_SHADOW=false` turns the audit off | in this PR, **off by default** |
| 4 | Faster model for both checks | env only | `GUARDRAIL_MODEL` (default is the worker's model) | open: needs a model name from the OpenAI account |
| 7 | Handoff: the helpdesk ticket is raised after the reply is stored; its number follows as a second message with the ticket card, inside the same chat run. Email and the JSON route keep the number in the reply. A second message sent before the ticket exists waits for it and adds to it, so it never raises two | `lib/customer-turn.ts` (`deferTicket`), `lib/chat-turn.ts`, `app/api/v1/chat/agui/route.ts` | none (chat panel only) | in PR, not yet deployed |
| 8 | Request-type catalog: fields read in parallel (were one Jira call per type), and an expired copy is served while a fresh one loads. Fixes the 7.6 s first turn after a deploy or a 10 minute gap | `lib/tools-integrations/atlassian.ts` | none | in PR, not yet deployed |
| 5 | Cache profile, connections, credentials, toolkits per org | | | open: low value locally (about 40 ms), re-check on production timings |
| 6 | Timeout per external retrieval source (Confluence goes through Composio) | | | open: re-check on production timings |

What `risk` mode skips: a reply written with approved reference material found, with words, and no `[[ESCALATE]]`.
What it never skips: handoffs, ungrounded or unknown-grounding replies. The prompt-leak check is deterministic and
always runs.

## Benchmark 1: local, real OpenAI calls (16 Oct 2026)

Three servers, same build, shared `mike_bench` database seeded from `docs/test-kb`, requests interleaved
(`scripts/bench-latency.mjs`). 90 turns: 10 questions x 3 rounds x 3 configurations.

| Config | All turns | Grounded | Handoff |
|---|---|---|---|
| baseline (serial input, output check always) | 6.0 s | 6.2 s | 6.9 s |
| parallel input check | 4.4 s | 4.4 s | 6.0 s |
| parallel input + `risk` output check | 2.6 s | 2.6 s | 6.7 s |

Server stages (median): input check 1.9 s, output check 1.7 s, handoff summary 1.6 s, database + retrieval + tools
about 40 ms combined. All 90 turns returned 200, no `[guardrail-shadow]` warnings, escalation matched on 29 of 30
questions (the other: refund escalated 2 of 3 rounds in baseline, 3 of 3 in the others; model variance).

Caveats: 3 rounds per question; small clean knowledge base, so retrieval always hit; local database, so the network
hop to Postgres is not represented.

## Benchmark 2: staging, deployed code (16 Oct 2026)

Merged as `099b505`, deployed to staging in default mode (`OUTPUT_GUARDRAIL_MODE` unset: input check parallel,
output check on every turn). Widget route, 12 turns, `[timing]` lines read from the Railway logs.

| What | Median |
|---|---|
| Client latency, non-handoff turns | 5.4 s (grounded 5.8 s) |
| Handoff turns | 8.1 s and 18.0 s |

Server stages: retrieval 1.0 to 4.1 s (local: 8 ms, so an external knowledge source dominates), main run 3 to 5.8 s,
output check 1.2 to 2.6 s, input check 1.3 to 2.4 s (overlapped), **Jira ticket on handoff 3.6 s and 12.2 s**
(on the critical path), database + instructions + tools about 50 to 100 ms combined.

Findings: retrieval and the Jira call matter on staging, unlike locally, so items 6 and the handoff path move up.

Risk mode on staging: switched on by hand in Railway. A 15-turn client-side run was inconclusive (median grounded
5.2 s vs 5.8 s, three cold-start-looking outliers) and the server timings could not be read in that session. Charan's
manual tests: "fast enough". `[guardrail-shadow]` not yet checked in the logs.

Testing note: ask only questions the knowledge base answers. Off-KB questions hand over and raise real Jira tickets on
staging (three were raised during these runs and need closing).

## Rollout

- [x] Timings, parallel input check and `risk` mode implemented and unit-tested (812 tests pass)
- [x] Local benchmark 1
- [x] PR #63 merged into staging (`099b505`)
- [x] Staging deployed in default mode, `[timing]` baseline read (benchmark 2)
- [x] `risk` mode switched on for staging; manual check: fast enough (server timings not confirmed)
- [ ] Read `[guardrail-shadow]` and `guardrail.output` in the staging logs to confirm `risk` mode is live and clean
- [ ] Per-source retrieval timeout (item 6): retrieval is 1 to 4 s on staging
- [x] Jira ticket off the critical path on handoff (#7), request-type catalog refresh (#8): in PR; test on staging, then promote
- [ ] Promote staging to production (`main`) with defaults, read the `[timing]` baseline, then set `risk` on production
- [ ] Decide on #4 (guardrail model), #5, #6 from the production numbers
- [ ] Handoff turns: still about 6.7 s (output check + 1.6 s handoff summary); look at it next

## Rollback

`OUTPUT_GUARDRAIL_MODE=always` and `INPUT_GUARDRAIL_SERIAL=true` restore the previous behaviour with a restart, no
redeploy.
