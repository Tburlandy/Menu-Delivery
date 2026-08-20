import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PublicDeliveryView } from '../../modules/public/public-delivery-view';
import { PublicMenuView } from '../../modules/public/public-menu-view';

function normalizeHost(value: string | null) { return (value ?? '').trim().toLowerCase().replace(/:\d+$/, ''); }

export default async function PublicHostRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const requestHeaders = await headers();
  const host = normalizeHost(requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host'));
  const menuHost = normalizeHost(process.env.GMN_CARDAPIO_HOST ?? null);
  const deliveryHost = normalizeHost(process.env.GMN_DELIVERY_HOST ?? null);
  if (menuHost && host === menuHost) return <PublicMenuView slug={slug} />;
  if (deliveryHost && host === deliveryHost) return <PublicDeliveryView slug={slug} />;
  notFound();
}
