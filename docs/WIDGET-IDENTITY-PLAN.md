# Widget: know who's chatting, verify before raising a ticket

Status: **plan only, not started.** Waiting on Rahul's go-ahead and EAP's answers (below).
Design options: <https://claude.ai/artifact/4yPC9f2U2akVbCh3kuYhpZ> (option B + B+).

## The problem

Every widget conversation shows as **"Website visitor"** in the inbox.

- The widget never asks who someone is. `runChatRequest` (`lib/chat-turn.ts`) creates the conversation without a name, so `customer_name` falls back to the database default "Website visitor" (`db/schema.ts`).
- The `verify-customer` skill asks for an email in plain chat but never saves it on the conversation.
- Its check passes if the typed email matches a CRM contact. Anyone who knows a customer's email would pass.
- **Require user verification** is not enforced for widget chats.

## What EAP does today (read from their site, 13 Oct 2026)

- eapexpert.com/service-desk sends people to a Jira Service Management portal (eapexpert.atlassian.net).
- To raise anything you must sign up or sign in. Sign-up is open to any email: the portal emails a set-password link. **So EAP checks that you own the email, not that you're a customer.**
- Request types: Report a Bug, User/License Change, Request a New Feature, General Questions, Training Request, System Unavailable, Professional Services, Suggest Improvement, Security/Compliance Questions.
- Report a Bug asks for: Summary, Priority (Critical, High, Medium, Low, Informational), Description, Attachment.
- For urgent issues they say to call 1-905-702-1380 ext 1.

## Agreed approach

Match EAP's portal: open for questions, email-verified for tickets. No passwords.

1. **General questions: no sign-in.** Anyone can ask. Mike answers from EAP's knowledge base.
2. **Raising a ticket or bug:**
   1. Mike shows a card in the chat asking for **name and email**.
   2. Mike emails a **6-digit code**. The visitor types it into the chat.
   3. Once verified, Mike collects the same fields as the portal form (for a bug: summary, priority, description, attachment), shows a summary, and the visitor confirms.
   4. Mike raises the request in Jira for that email and shows the ticket number.
3. **System unavailable:** show the phone number straight away, as the website does.
4. **Inbox:** shows the real name, with a tag: *Verified*, *Email given, not verified* or *Anonymous*. Anonymous chats get a short label ("Visitor 4821") instead of all reading "Website visitor".

Until a visitor is verified, Mike answers general questions and can start collecting ticket details, but **does not read out existing tickets or account details**.

## Build plan

### Database (`db/migrations/0036_widget_identity.sql` or the next free number, hand-written, plus a `_journal.json` entry)

The branch is based on an older staging. 0033 to 0035 are now taken on staging (0035 is the ticket summary), so rebase first and take the next free number.

- `conversations.customer_email_verified_at timestamptz null`
- `conversations.identity_source text null` (`widget_card`, `email_code`, later `host_site`)
- New table `email_verification_codes`: `id`, `organization_id`, `conversation_id`, `email`, `ip`, `code_hash`, `attempts`, `expires_at`, `consumed_at`, `created_at`. Store a hash only. Codes expire after 10 minutes. Limits are in "Rate limiting the code" below.
- Indexes on `(email, created_at)`, `(ip, created_at)` and `(conversation_id, created_at)`, so the window counts stay cheap.

### Backend

- **Anonymous label:** set `customerName` to `Visitor ####` when `runChatRequest` creates a widget conversation. Add a shared `isPlaceholderCustomerName()` helper (matches "Website visitor" and `Visitor \d+`) and use it in:
  - `lib/customer-turn.ts` `knownCustomerOf`
  - `lib/tools-integrations/atlassian.ts` `handoffTicketDescription`
  - `lib/handoff-notify.ts` `buildHandoffBrief`
  - `frontend/.../NotificationDropdown.tsx`
- **Identity and code endpoints** (widget site token, org-scoped, rate-limited). Add them to `middleware.ts` `publicRequest`.
  - `POST /api/v1/chat/identity` with `{ conversation_id, name, email }`: saves the name and email (unverified), sends the code, returns `{ sent: true }`.
  - `POST /api/v1/chat/identity/verify` with `{ conversation_id, code }`: checks the code and sets `customer_email_verified_at`.
- **Sending the code:** use the outbound mailbox Mike already sends from. The email is plain: "Your code is 481 902. It expires in 10 minutes."
- **New cards** in `lib/customer-cards.ts`:
  - `identity_request`: name and email form.
  - `email_code`: 6-digit entry, resend, expiry.
  - `ticket_draft`: summary, priority, description, Confirm and Edit.

  Emit them from `runCustomerTurn`, the same way the `choices` card works today. The agent signals with a tag such as `[[NEED_IDENTITY]]`, which `parseAnswer` strips.
- **Agent rules** (`lib/agent.ts` `buildInstructions`, plus updated `verify-customer` and `collect-before-escalate` skills):
  - Ask for identity only when raising a ticket or when account details come up.
  - Never ask again once the conversation is verified.
  - The skill's "exact CRM match" rule becomes "verified by email code".
