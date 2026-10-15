# Demo scenarios

Each file here is one scripted conversation: a visitor's messages, in order, plus what should happen. A scenario is tried on staging until it is right, then marked `"approved": true`. Only approved scenarios can be replayed on production, which is where the demo runs. The demo data can be rebuilt at any time by replaying the approved ones.

## Files

```json
{
  "name": "office-outage",
  "description": "What it shows, in a sentence or two.",
  "approved": false,
  "turns": [{ "say": "The visitor's first message" }, { "say": "Their next one" }],
  "expect": { "finalStatus": "needs_human", "ticketRaised": true, "mustMention": ["a phrase"] }
}
```

`expect` is optional. `requestType` is the type the ticket must end up with (the helpdesk's own name). `finalStatus` is `open` (the worker kept the conversation) or `needs_human`. `ticketRaised` says whether a Jira ticket card must appear. `mustMention` lists phrases at least one reply must contain.

## Running one

The widget site token is read from the environment, never from the command line or the repo. Copy it from Settings > Channels for the environment you are testing.

```bash
# staging: any scenario
MIKE_SITE_TOKEN=... npm run demo -- docs/demo-scenarios/office-outage.json --api https://mike-api-staging.aiworkforce.md

# production: approved scenarios only, and the flag is required
MIKE_SITE_TOKEN=... npm run demo -- docs/demo-scenarios/office-outage.json --api https://mike-api.aiworkforce.md --production

# see the messages without sending anything
npm run demo -- docs/demo-scenarios/office-outage.json --api https://mike-api-staging.aiworkforce.md --dry-run
```

The run prints each reply, its status and any ticket key, then checks `expect` and exits non-zero if it is not met.

Every run creates a real conversation (and, for a handoff, a real Jira ticket). After a staging run, hide the conversations you do not want to keep; on production, run an approved scenario once.

Extra production API hosts can be added with `DEMO_PRODUCTION_HOSTS` (comma separated).

## Approving a scenario

1. Run it on staging until the replies and the ticket are what you want to show.
2. Change `"approved"` to `true` in a pull request. That review is the approval.
3. Replay it on production with `--production`.

## One scenario per request type

| Scenario | Request type it exercises |
|---|---|
| office-outage | System Unavailable (critical, hands over) |
| report-a-bug | Report a Bug |
| user-license-change | User / License Change |
| suggest-improvement | Suggest Improvement |
| pronouns-feature-request | Request a New Feature |
| training-request | Training Request |
| professional-services | Professional Services Request |
| security-compliance-questions | Security / Compliance Questions |
| refund-goes-to-a-person | Billing / Account Question |
| client-information-shared | Worker declines to repeat client details |
| out-of-scope | Worker stays on topic |
