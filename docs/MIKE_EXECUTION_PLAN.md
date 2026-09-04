# Agent Mike — execution plan (from Rahul)

Source: **Agent Mike Discussion Call** (1 Sep 2026)  
Participants: Charan Naik, Rahul Bhavsar  
Meeting id: `6e7fab0c-f8a0-446f-9d4f-11ce9bb4e1a3`

ASR note: spoken “Niles” / “NYLIS” → **Nylas**; “cloud SDK” → Claude / agent SDK context; “or part and their product staging” → launch on **product staging**.

Quotes below are **verbatim from the transcript** (light punctuation only).

---

## Intent (Rahul)

> “finish Mike very quickly”

Then move on to later work (advisor concept, etc.). Mike is the near-term finish line, not a long redesign.

> “If the scope is not too much, then move fast.”

---

## Status snapshot (as of multi-tenant widget)

| Workstream | Status |
|---|---|
| Core auth + org structure + staging deploy | **Done** |
| Website widget (per-org `widget_sites`, launcher, STT) | **Done** — re-copy embed after deploy (`?site=`) |
| Flip mailbox AgentMail → Nylas | **Done** (live smoke optional) |
| Swap Claude SDK → OpenAI Agents SDK | **Done** (`gpt-5.6-luna` default) |
| Deepgram STT / voice input | **Superseded** by OpenAI `gpt-transcribe` on Chat/widget mic |
| ElevenLabs if voice lag is bad | **Later** |
| Stress test after core structure | **Later** |
| Launch on product staging (wired end-to-end) | **In progress** |

---

## Priority order (do in this sequence)

### 1. Authentication + org structure → connect to AIX Core — DONE

**Why:** Prototype had no auth / org / users.

**Rahul (verbatim):**

> “But we didn't have authentication and so on.”

> “Yeah. So put the authentication under and connect it to our … core”

> “what I have not coded is you know, what I hard coded is did not have a organization set up and these things. So I I just built the prototype as it is. So what you want to do is you want to put a structure around it. You wanna put authentication. You wanna put organization then set up organization, set up users, and all of those things. So those those things have to be added. So if the core element is there, that's good. Then we need to run it through stress test”

**Done means:** Manager UI signs in via Core/Clerk; JWT verified on Mike API; Core `/api/v1/agents/mike/access`; data org-scoped.

**Not automatic for widget/email:** public widget and inbound mail have no Clerk session. Widget tenant = per-org `widget_sites` token from Copy embed ([WIDGET.md](./WIDGET.md)). Email tenant = `nylas_mailboxes`. Manager console org comes from the JWT.

---

### 2. Flip mailbox from AgentMail → Nylas — DONE

**Why:** Explicit instruction; AgentMail was temporary prototype wiring.

**Rahul (verbatim):**

> “Mailbox right now, it is it was connected using agent mail. … I would like you to flip that to Niles You you have access to Niles?”

> “K. Let me handle that.” *(Nylas access for Charan)*

**Done means:** Inbound/outbound support mail goes through Nylas Agent Account (target mailbox such as `agent.mike@wkr.email`); AgentMail webhook path retired; Inbox shows live Nylas threads.

---

### 3. Swap Claude SDK → Agents SDK (cheaper models) — DONE

**Why:** Cost; Rahul prefers Agents SDK + cheaper models (“Cara and Luna” → **gpt-5.6-sol** / **gpt-5.6-luna**).

**Done means:** Mike’s answer path uses OpenAI Agents SDK with `OPENAI_MODEL` (default `gpt-5.6-luna`); Anthropic harness removed; DEMO_MODE still works for offline checks.

---

### 4. Test the website widget — DONE (re-copy embeds)

**Done means:** `/widget?site=<token>` on staging answers against live knowledge for the **copying org**; floating launcher; escalation / inbox path visible to that org’s manager. See [WIDGET.md](./WIDGET.md).

---

### 5. Voice (Deepgram, then ElevenLabs if needed) — LATER / PARTIAL

Chat and widget mic use OpenAI `gpt-transcribe` (not Deepgram). ElevenLabs only if product voice lag requires it.

---

### 6. Wire everything and launch on product staging — GATE

**Rahul (verbatim):**

> “So if you wire all of these things connected and launch it on or part and their product staging, that'll be That'll be good.”

**Done means:** Staging URL works for signed-in managers; widget + mail + knowledge + escalation exercised; Core catalog access enabled for the test org.

---

## Out of scope for “finish Mike” (called out after Mike)

Rahul’s next product after Mike:

> “So finish Mike very quickly The next piece which you wanna do is is come up with a adviser type of concept.”

Do not block Mike on advisor / Product Hunt / mobile unless explicitly pulled forward.

---

## Suggested near-term checklist

1. [x] Auth + Core + org structure on staging  
2. [x] Nylas cutover (replace AgentMail)  
3. [x] OpenAI Agents SDK swap  
4. [x] Widget multi-tenant (`widget_sites` + Copy embed)  
5. [ ] Stress / product staging pass  
6. [ ] Voice quality follow-up (ElevenLabs only if needed)

---

## Citation index

| Topic | Timestamp | Speaker |
|---|---|---|
| Multi-tenant / SDK question | `[8:03]` | Rahul |
| No authentication | `[8:37]` | Rahul |
| Auth + connect to Core | `[8:44]`–`[8:51]` | Rahul |
| Test website widget | `[8:55]` | Rahul |
| Deepgram STT | `[9:01]`–`[9:08]` | Rahul |
| Org / users structure around prototype | `[9:33]`–`[10:04]` | Rahul |
| Swap Claude SDK → agent SDK (Cara/Luna cheaper) | `[10:06]` | Rahul |
| Effort check + AgentMail → Nylas | `[10:32]`–`[10:53]` | Rahul |
| No voice engine yet / lag / ElevenLabs | `[11:29]`–`[12:08]` | Rahul |
| Launch on product staging | `[12:08]` | Rahul |
| Move fast if scope is small | `[12:36]` | Rahul |
| Finish Mike quickly | `[30:35]` | Rahul |
