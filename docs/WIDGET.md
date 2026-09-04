# Website widget (multi-tenant)

## Model

Public embeds are **org-scoped**, not shared across a Mike deploy.

| Piece | Role |
|---|---|
| Table `widget_sites` | One active `site_token` per Clerk `organization_id` |
| Embed URL | `/widget?site=<site_token>` |
| Header | Browser sends `x-mike-site-token: <site_token>` on `/api/v1/chat` and `/api/v1/transcribe` |
| Manager console | Clerk JWT `org_id` (unchanged) |

**Do not** use `MIKE_WIDGET_ORG_ID` as the multi-tenant source of truth. Optional env `MIKE_WIDGET_SITE_TOKEN` + `MIKE_WIDGET_ORG_ID` is a **legacy local/single-tenant fallback** only.

## Manager flow

1. Sign in to Mike with the target Clerk organization active.
2. Open **Chat** → **Website install** → **Copy embed snippet**.
3. API `GET /api/v1/widget-site` creates or returns that org’s row in `widget_sites`.
4. Clipboard contains an iframe whose `src` includes `?site=<token>`.

Another org that copies **their** snippet gets a **different** token. Their customers never land in your org’s conversations or knowledge.

## Customer / host-site flow

1. Host page includes the iframe (fixed bottom-right; transparent background).
2. `/widget` shows a floating Mike launcher; open panel uses `ChatPanel` in compact mode.
3. Requests carry `x-mike-site-token`; API resolves `organization_id` from `widget_sites`.
4. Conversations appear in that org’s **Inbox** (`channel: chat`).

Opening `/widget` **without** `?site=` shows a configuration error (not a shared default org).

## Example snippet

Produced by Copy embed (values filled for your org):

```html
<!-- Agent Mike website widget (bound to your organization) -->
<iframe
  src="https://YOUR-WEB-DOMAIN/widget?site=YOUR_SITE_TOKEN"
  title="Chat with Mike"
  allow="microphone"
  style="position:fixed;right:0;bottom:0;width:420px;height:720px;max-width:100vw;max-height:100vh;border:0;z-index:2147483646;background:transparent;color-scheme:light"
></iframe>
```

## Local testing

1. Run API + frontend; sign in (or local bypass with a real org id in the JWT path).
2. Copy embed from Chat, or call `GET /api/v1/widget-site` with a manager Bearer token.
3. Open the returned URL (include `?site=`).
4. Ask a question; confirm the thread in **Inbox** for that org.

## Related

- Auth: `lib/auth.ts` (`requireManagerOrWidget`)
- Persistence: `lib/widget-sites.ts`, migration `0002_widget_sites.sql`
- UI: `frontend/src/components/mike/WidgetShell.tsx`, Chat “Website install”
