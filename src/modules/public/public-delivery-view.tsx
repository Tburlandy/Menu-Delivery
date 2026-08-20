import { notFound } from 'next/navigation';
import { createPublicClient } from '../../lib/supabase/server';
import DeliveryClient from '../../app/delivery/[slug]/delivery-client';

export async function PublicDeliveryView({ slug }: { slug: string }) {
  const db = createPublicClient();
  const { data, error } = await db.schema('menus').rpc('get_public_menu', { p_slug: slug, p_require_delivery: true });
  if (error || !data) notFound();
  const payload = data as any;
  return <main style={{maxWidth:720,margin:'0 auto',padding:'24px 16px',fontFamily:'Inter,system-ui,sans-serif'}}><h1>{payload.snapshot?.profile?.name??'Delivery'}</h1><DeliveryClient slug={slug} snapshot={payload.snapshot} delivery={payload.delivery}/></main>;
}
