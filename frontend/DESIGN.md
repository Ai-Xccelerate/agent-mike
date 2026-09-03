# Design

Visual system for the **AIX Theme v2 — Liquid Glass**. The canonical source of
truth is `src/app/globals.css` (tokens); this document narrates it. When they
disagree, the CSS wins.

## Theme

Calm-confidence product UI. A single ambient gradient canvas underlies the whole
app; glass chrome floats on it; opaque data cards sit crisply above. Light and
dark are both first-class (toggle via `.dark` on `<html>`, no first-paint flash).
Physical scene: an operator at a desk, all day, in ambient office light, needing
to trust every number — so surfaces are quiet and legible, and the one warm
brand moment does the emotional work.

## Color

**Brand accent — AIX orange (the one accent).**
`--color-brand-500: #F47920` (hover `#E06B15`, tint `#FEF3E8`). Full ramp
`brand-25 … brand-950`. Used for the primary CTA, active nav, current selection,
the headline chart series — nowhere decorative. On light-orange tints use
`text-brand-700` (orange-on-orange-50 fails contrast).

**Neutrals — Untitled-UI gray ramp.** Page ink `gray-800 / white`, muted
`gray-500` (light) / `gray-400` (dark), borders `gray-200 / gray-800` (subtle)
and `gray-300 / gray-700` (interactive). Borders are hairline (1px) and never
carry color.

**Semantic.** success `#12B76A` · error `#F04438` · warning `#F79009` · info
`#0BA5EC`, each a 25–950 ramp. Status badges = light tint + `-700` text.

**Agent identity (locked, never improvise).** Nick `#F47920` · Jules `#3B82F6`
· Pepper `#10B981` · Tony `#7A5AF8` · Joy `#F79009` · George `#344054` · Sam
`#0EA5E9`. Via `AgentAvatar` / `AGENT_META` / `bg-agent-*`.

**Ambient backdrop (`LiquidBackdrop`).** A fixed, GPU-cheap layer: base
`#eef1f8` (light) / `#080c17` (dark) with three slow-drifting, 72px-blurred
blobs — a warm brand aurora of orange `#F47920`, soft rose `#FB7185`, amber
`#F59E0B`. Deliberately warm and low-alpha: it reads as intentional brand, not
the cyan/violet AI-gradient tell.

## Glass material (chrome only)

`.glass-surface` (sidebar, header, toolbars) — translucent pane + 20px blur +
saturate + specular rim. `.glass-float` (modals, command bars) — thicker tint,
28px blur, elevated shadow, brighter rim. `.glass-popover` (menus, dropdowns,
tooltips) — near-opaque so option lists stay readable. All degrade to solid
under `@supports not (backdrop-filter)` and `prefers-reduced-transparency`.
**Never** apply glass to content cards.

## Typography

Self-hosted, no CDN. **Inter** (variable) — UI, body, labels, data (default via
`font-outfit` / body). **Geist** — display headings only (`font-display`): page
titles, hero numerals. **JetBrains Mono** (`font-mono`) — code, keycaps,
reference IDs. Pairing is on a contrast axis (humanist Inter + geometric Geist);
labels/data never use the display face. Sentence case everywhere. Headings carry
`-0.02em` tracking; body uses Inter `cv11 ss01 tnum` features (tabular numerals).
KPI values `text-2xl md:text-3xl font-bold tracking-tight`.

## Shape & elevation

Radii run **tight** — the whole Tailwind scale is retuned one notch crisper via
tokens: controls (buttons/inputs/chips/menu items) `rounded-lg` = **6px**; cards
`rounded-2xl` = **12px**; avatars/dots/pills `rounded-full`. Move the system
from `--radius-*` tokens; never hardcode radii or pill-shape controls.

Cards are **flat**: `border + bg`, hover shifts the border (`hover:border-gray-300`)
— never lift or scale. Shadows exist only on the primary CTA (`--shadow-cta`,
orange-tinted) and floating glass. Gradients: at most one per page (a hero band),
plus the global ambient backdrop.

## Motion

150ms, `ease-out` (`--ease-out-expo` / `--ease-quiet`), **color/opacity only**.
No bounce, elastic, spring, or scale. Focus ring is always visible (orange).
Loading uses skeletons/spinners, not layout jank. Everything beyond color
transitions honors `prefers-reduced-motion`; the backdrop blobs stop drifting.

## Components

Prop-driven, generic `LIB-*` primitives (catalog in `AIX-REFERENCE.md` §4).
Every interactive component ships default / hover / focus-visible / active /
disabled — plus loading + error where relevant. One button vocabulary, one form
control vocabulary, one icon language (stroke icons in `src/icons`, ~1.5–2px, no
fill) across every screen. Empty states are invitations (icon + one sentence +
action), never "No data". Nested bordered cards are forbidden.

## Layout

Fluid full width (no max-width cap; `min-w-0` guard on the content column).
Mobile-first: KPI rows 1 → 2 → 4; two-pane app layouts stack below `lg`; wide
tables/boards scroll inside their own `overflow-x-auto` — the page body never
scrolls horizontally. Site-wide density (Default / Comfortable / Compact) scales
the root `--spacing` token via `data-density` on `<html>`. Air between blocks
`gap-4 md:gap-6`; card padding `p-5 md:p-6`.
