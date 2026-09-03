# AIX Design System — Theme Edition

One system: the canonical **AIX Core Design System**
(`~/Cursor/agent-sam/brand-assets/aix-design-system/`) unified with this
Next.js theme's implementation. The DS defines the language; this repo is the
production implementation. When they conflict, this document records the
decision.

Companion docs: `AIX-REFERENCE.md` (page/component IDs) ·
`.aix-build-spec.md` (build conventions for agents).

---

## 1. Identity

- **Brand:** AI Xccelerate (AIX) — AI revenue employees for mid-market B2B.
- **Personality:** calm confidence. "Your team's new hire", not "robotic AI tool".
- **The one rule:** single accent — orange. One orange moment per view (the
  primary action or key data point). Everything else greyscale + semantic.

## 2. Color

### Accent (brand)
| DS token | Value | Theme utility |
|---|---|---|
| `--accent-primary` | `#F47920` | `bg-brand-500` / `text-brand-500` |
| `--accent-primary-hover` | `#E06B15` | `bg-brand-600` |
| `--accent-secondary` | `#FF9F4A` | `bg-brand-400` (chart comparison `#FAB673`) |
| `--accent-light` | `#FEF3E8` | `bg-brand-50` |

Full brand scale: `brand-25 … brand-950` in `src/app/globals.css`.

### Agent identity colors (canonical — do not improvise)
| Agent | Token | Hex | Utility |
|---|---|---|---|
| Nick (demand gen) | `--color-agent-nick` | `#F47920` | `bg-agent-nick` |
| Jules (outbound) | `--color-agent-jules` | `#3B82F6` | `bg-agent-jules` |
| Pepper (inbound) | `--color-agent-pepper` | `#10B981` | `bg-agent-pepper` |
| Tony (technical) | `--color-agent-tony` | `#7A5AF8` | `bg-agent-tony` |
| Joy (deal ops) | `--color-agent-joy` | `#F79009` | `bg-agent-joy` |
| George (retention) | `--color-agent-george` | `#344054` | `bg-agent-george` |
| Sam (chief of staff) | `--color-agent-sam` | `#0EA5E9` | `bg-agent-sam` |

Nick/Jules/Pepper/Sam are from the DS spec; Tony/Joy/George are theme
extensions in the same register. Use via `AgentAvatar` + `AGENT_META`
(`src/components/aix/AgentAvatar.tsx`) — never hardcode.

### Surfaces, foreground, borders
DS vocabulary is bridged in `globals.css` (`--surface-*`, `--foreground-*`,
`--border-*`) and flips automatically with `.dark`.

| Role | Light | Dark | Theme utility |
|---|---|---|---|
| Page surface | `#F9FAFB` | `#101828` | `bg-gray-50` / `dark:bg-gray-900` |
| Card | `#FFFFFF` | `white/[0.03]` | card shell class |
| Text primary | `#101828` | `white/90` | `text-gray-800 dark:text-white/90` |
| Text muted | `#667085` | `#98A2B3` | `text-gray-500 dark:text-gray-400` |
| Border subtle | `#E4E7EC` | `#1D2939` | `border-gray-200 dark:border-gray-800` |
| Border interactive | `#D0D5DD` | `#344054` | `border-gray-300 dark:border-gray-700` |

> **Decision — surface temperature:** the DS README describes a warm off-white
> base (`#FAF9F5`) but its own token file (`colors_and_type.css`, the stated
> source of truth) specifies cool neutrals (`#FFFFFF`/`#F4F5F7`). The theme
> follows the token file: cool neutral surfaces. Revisit only as a deliberate
> rebrand.

### Semantic
success `#12B76A` · error `#F04438` · warning `#F79009` · info `#0BA5EC`
(full 25–950 scales in globals). Status badges use the light variant:
`bg-success-50 text-success-600`.

## 3. Typography

- **Inter** (variable, self-hosted) carries UI, body, labels and data — the
  `--font-outfit` token + body default. **Geist** is the display face
  (`font-display`), reserved for large headings / hero numerals; never on
  labels, buttons or data. **JetBrains Mono** (`font-mono`) for code, keycaps,
  reference IDs. Charts: `fontFamily: "Inter, sans-serif"`. Self-hosted from
  `public/fonts/` (no CDN, no layout shift).
- Pairing on a contrast axis (humanist Inter + geometric Geist). Headings/CTAs/
  active nav → 600–700; body → 400. Sentence case everywhere. Headings carry
  `-0.02em` tracking; body enables Inter tabular numerals (`tnum`).
- Card title `text-base font-semibold tracking-tight` · body `text-sm` ·
  caption/meta `text-xs text-gray-500 dark:text-gray-400` (never standalone
  `gray-400` on light — fails contrast) · KPI value `text-2xl md:text-3xl
  font-bold tracking-tight`.

