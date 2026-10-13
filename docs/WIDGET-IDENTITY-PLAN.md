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

### Database (`db/migrations/0033_widget_identity.sql`, hand-written, plus a `_journal.json` entry)

- `conversations.customer_email_verified_at timestamptz null`
- `conversations.identity_source text null` (`widget_card`, `email_code`, later `host_site`)
- New table `email_verification_codes`: `id`, `organization_id`, `conversation_id`, `email`, `code_hash`, `attempts`, `expires_at`, `consumed_at`, `created_at`. Store a hash only. Codes expire after 10 minutes, allow 5 attempts, and resend no more than once a minute.

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
- Identity endpoint: saves an unverified email and sends one code. Rate limit, expiry and attempt limit.
- Verify endpoint: a right code sets `verified_at`; a wrong code, an expired code and a reused code all fail.
- `lookup_my_tickets` refuses when the email is not verified.
- AG-UI stream includes `show_identity_request`, `show_email_code` and `show_ticket_draft` cards.
- Placeholder-name helper: used in the handoff brief and the Jira description.
- Migration journal entry.

## Rough effort

| Part | Estimate |
|---|---|
| Name and email card, anonymous labels, inbox tags | 1–1.5 days |
| Email code (table, endpoints, email, card) | 1 day |
| Ticket draft card with portal fields, raise on behalf | 1 day |
| Closing the unverified-email holes, plus tests | 0.5–1 day |

About 4 days in total. Afterwards, port it to the AI Worker template so every agent gets it.

## Questions to settle first

**For Rahul**
1. Go ahead with "questions are open, tickets need an email code"?

**For EAP**

2. Where should the widget go: eapexpert.com, the portal, or inside their software?
3. Is open sign-up on the portal intentional, or should only known customers raise tickets? If only known customers, Mike checks that the verified email belongs to a customer organisation in Jira.
4. Can our connected Jira account raise requests on behalf of customers?
5. Which mailbox should the code come from?
6. Should Mike offer all nine request types, or a shorter list?

## Out of scope for now

- Signing customers in through EAP's own login (option C). Only useful if the widget goes inside EAP's software.
- Phone or SMS codes.
