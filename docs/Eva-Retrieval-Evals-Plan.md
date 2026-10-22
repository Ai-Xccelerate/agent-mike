# Eva: measure answers from the knowledge base first, then decide on an index

Status: plan only, nothing built. 23 Oct 2026.

## Why

On 22 to 23 Oct, EAP's Eva failed live on "How do members register for the Self-Scheduler?" although the article exists. Three fixes were needed (title ranking, reading pages in full, search before handing over), each found by hand in prod, each costing a 15-minute deploy. After them, 5 of 10 test questions answered. We still cannot say how often Eva answers correctly, and we cannot tell whether a new search design would be better. The audit (Part B) said evals were the missing piece. This plan builds them first.

## What "good" means

For a question a customer might ask:
1. **Found:** the right article is among the pages Eva is given (retrieval).
2. **Answered:** she gives the steps from that article, cites it, and does not invent anything (answer).
3. **Handed over correctly:** if no article covers it, she says so once and raises a ticket instead of guessing (boundary).

## Steps

### 0. Know what is actually in Confluence (half a day)
- Read-only export of every page in the configured spaces: id, title, space, last edited, length, plain text. Kept local, not committed (it is EAP's content).
- Output: a page inventory. This settles which articles really exist. The Assistant's list included titles ("Generating a Utilization Report") that never appeared in raw search results.

### 1. The question set (1 day, with Rahul or Brian)
30 questions in one file (`tests/evals/eap-kb.jsonl`), each with the expected article and one or two facts the answer must contain:
- 20 answerable, written from the page text, in customers' words rather than the page's words.
- 5 paraphrases of those ("sign up" for "register", "didn't get the email" for "not received").
- 5 that must be handed over: not in the KB, a crisis message, one with client details (no PHI in the set).
Sources: real EAP chats from the Inbox (redacted), the tickets Eva has seen, and the manager's Good/Bad ratings (shipped 22 Oct). Every Bad rating can become a new case.

### 2. The runner (1 day)
- **Retrieval mode (no model):** run the search for each question; record whether the right article is in the top 5, and its rank. Fast, cheap, deterministic.
- **Answer mode:** send each question through the real chat and check: answered or handed over, cited the expected article, contains the must-have facts. A model judges only what string checks cannot.
- Needs EAP's Confluence reachable from staging (read-only), so it can run before a deploy to prod. Decision needed from Charan and Brian.

### 3. Baseline (half a day)
Score today's search. Record the numbers in this file with the date and commit. Known so far: 5 of 10 hand-run questions answered.

### 4. Gate
- Found at 90% or better and answered at 85% or better: no index. Fix the specific misses (wording, missing articles, instructions) and re-run.
- Below that: build the index (step 5), and ship it only if it beats the baseline on the same set.

### 5. Only if the gate fails: the index
- Split pages by heading and match sections, not whole pages.
- Keyword plus meaning search, with title and heading boosts (already live in keyword form).
- Live Confluence stays as fallback for new or just-edited pages.
- A sync job with a visible "last synced" time and a staleness alarm.
- Same question set, same scoring; compare to the baseline.

## Running it
- Before every promote to main that touches search or Eva's instructions.
- Nightly on staging once stable, so a Confluence change or a model change shows up as a score change.

## What this does not cover
Latency, cost per answer, and tone. Those stay with the latency work. Email and ticket-status questions need their own set later.

## Decisions needed
1. Allow staging read-only access to EAP's Confluence (Charan, Brian).
2. Who reviews the 30 questions and expected articles (Rahul, Brian, or a support lead).
3. Where the page export may be stored (local only is the default).

## Rough timing
About 3 to 4 working days of effort, in the order above. Steps 0 and 1 can start any time. The gate decision comes after step 3.
