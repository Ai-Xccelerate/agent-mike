# Product

## Register

product

## Users

Operators at mid-market B2B companies who run a team of AI revenue employees
(the six AIX agents — Nick, Jules, Pepper, Tony, Joy, George — plus Sam, the
chief of staff). They live in dashboards, inboxes, task boards, tables, and
settings all day: reviewing agent activity, triaging conversations, approving
deals, and tuning workflows. They are in a *task*, not browsing — the interface
must disappear into the work and never make them pause at a subtly-off control.

This repo is the **AIX Theme**: the reusable UI/UX component library + design
system those frontends are built from. Its "users" are therefore two audiences —
the operators above (end experience) and the engineers/AI agents who lift its
prop-driven primitives into AIX products (developer experience). Every element
carries a stable reference ID (`AIX-###`, `LIB-*`, `AIX-F#`) so humans and agents
can point at anything precisely.

## Product Purpose

Give every AIX AI-employee product one premium, trustworthy, instantly-familiar
look and feel — shipped as generic, prop-driven components rather than a demo
app. Success is: an operator trusts the surface the way they trust Linear or
Stripe; an engineer drops in a `LIB-*` primitive and it is already on-brand,
accessible, responsive, and correct in light and dark mode.

## Brand Personality

Calm confidence. "Your team's new hire," not "robotic AI tool." Quiet, precise,
premium. Three words: **calm, precise, premium.** Voice is second person
("you", "your agents"), sentence case, buttons that say exactly what happens
("Save changes", "Create invoice"). Warmth comes from one orange moment per
view over quiet neutral surfaces — never from decoration.

## Anti-references

Everything that reads "an AI generated this dashboard":

- Purple/violet gradients and cyan-on-dark backdrops (the #1 AI-UI tell).
- Glassmorphism sprayed on every card. AIX uses glass on *chrome only* (sidebar,
  header, modals, menus); content cards stay crisp and opaque.
- Cream / sand / beige body backgrounds; rainbow multi-series charts.
- Side-stripe accent borders on cards and alerts; gradient text.
- The hero-metric cliché, identical icon+heading+text card grids, tiny
  all-caps tracked eyebrows and `01 / 02 / 03` markers above every section.
- Bouncy/elastic/spring motion; hover lift-and-scale on cards.
- Light-gray body text "for elegance" that fails contrast.

## Design Principles

1. **One orange moment per view.** Orange (`#F47920`) marks the single primary
   action or key datum. Everything else is greyscale + semantic. If everything
   is orange, nothing is.
2. **Earned familiarity over novelty.** Standard affordances done impeccably.
   The tool disappears into the task; delight is saved for moments, not pages.
3. **Chrome is glass, content is crisp.** The app floats on one ambient gradient
   backdrop; standing/floating chrome refracts it; data surfaces stay opaque and
   maximally legible.
4. **Discipline, not decoration.** Hairline borders, flat cards, shadows only on
   the primary CTA, hierarchy through type + spacing. Premium is what you remove.
5. **Every state, every time.** Default, hover, focus-visible, active, disabled,
   loading, empty, error — a component that ships half of these is unfinished.

## Accessibility & Inclusion

WCAG 2.1 AA is the floor. Body text ≥ 4.5:1, large text ≥ 3:1 — muted text is
`gray-500` on light, never standalone `gray-400`. Full light + dark parity.
Keyboard focus is always visible (orange ring). `prefers-reduced-motion` halts
the ambient backdrop and non-color transitions; `prefers-reduced-transparency`
swaps glass for solid surfaces. Tabular numerals in data. Color is never the
only signal (status carries text + tint).
