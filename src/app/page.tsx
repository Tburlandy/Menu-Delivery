import { redirect } from 'next/navigation';
type Params = { unitId?: string | string[] };
function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
export default async function MenuHome({ searchParams }: { searchParams: Promise<Params> }) {
  const unitId = one((await searchParams).unitId);
  if (unitId) redirect(`/menus/${encodeURIComponent(unitId)}`);
  return <main><p>Abra Cardápio pelo Portal GMN para selecionar uma unidade.</p></main>;
}
