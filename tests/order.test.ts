import test from 'node:test';
import assert from 'node:assert/strict';
const path = new URL('../src/domain/order.ts', import.meta.url);

test('delivery totals are calculated in integer cents', async () => {
  const { calculateOrderTotal } = await import(path.href);
  assert.deepEqual(calculateOrderTotal([
    { unitPriceCents: 2500, quantity: 2 },
    { unitPriceCents: 1200, quantity: 1 },
  ], { kind: 'DELIVERY', feeCents: 600 }), { subtotalCents: 6200, deliveryFeeCents: 600, totalCents: 6800 });
});

test('pickup has zero delivery fee even if callers try to provide none', async () => {
  const { calculateOrderTotal } = await import(path.href);
  assert.deepEqual(calculateOrderTotal([{ unitPriceCents: 1990, quantity: 1 }], { kind: 'PICKUP' }), { subtotalCents: 1990, deliveryFeeCents: 0, totalCents: 1990 });
});

test('invalid monetary inputs and quantities fail closed', async () => {
  const { calculateOrderTotal } = await import(path.href);
  assert.throws(() => calculateOrderTotal([{ unitPriceCents: -1, quantity: 1 }], { kind: 'PICKUP' }), RangeError);
  assert.throws(() => calculateOrderTotal([{ unitPriceCents: 100, quantity: 0 }], { kind: 'PICKUP' }), RangeError);
  assert.throws(() => calculateOrderTotal([{ unitPriceCents: 100.5, quantity: 1 }], { kind: 'PICKUP' }), RangeError);
});

test('WhatsApp formatter emits the required human-readable order summary', async () => {
  const { formatWhatsAppOrder } = await import(path.href);
  const message = formatWhatsAppOrder({
    id: 'pedido-123',
    customerName: 'João',
    fulfillment: { kind: 'DELIVERY', address: 'Rua X, 123', areaName: 'Icaraí', feeCents: 600 },
    paymentMethod: 'Pix',
    notes: 'Tocar 202',
    lines: [
      { title: 'X-Burger', quantity: 2, unitPriceCents: 2500, note: 'Sem cebola' },
      { title: 'Coca-Cola 2L', quantity: 1, unitPriceCents: 1200, note: '' },
    ],
  });
  for (const expected of ['NOVO PEDIDO', '2x X-Burger', 'Sem cebola', 'Subtotal: R$ 62,00', 'Entrega: R$ 6,00', 'Total: R$ 68,00', 'Cliente: João', 'Rua X, 123', 'Pagamento: Pix']) {
    assert.match(message, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