- **Close the self-declared-email holes:** treat `customerEmail` as trusted only when `customer_email_verified_at` is set, in:
  - `lookup_my_tickets` / `customerTicketKeys` (otherwise anyone could read another person's tickets)
  - Gmail send/reply without approval
  - `run_integration_action` auto-approval to the customer's own email
  - the allowed-domains guardrail (`lib/guardrails.ts`)
- **Raising in Jira:** `raiseServiceRequest` currently raises as the connected account. Add `raiseOnBehalfOf: <verified email>` so the ticket belongs to the customer and appears in their portal. This needs the connected account to have agent permission. Confirm on EAP's site.

### Rate limiting the code

The repo has no rate limiting and no Redis today. The code rows already record every request, so the limits are counted in Postgres: exact, shared across instances, and nothing new to run.

Three layers, plus a backstop:

1. **Resend cooldown, per conversation.** One code per 60 seconds. The card shows "Resend in 42s". Check the newest row for the conversation.
2. **Sliding window, per email and per IP** (a sliding window log: count rows with `created_at > now() - interval`).
   - Per email: 3 codes per 15 minutes and 10 per day. Protects the owner of a mailbox from being spammed through our widget.
   - Per IP: about 10 codes per hour. Stops one person trying many addresses.
   - Not a fixed window: that lets a double burst through at the window edge.
3. **Guess limit, per code.** 5 attempts, then the code is burned and the visitor must request a new one (which goes back through layers 1 and 2). A 6-digit code is only a million possibilities, so this is the layer that matters most for security. Compare hashes in constant time.
4. **Backstop:** about 200 codes per organization per day, so a bot swarm can't run up email costs.

Details:

- **Same response whether or not a limit is hit.** Don't reveal that an address is limited or known. Use a generic "If that address is valid, a code is on its way." The limited case returns `429` with `Retry-After`, which the card uses for its countdown.
- **Atomic check and insert.** Count and insert in one transaction, behind a per-email advisory lock (`pg_advisory_xact_lock`), so two simultaneous requests can't both pass under the limit.
- **Client IP.** Read `x-forwarded-for` behind Railway and take only the trusted hop.
- **Cleanup.** Delete code rows older than a day.
- **Not chosen:** token bucket (overkill, layer 1 is a plain cooldown), fixed window (boundary burst), Redis or Upstash (not worth adding for a few codes per ticket).
- Keep the numbers in one config object so they can be tuned.

### Frontend (`frontend/src/components/worker/`)

- `customer-cards/CustomerCards.tsx`: `IdentityRequestView`, `EmailCodeView`, `TicketDraftView`. Extend `CustomerCardsContext` with `onIdentity` and `onVerifyCode`.
- `customer-cards/CustomerCopilot.tsx`: register the three renderers.
- `WorkerChat.tsx` widget mode:
  - new header ("AI assistant for EAP Expert")
  - quick actions matching the portal request types
  - restyled bubbles, as in the design canvas
  - store verified state in the widget's session storage
- `WorkerInbox.tsx`: Verified, Email given and Anonymous tags in the row and thread header. Show initials as "#" for anonymous visitors.

### Tests (`npm test`, vitest)

- Chat route with a widget adapter: a new conversation gets a `Visitor ####` name.
- Identity endpoint: saves an unverified email and sends one code.
- Rate limits: the 60 second cooldown, the per-email window, the per-IP window and the per-organization cap each return `429` with `Retry-After`; the window slides (a request is allowed again once the oldest one ages out); the response is the same for a known and an unknown address.
- Two simultaneous code requests for one email: only one is sent.
- Attempt limit: the fifth wrong code burns the code, and the right code is then refused.
- Expiry after 10 minutes.
- Verify endpoint: a right code sets `verified_at`; a wrong code, an expired code and a reused code all fail.
- `lookup_my_tickets` refuses when the email is not verified.
- AG-UI stream includes `show_identity_request`, `show_email_code` and `show_ticket_draft` cards.
- Placeholder-name helper: used in the handoff brief and the Jira description.
- Migration journal entry.

## Rough effort

| Part | Estimate |
|---|---|
| Name and email card, anonymous labels, inbox tags | 1–1.5 days |
| Email code (table, endpoints, email, card, rate limits) | 1.5 days |
| Ticket draft card with portal fields, raise on behalf | 1 day |
| Closing the unverified-email holes, plus tests | 0.5–1 day |

About 4.5 days in total. Afterwards, port it to the AI Worker template so every agent gets it.

## Questions to settle first

**For Rahul**
1. Go ahead with "questions are open, tickets need an email code"?

**For EAP**

2. Where should the widget go: eapexpert.com, the portal, or inside their software?
3. Is open sign-up on the portal intentional, or should only known customers raise tickets? If only known customers, Mike checks that the verified email belongs to a customer organisation in Jira.
4. Can our connected Jira account raise requests on behalf of customers?
5. Which mailbox should the code come from? (The sender needs SPF and DKIM set up, or the codes land in spam.)
6. Should Mike offer all nine request types, or a shorter list?

## Out of scope for now

- Signing customers in through EAP's own login (option C). Only useful if the widget goes inside EAP's software.
- Phone or SMS codes.