## 4. Shape & elevation

- **Radii (v2 — tight):** the whole Tailwind radius scale is retuned via tokens
  in `globals.css`. Controls (buttons, inputs, chips, menu items) = **5px**
  (`--radius-lg`, `rounded-lg`). Cards = **8px** (`--radius-2xl`, `rounded-2xl`).
  Full scale: sm 3 · md 4 · lg 5 · xl 6 · 2xl 8 · 3xl 12px.
  Avatars/pills/dots = `rounded-full`. Move the whole system from the
  `--radius-*` tokens; never hardcode radii or pill-shape controls.
- **Liquid glass:** the app floats on one ambient gradient backdrop
  (`<LiquidBackdrop/>` — fixed, warm orange/rose/amber blobs over
  `--backdrop-base`, GPU-cheap, halts under reduced motion). Chrome refracts it
  via `glass-surface` (sidebar/header/toolbars), `glass-float` (modals) and
  `glass-popover` (menus/dropdowns/tooltips — near-opaque, readable). **Glass is
  chrome-only; content cards stay opaque.** Degrades to solid under
  `@supports not (backdrop-filter)` / `prefers-reduced-transparency`.
- **Density:** three site-wide levels — Default (1×), Comfortable (0.875×),
  Compact (0.75×) — picked from the header density dropdown, persisted in
  localStorage, applied as `data-density` on `<html>`. They scale Tailwind's
  root `--spacing` token in `globals.css`, so every spacing utility follows;
  never build per-page density switches.
- **Borders:** hairlines only (1px). Subtle for cards/dividers, default for
  inputs/interactive. Borders never carry color.
- **Shadows:** only on the primary CTA (`--shadow-cta`, orange-tinted). Cards
  never float — they sit on the surface via border + contrast. Card hover =
  border shift (`hover:border-gray-300`), never lift/scale.
- **Gradients:** the global ambient backdrop is the one sanctioned always-on
  gradient (it's the canvas, not a component). Beyond it, at most one gradient
  per page, on a hero/welcome band only (`from-brand-500 to-brand-400` or the DS
  `--gradient-welcome`). Never gradients on components, text, or borders.

## 5. Motion

- 150ms `ease-out`, color/background only. No bounce, no spring, no scale.
- Focus: visible always — orange focus ring (`--shadow-focus-ring`).
- Respect reduced motion for anything beyond color transitions.

## 6. Iconography

- In-app: the theme's stroke icon set (`src/icons/`) — 1.5–2px stroke, no
  fill, matching Lucide's language. Default `text-gray-500`, active
  `text-brand-500`.
- Outside this repo (mocks, slides): Lucide per the DS skill.
- **No emoji, no unicode glyphs as icons — ever.**

## 7. Voice & content

- Second person ("you", "your agents"); "we" only when AIX is the subject.
- Sentence case for buttons/labels/headings; Title Case only for proper nouns
  (AI Xccelerate, AIX Core, agent names).
- Buttons say exactly what happens: "Save changes", "Create invoice".
- Counts read naturally ("1,284", "2 min ago", "$49 / month"); deltas as
  colored pills (↑ green / ↓ red; inverted for cost/churn-type metrics).
- Empty states = invitation + action ("No agents yet — pick one to get
  started."). Errors say what happened and how to fix it; never vague, never
  apologetic theater.

## 8. Component mapping (DS → theme)

| DS component | Theme implementation | LIB ID |
|---|---|---|
| `PrimaryBtn` | `Button` variant="primary" | LIB-BUTTON |
| `SsoBtn` | `Button` variant="outline" | LIB-BUTTON |
| `Field` | `form/` Label + Input | — |
| `Badge` | `Badge` | LIB-BADGE |
| `Avatar` (agent) | `AgentAvatar` + `AGENT_META` | LIB-AGENTAVATAR |
| `AgentCard` | agent cards in `/workforce`, `/client-account` | — |
| `WelcomeCard` | `ClientWelcomeBand` | — |
| `NavItem` | `AppSidebar` menu-item utilities | AIX-F1 |
| `UserWidget` | `UserDropdown` | AIX-F2 |
| KPI stat | `StatCard` | LIB-STATCARD |

Full primitive catalog: `AIX-REFERENCE.md` §4.

## 9. Layout

- Fluid full width (no max-width cap; `min-w-0` guard on the content column).
- Mobile-first: KPI rows 1 → 2 → 4 columns; two-pane apps stack below `lg`;
  wide tables/boards scroll inside their own `overflow-x-auto` — the page
  never scrolls horizontally.
- Density with air: `gap-4 md:gap-6` between blocks, `p-5 md:p-6` in cards.
