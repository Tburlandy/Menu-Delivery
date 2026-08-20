# WhatsApp Delivery operations

Delivery is a separate per-unit entitlement from Menu.

At checkout the server:

1. validates the public menu/delivery state;
2. reloads item prices from the current immutable publication;
3. validates delivery area/pickup and fee;
4. calculates subtotal, fee and total in integer cents;
5. persists the order using a stable submission key;
6. returns the persisted order used to format the WhatsApp handoff.

Retries with the same submission key return the same order instead of creating duplicates. Anonymous order endpoints use DB-backed rate limiting.
