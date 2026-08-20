# GMN Menu & WhatsApp Delivery

Digital menu product built for a pre-sale workflow: the team photographs a restaurant menu, AI extracts structured content, a public menu is created, and after the sale the same asset set becomes the customer's editable menu.

## Architecture

Menu owns restaurant/menu profile, source photo batches, categories/items, immutable publications, delivery configuration/areas and persisted orders. Core owns identity, entitlements, prospect lifecycle and the Runner. Photo extraction is a typed `MENU_EXTRACT` job; the callback validates the structured result before the first automatic publication.

`MENU` and `WHATSAPP_DELIVERY` are separate per-unit entitlements in the same repo. Prospect demos may expose the read-only menu before sale, but never Delivery.

Core is the only shared Supabase migration authority. SQL under `database/contracts/` is mirrored for domain tests/review only.

## Local development

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

Use the same Supabase project as Core and a configured Runner when testing real photo extraction.

## Environment

`.env.example` documents shared Supabase, Core queue URL/secret, product callback secret, public cardápio/delivery origins and abuse-control secret. Source images stay private; signed URLs are passed to the Runner and allowed only from configured exact hostnames on the Runner machine.

## Deployment

- Admin app → `menu.<domain>`.
- Public menu → `https://cardapio.<domain>/<slug>` (`GMN_CARDAPIO_HOST` / `NEXT_PUBLIC_CARDAPIO_URL`).
- Delivery → `https://delivery.<domain>/<slug>` (`GMN_DELIVERY_HOST` / `NEXT_PUBLIC_DELIVERY_URL`), gated independently by `WHATSAPP_DELIVERY`.
- A sold prospect is adopted by the unit without recreating categories/items/publication history.

At checkout, prices and delivery fees are reloaded/calculated server-side from the current immutable publication; browser totals are never trusted. The order is persisted before the WhatsApp handoff is returned.

## Verification

```bash
npm run verify:bootstrap
pnpm verify
```

The full gate includes lint, TypeScript and Next production build. The cross-repo gate also verifies job/callback/access/environment contracts and SQL parity with Core.
