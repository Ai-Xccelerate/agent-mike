# AIX Theme

The reusable UI/UX component library and design system for **AI Xccelerate**
(AIX) — built on Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4.

This is **not a demo app**. It's the production design system + a catalog of
~90 reference pages and 24+ generic primitives, all carrying stable reference
IDs so humans and AI agents can point at any element unambiguously and lift
components into any AIX product.

## Quick start

```bash
npm install
npm run dev -- -p 4000   # http://localhost:4000
```

`npm run build` (production) and `npx tsc --noEmit` (typecheck) must always be green.

## How to reference anything (humans & AI agents)

Every page, block, frame region, and primitive has a stable ID:

| Pattern | Meaning | Example |
|---|---|---|
| `AIX-###` | a page | `AIX-311` = Data Tables (`/data-tables`) |
| `AIX-###.N` | Nth block on that page | `AIX-311.1` = the deployments table |
| `AIX-F#` | frame region | `AIX-F1` = sidebar, `AIX-F2` = topbar |
| `LIB-*` | reusable primitive | `LIB-STATCARD` = KPI card |

- **See IDs on screen:** click the floating **AIX-ID** button (bottom-left in
  the running app) — every element shows its ID badge.
- **In the DOM:** IDs are `data-aix-id` attributes.
- **Machine-readable:** `aix-manifest.json` maps every ID → title, route, file,
  block descriptions, and natural-language keywords. AI agents: parse this file
  to resolve requests like "the pagination on the data tables page" to exact
  files.

## The documentation set

| File | Purpose |
|---|---|
| [`AIX-DESIGN-SYSTEM.md`](./AIX-DESIGN-SYSTEM.md) | Canonical design language: color, agent identity colors, typography, shape, motion, voice |
| [`AIX-REFERENCE.md`](./AIX-REFERENCE.md) | ID scheme + master index of all pages + primitive catalog |
| [`aix-manifest.json`](./aix-manifest.json) | Machine-readable index for tooling/agents |
| [`CLAUDE.md`](./CLAUDE.md) | Instructions auto-loaded by AI coding agents |
| [`.aix-build-spec.md`](./.aix-build-spec.md) | Conventions for building new pages/components |
| `/design-system` (in-app) | Live visual version of the design system |
| `/reference` (in-app) | Live index of every page with IDs |

## Design language in one paragraph

Calm confidence: quiet neutral surfaces, hairline borders, **one orange moment
per view** (`#F47920`), Open Sans, 2px control corners (one token:
`--radius-lg`), 16px card corners, shadows only on the primary CTA, 150ms
color-only motion, sentence case, no emoji. Six AI agents with locked identity
colors (Nick orange, Jules blue, Pepper emerald, Tony purple, Joy amber,
George slate) via `AgentAvatar`/`AGENT_META`.

## Structure

```
src/
├── app/(admin)/            admin pages: (dashboards) (apps) (ecommerce) (ai)
│                           (others-pages) (ui-elements)
├── app/(full-width-pages)/ auth + error/system pages
├── components/
│   ├── aix/                AIX-specific: AgentAvatar, StatCard, dashboards
│   ├── ui/                 generic primitives (LIB-*)
│   ├── tables/ charts/ form/ apps/ ai/ ecommerce-pages/ docs/
│   └── common/             PageBreadcrumb, ComponentCard, ReferenceOverlayToggle
├── layout/                 AppSidebar (F1), AppHeader (F2), SidebarWidget (F5)
├── context/  hooks/  icons/
```

## Adding a page (checklist)

1. Pick the next ID in the right range (see `AIX-REFERENCE.md` §2).
2. Server `page.tsx` with metadata + `PageBreadcrumb` + `data-aix-id` stamps;
   interactivity in `"use client"` components.
3. Reuse `LIB-*` primitives; follow `AIX-DESIGN-SYSTEM.md`.
4. Register: sidebar nav (`src/layout/AppSidebar.tsx`), `AIX-REFERENCE.md`
   index, `aix-manifest.json`.
5. `npx tsc --noEmit` clean + visual check in both themes.
