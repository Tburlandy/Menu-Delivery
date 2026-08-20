import { redirect } from 'next/navigation';
type Params = { unitId?: string | string[] };
function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
export default async function DeliveryAdminEntry({ searchParams }: { searchParams: Promise<Params> }) {
  const unitId = one((await searchParams).unitId);
  if (unitId) redirect(`/menus/${encodeURIComponent(unitId)}/delivery`);
  return <main><p>Abra Delivery WhatsApp pelo Portal GMN para selecionar uma unidade.</p></main>;
}
