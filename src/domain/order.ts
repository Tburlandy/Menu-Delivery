export interface OrderLineInput {
  unitPriceCents: number;
  quantity: number;
}

export type FulfillmentPricing =
  | { kind: 'PICKUP' }
  | { kind: 'DELIVERY'; feeCents: number };

export interface MoneyBreakdown {
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
}

export interface PersistedOrderLine extends OrderLineInput {
  title: string;
  note: string;
}

export interface PersistedOrder {
  id: string;
  customerName: string;
  fulfillment:
    | { kind: 'PICKUP' }
    | { kind: 'DELIVERY'; address: string; areaName: string; feeCents: number };
  paymentMethod: string;
  notes: string;
  lines: readonly PersistedOrderLine[];
}

function assertCents(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative integer number of cents`);
  }
}

function assertQuantity(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('quantity must be a positive integer');
  }
}

export function calculateOrderTotal(
  lines: readonly OrderLineInput[],
  fulfillment: FulfillmentPricing,
): MoneyBreakdown {
  let subtotalCents = 0;
  for (const line of lines) {
    assertCents(line.unitPriceCents, 'unitPriceCents');
    assertQuantity(line.quantity);
    const lineTotal = line.unitPriceCents * line.quantity;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(subtotalCents + lineTotal)) {
      throw new RangeError('order subtotal exceeds safe integer range');
    }
    subtotalCents += lineTotal;
  }

  const deliveryFeeCents = fulfillment.kind === 'DELIVERY' ? fulfillment.feeCents : 0;
  assertCents(deliveryFeeCents, 'deliveryFeeCents');
  const totalCents = subtotalCents + deliveryFeeCents;
  if (!Number.isSafeInteger(totalCents)) throw new RangeError('order total exceeds safe integer range');

  return { subtotalCents, deliveryFeeCents, totalCents };
}

function formatBRL(cents: number): string {
  assertCents(cents, 'money');
  const reais = Math.floor(cents / 100);
  const centavos = String(cents % 100).padStart(2, '0');
  return `R$ ${reais.toLocaleString('pt-BR')},${centavos}`;
}

export function formatWhatsAppOrder(order: PersistedOrder): string {
  const fulfillmentPricing: FulfillmentPricing = order.fulfillment.kind === 'DELIVERY'
    ? { kind: 'DELIVERY', feeCents: order.fulfillment.feeCents }
    : { kind: 'PICKUP' };
  const totals = calculateOrderTotal(order.lines, fulfillmentPricing);

  const sections: string[] = ['NOVO PEDIDO', ''];
  for (const line of order.lines) {
    sections.push(`${line.quantity}x ${line.title} — ${formatBRL(line.unitPriceCents)}`);
    if (line.note.trim()) sections.push(`  ${line.note.trim()}`);
  }

  sections.push('', `Subtotal: ${formatBRL(totals.subtotalCents)}`);
  sections.push(`Entrega: ${formatBRL(totals.deliveryFeeCents)}`);
  sections.push(`Total: ${formatBRL(totals.totalCents)}`, '');
  sections.push(`Cliente: ${order.customerName}`);

  if (order.fulfillment.kind === 'DELIVERY') {
    sections.push(`Endereço: ${order.fulfillment.address}`);
    sections.push(`Área: ${order.fulfillment.areaName}`);
  } else {
    sections.push('Retirada no local');
  }

  sections.push(`Pagamento: ${order.paymentMethod}`);
  if (order.notes.trim()) sections.push(`Observações: ${order.notes.trim()}`);

  return sections.join('\n');
}
