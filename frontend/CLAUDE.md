# AIX Theme — Agent Instructions

This repo is the **AIX Theme**: the reusable UI/UX component library and design
system for AI Xccelerate. It is NOT a demo app — every component is generic and
prop-driven, meant to be lifted into AIX apps, agents, and workforce products.

## Read these before changing anything

| File | What it gives you |
|---|---|
| `AIX-REFERENCE.md` | The reference-ID scheme + master index of all pages |
| `AIX-DESIGN-SYSTEM.md` | Canonical design language (color, type, shape, motion, voice) |
| `aix-manifest.json` | Machine-readable index: every page, route, block, primitive, with keywords — parse this to resolve natural language to elements |
| `.aix-build-spec.md` | Build conventions for new pages/components |

## How references work (the user speaks in these IDs)

- `AIX-311` = a page (Data Tables). Ranges encode area: 010–049 dashboards,
  050–099 e-commerce, 100–149 apps, 150–199 AI tools, 200–299 UI elements,
  300–349 forms/tables, 350–399 charts/maps, 400–449 misc, 450–499 auth,
  500–549 errors, 550–599 layouts.
- `AIX-311.2` = 2nd top-level block on that page.
- `AIX-F1..F5` = frame regions (sidebar, topbar, breadcrumb, content, sidebar CTA).
- `LIB-*` = reusable primitives (catalog in `AIX-REFERENCE.md` §4).
- IDs are stamped in the DOM as `data-aix-id`. The floating **AIX-ID** button
  (bottom-left in the app) toggles a visual overlay showing every ID.

**Resolving a request:** "change the pagination on the data tables page" →
look up keywords in `aix-manifest.json` → page `AIX-311`, route `/data-tables`,
file path in the manifest → pagination lives in `LIB-DATATABLE`
(`src/components/tables/DataTable/DataTableOne.tsx`).

## Hard rules

- **Brand:** orange `#F47920` only (`bg-brand-500`). One orange moment per view.
  Never introduce blue/indigo as accent. Agent identity colors are locked in
  `src/components/aix/AgentAvatar.tsx` (`AGENT_META`) / `bg-agent-*` tokens.
- **Radius (v2 — tight):** the whole Tailwind radius scale is retuned via tokens
  in `src/app/globals.css`. Controls (buttons/inputs/chips/menu items) use
  `rounded-lg` = **5px** (`--radius-lg`); cards use `rounded-2xl` = **8px**
  (`--radius-2xl`). The whole scale runs tight/crisp — sm 3 · md 4 · lg 5 ·
  xl 6 · 2xl 8 · 3xl 12px. Never hardcode radii or pill-shape controls (`rounded-full`
  is for avatars/dots/badges only). Move the whole system from the `--radius-*`
  tokens; do not add per-component radii.
- **Type (v2):** self-hosted **Inter** (UI/body, the `font-outfit` token + body
  default), **Geist** for display headings only (`font-display` — page titles /
  hero numerals), **JetBrains Mono** (`font-mono`). Never put the display face on
  labels, buttons, or data. Sentence case; tabular numerals in tables/KPIs.
- **Liquid glass (v2):** the app floats on one ambient gradient backdrop
  (`<LiquidBackdrop/>`, warm orange/rose/amber blobs — never cyan/violet).
  Glass (`glass-surface` / `glass-float` / `glass-popover`) is for **chrome
  only** (sidebar, header, modals, menus, tooltips). **Never** put glass on
  content cards — cards stay opaque (`bg-white dark:bg-white/[0.03]`) and flat
  (border + hover:border shift; shadows only on the primary CTA).
- **Server/client boundary:** `page.tsx` stays a server component (owns
  `metadata`); ALL interactivity (state, handlers, chart configs with render
  functions) lives in `"use client"` components. Never pass functions from a
  server page into a client component.
- **Every new page** gets: metadata title `"<Name> | AI Xccelerate"`,
  `PageBreadcrumb`, `data-aix-id` stamps (root + `.N` blocks), a nav entry in
  `src/layout/AppSidebar.tsx`, and rows in `AIX-REFERENCE.md` + `aix-manifest.json`.
- **Responsive + dark mode are non-negotiable:** fluid full-width, KPI grids
  1/2/4, wide content scrolls in its own `overflow-x-auto`, `dark:` variants on
  everything.
- Sentence case, no emoji in product UI, realistic AIX content (agents: Nick,
  Jules, Pepper, Tony, Joy, George), numbers with separators, friendly times.

## Commands

```bash
npm run dev          # dev server (use -p 4000; 3000/3001 usually taken)
npx tsc --noEmit     # typecheck — must stay clean
npm run build        # production build — must stay green
npm run lint
```

## Working style

- Reuse `LIB-*` primitives before writing new ones; if you create a genuinely
  reusable component, add it to the LIB catalog + manifest.
- Multiple parallel agents: each owns only its assigned files; `AppSidebar.tsx`,
  `globals.css`, layouts, and `package.json` are merged serially by the orchestrator.
- Verify visually (screenshot) after UI changes, not just by typecheck.
