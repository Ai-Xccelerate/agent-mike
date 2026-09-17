# Agent instructions

Follow **`CLAUDE.md`** in this repo. Same rules for Cursor, Claude Code, and any other coding agent.

## Density and chrome width (do not regress)

Compact and Comfortable scale `--spacing` (`html[data-density]` in `globals.css`). That shrinks every Tailwind spacing-scale size: `w-56`, `p-6`, `h-11`, `px-3`, …

- **Do** let padding, gaps, and control heights follow density.
- **Do not** size a nav or sidebar column with `w-48` / `w-52` / `w-56` / `w-60`. Compact turns `w-56` (~224px) into ~168px and `truncate` ellipsizes labels (“Agent config…”, “User manage…”).
- **Do** lock those columns in px, same pattern as the app sidebar: `w-[240px]`, settings aside `lg:w-[224px]`.
- After layout width changes, check Default, Comfortable, **and Compact**. Every settings nav label must stay fully readable.

## Copy voice (do not regress)

- **Do not** write an em dash (—) in any product copy: headings, `description=` props, placeholders, labels, toast/notice/error strings, empty states. Split into two short sentences (`"Could not save. Check the API."`) or use a colon for a label:value pair (`"Connected: 5 items"`).
- Em dashes in code comments (`//`, `/** */`) are fine — this rule is about product-facing text only.
- **Do not** use generic AI-sounding filler: "seamlessly", "leverage", "empower", "unlock", "effortlessly", "cutting-edge", "streamline", "dive into", "harness the power of".
- Keep descriptions short: one sentence where possible, two at most.
- **Do not** leak internal ticket/spec IDs like `(R16)` into headings or descriptions — that belongs in a code comment, not product copy.
