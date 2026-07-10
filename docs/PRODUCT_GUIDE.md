# Product and template guide

## Manager workflow

The overview is the daily control room: it highlights open work, auto-resolution, response time, escalations, channel mix, and Mike's recent activity. The inbox is the human handoff queue and provides conversation context, AI confidence, sources, and an explicit take-over action. Chat is a live test bench for the website experience. Knowledge shows which documents are ready, stale, or processing. Settings is the control plane for identity, role, guardrails, knowledge behavior, and integrations.

## Visual system

The frontend is adapted directly from the MIT-licensed [Ai-Xccelerate/aix-ui-template](https://github.com/Ai-Xccelerate/aix-ui-template), pinned during implementation at commit `be94ab537efb88c72273e0f5f10163ce0bf46254` (2026-07-08). The implementation reuses:

- The App Router layout, responsive sidebar behavior, header, theme, density controls, and liquid backdrop.
- The AIX orange accent, cool-neutral surfaces, dark theme, tight radii, and Inter/Geist/JetBrains Mono type system.
- `AgentAvatar`, `AgentHero`, `StatCard`, buttons, badges, tabs, switches, inputs, text areas, tooltips, and the stroke icon library.
- Interaction and content patterns from the inbox, support-ticket, chat, AI settings, and technical-agent dashboard examples.

The template's e-commerce, generator, sales-agent, calendar, and component-gallery routes are removed from the deployed application. Their reusable components remain in the source as licensed references. Mike-specific compositions live under `src/components/mike`, and the five manager routes are `/`, `/inbox`, `/chat`, `/knowledge`, and `/settings`; `/widget` is the public customer surface. This separation makes future template updates easier to diff.

The original `LICENSE`, `AIX-DESIGN-SYSTEM.md`, `AIX-REFERENCE.md`, and build notes are retained under `apps/web`. Mike's portrait is a new project asset and is not copied from any existing template agent.

## Content conventions

- Say “Mike” in conversational surfaces and “Agent Mike” in configuration or system status.
- Always make autonomous actions visible: `AI handled`, `Needs review`, or `Human joined`.
- Show source documents beside answers when possible.
- Never label a generated response as resolved until delivery succeeds.
- Keep the human manager one click away from takeover.

## Widget installation

The widget can be embedded directly as an iframe:

```html
<iframe
  src="https://YOUR-WEB-DOMAIN/widget"
  title="Chat with Mike"
  style="position:fixed;right:24px;bottom:24px;width:390px;height:650px;border:0;z-index:9999"
  allow="clipboard-write"
></iframe>
```

For production, wrap the iframe in a small launcher script so the panel loads only after the customer clicks the chat button. Restrict allowed embedding origins with a Content Security Policy.
