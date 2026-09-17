# Bug: client-side navigation sometimes needed two clicks

## Symptom

Clicking a sidebar or Settings sub-nav link would sometimes update the
browser's URL to the destination route, but the page content stayed on the
previous page — the Settings sub-nav still highlighted the old tab, and the
old page's content kept rendering. A second click on the same link usually
"fixed" it.

First observed on `Settings > Skills` (URL went to `/settings/skills`, content
stayed on `Knowledge base`), but the underlying bug affected every
client-side navigation in the app, not just Settings.

## Investigation

1. Reproduced live against the deployed staging site with Playwright,
   capturing `console`/`pageerror` events. Every navigation logged:

   ```
   TypeError: Cannot read properties of null (reading 'removeChild')
       at commitDeletionEffectsOnFiber (react-dom internals)
   ```

2. Reproduced the same error locally in dev mode — not staging-specific.

3. Bisected across every settings-page pair (Knowledge↔Skills, Role↔Identity,
   etc.) and the primary sidebar (Overview↔Assistant↔Inbox): **every single
   client-side transition** threw the same error, including a link click to
   the *same* page the user was already on. That last case also left
   `document.title` blank afterward — a strong clue that a head element
   (`<title>`/`<link>`) was involved, not anything specific to Settings.

4. To rule out a framework-level bug, built an isolated minimal Next.js
   16.3.4 / React 19.2 app (three routes, different `metadata.title` each)
   with none of this app's other code. It navigated cleanly with zero
   errors — so this is not a Next.js/React bug in the version we're on.

5. Since the crash was universal (every route, including a same-page
   no-op click) but absent in the minimal repro, the culprit had to be
   something mounted on literally every page. Grepped for raw DOM
   manipulation (`document.head`, `appendChild`, `removeChild`,
   `querySelectorAll`) across the app and found it in
   `src/context/WorkerIdentityContext.tsx`, which wraps the entire admin
   layout.

## Root cause

`WorkerIdentityContext` sets the browser tab's favicon dynamically (the
worker's uploaded avatar, falling back to the app's default `icon.svg`). To
force browsers to actually repaint the tab icon (mutating an existing
`<link>`'s `href` isn't enough — several browsers cache the icon against the
element itself), it did:

```ts
document.querySelectorAll('link[rel="icon"]').forEach((link) => link.remove());
hrefs.forEach((href) => {
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = href;
  document.head.appendChild(link);
});
```

`querySelectorAll('link[rel="icon"]')` also matches Next.js's own default
`<link rel="icon">` (rendered from `app/icon.svg`), which Next/React track
as a "hoistable" element in the fiber tree. Deleting it via a raw DOM API
instead of through React desyncs React's internal reference to that node.
From that point on, *every* client-side navigation that tried to reconcile
this head element hit a `null` parent and crashed with `removeChild`.

This is a known class of bug (see
[vercel/next.js discussion #52625](https://github.com/vercel/next.js/discussions/52625),
which describes the identical failure mode caused by third-party scripts
like Intercom mutating React-tracked head elements) — except here the
"third party" was our own effect, not an external script.

## Fix

Track only the single `<link>` element this effect itself creates (via a
`ref`), and remove/recreate just that one on profile change. Never touch
Next's own default icon tag — it doesn't need to be removed at all, since
browsers prefer the most recently inserted `<link rel="icon">`, and ours is
always appended after Next's.

Changed in `src/context/WorkerIdentityContext.tsx`
(commit `4a7270c`, PR [#19](https://github.com/Ai-Xccelerate/AI-worker-frontend/pull/19)).

## Verification

- Re-ran every previously-crashing transition (Knowledge↔Skills, same-page
  click, Overview→Assistant→Inbox, Role↔Identity) via Playwright: 0 errors,
  titles updated correctly every time (including the same-page click, which
  previously blanked the title).
- Stress test: 16 rapid sequential clicks across every Settings tab plus the
  primary nav: 0 errors.
- `npx tsc --noEmit` and `npx next build` both clean.
