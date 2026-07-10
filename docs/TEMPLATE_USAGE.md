# AIX UI template usage map

This product uses [Ai-Xccelerate/aix-ui-template](https://github.com/Ai-Xccelerate/aix-ui-template) under its included MIT license. The implementation snapshot was commit `be94ab537efb88c72273e0f5f10163ce0bf46254` from July 8, 2026.

## Use these template foundations

| Template area | Mike usage | Guidance |
|---|---|---|
| `src/app/globals.css` | Global tokens, fonts, dark mode, density, glass chrome | Keep as the design-system source of truth. Add semantic tokens; do not hardcode page colors. |
| `src/app/(admin)/layout.tsx` | Manager console shell | Keep the fluid layout and responsive sidebar offsets. |
| `src/layout/AppSidebar.tsx` | Five-route Mike navigation and agent status | This file is intentionally product-specific. Reapply it after upstream template updates. |
| `src/layout/AppHeader.tsx` | Search, theme, density, notifications, manager menu | Connect search and notifications to real data in the authentication phase. |
| `src/context/*` | Sidebar, theme, and density state | Reuse unchanged. |
| `src/components/common/LiquidBackdrop.tsx` | Ambient app canvas | Keep glass limited to chrome; content cards stay opaque. |
| `src/components/aix/AgentAvatar.tsx` | Mike portrait and status | Mike was added as a new agent identity without changing existing template identities. |
| `src/components/aix/dashboards/AgentHero.tsx` | Mike overview header | Reused directly with Mike’s role and support metrics. |
| `src/components/aix/StatCard.tsx` | Daily support KPIs | Reused directly. Prefer operational metrics, not vanity metrics. |
| `src/components/ui/*` and `src/components/form/*` | Controls, badges, buttons, inputs | Use before creating new primitives. |
| `src/icons/*` | Product iconography | Use the supplied stroke set; do not introduce emoji icons. |
| Inbox, chat, tickets, and AI settings examples | Interaction references | Mike’s components adapt their layout and states, while using live support data types. |

## Mike-specific layer

All new product behavior is under `src/components/mike`:

- `MikeDashboard.tsx` — operational overview and health.
- `SupportInbox.tsx` — email/chat queue, AI decision context, and takeover.
- `ChatExperience.tsx` — manager test bench and public widget conversation.
- `KnowledgeManager.tsx` — OKF validation and document library.
- `MikeSettings.tsx` — identity, role, guardrails, manager, and integration status.

The product routes only compose these components. API types and preview fixtures live in `src/lib/mike-api.ts`.

## Do not ship from the template

The template includes sales dashboards, e-commerce, generators, calendars, auth examples, maps, and a component gallery. Those route files have been removed so they cannot be exposed in production. Their underlying reusable components remain useful implementation references. Once the team no longer needs those references, remove the unused components and dependencies to reduce the frontend bundle and maintenance surface further.

Do not reuse another named agent’s portrait for Mike. Do not expose the template’s reference overlay or component command palette in production. Do not copy demo customer data into analytics or email systems.

## Updating the template

1. Fetch the new upstream revision into a separate directory.
2. Review `AIX-DESIGN-SYSTEM.md`, `globals.css`, contexts, primitives, and layout changes first.
3. Apply safe foundation changes to `apps/web`.
4. Preserve the Mike-specific sidebar, identity token, portrait, page components, and API library.
5. Run `npm run lint` and `npm run build`, then visually check all five manager routes, dark mode, compact density, mobile navigation, and `/widget`.
