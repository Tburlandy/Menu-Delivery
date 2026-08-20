# GMN Menu Agent Contract

## Product invariants
- `MENU` and `WHATSAPP_DELIVERY` are separate per-unit entitlements in the same repo/domain.
- A valid AI menu extraction auto-publishes the first version; publication is immutable/versioned and reversible.
- Admin supports restaurant profile, cover/logo, category/item order, title, description, price, image and availability.
- Delivery has a separate public URL and remains blocked when its entitlement is inactive without blocking the menu.
- Delivery supports cart, quantities, notes, name, address, configured delivery area fee, pickup, payment method and authoritative totals.
- Persist the order before generating the WhatsApp handoff.
- Currency math uses integer cents and public checkout never trusts browser-supplied prices/totals.

## Shared database rule
- `gmn-core` is the only Supabase migration authority.
- `database/contracts/*.sql` is a product-domain mirror; never run Supabase migrations from this repo.
- Any SQL contract change must be copied into the next Core migration and pass the cross-repo byte-for-byte gate.

## Engineering
- TDD for behavior changes.
- RLS and server guards use the same Core product-access contract.
- Internal admin UI follows `src/styles/gmn-admin-tokens.css`; public menu is customer-themed/mobile-first.
- Verification: `npm run verify:bootstrap` offline; `pnpm verify` with dependencies.
