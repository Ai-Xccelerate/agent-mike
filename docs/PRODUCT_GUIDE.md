# Product and template guide

## Manager workflow

The overview is the daily control room: open work, auto-resolution, escalations, and recent activity. The inbox is the human handoff queue (email + website chat) with take-over and resolve/close. Chat is a live test bench for the customer experience, plus **Website install** (org-bound embed snippet). Knowledge shows which OKF documents are ready. Settings covers identity, role, guardrails, human manager, and integrations (mailbox email; Nylas grant comes from API env).

## Visual system

The frontend is adapted directly from the MIT-licensed [Ai-Xccelerate/aix-ui-template](https://github.com/Ai-Xccelerate/aix-ui-template), pinned during implementation at commit `be94ab537efb88c72273e0f5f10163ce0bf46254` (2026-07-08). The implementation reuses:

- The App Router layout, responsive sidebar behavior, header, theme, density controls, and liquid backdrop.
- The AIX orange accent, cool-neutral surfaces, dark theme, tight radii, and Inter/Geist/JetBrains Mono type system.
- `AgentAvatar`, `AgentHero`, `StatCard`, buttons, badges, tabs, switches, inputs, text areas, tooltips, and the stroke icon library.
- Interaction and content patterns from the inbox, support-ticket, chat, AI settings, and technical-agent dashboard examples.

The template's e-commerce, generator, sales-agent, calendar, and component-gallery routes are removed from the deployed application. Their reusable components remain in the source as licensed references. Mike-specific compositions live under `src/components/mike`, and the five manager routes are `/`, `/inbox`, `/chat`, `/knowledge`, and `/settings`; `/widget` is the public customer surface. This separation makes future template updates easier to diff.

Chrome follows the Agent Nick pattern: portrait brand in the sidebar top, Settings pinned at the bottom, signed-in display name in the header.

The original `LICENSE`, `AIX-DESIGN-SYSTEM.md`, `AIX-REFERENCE.md`, and build notes are retained under `apps/web`. Mike's portrait is a new project asset and is not copied from any existing template agent.

## Content conventions

- Say “Mike” in conversational surfaces and “Agent Mike” in configuration or system status.
- Always make autonomous actions visible: `AI handled`, `Needs review`, or `Human joined`.
- Show source documents beside answers when possible.
- Never label a generated response as resolved until delivery succeeds.
- Keep the human manager one click away from takeover.

## Widget installation

Embeds are **multi-tenant**. Always copy the snippet from **Chat → Website install** while signed into the correct Clerk organization. The iframe `src` includes `?site=<token>` bound to that org. Details: [WIDGET.md](./WIDGET.md).

Example shape (token filled by Copy embed):

```html
<iframe
  src="https://YOUR-WEB-DOMAIN/widget?site=YOUR_SITE_TOKEN"
  title="Chat with Mike"
  allow="microphone"
  style="position:fixed;right:0;bottom:0;width:420px;height:720px;max-width:100vw;max-height:100vh;border:0;z-index:2147483646;background:transparent;color-scheme:light"
></iframe>
```

The widget page shows a floating launcher; the panel opens inside the iframe. Restrict allowed embedding origins with a Content Security Policy for production.
