import { notFound } from 'next/navigation';
import { createPublicClient } from '../../lib/supabase/server';

function money(cents: number | null | undefined) {
  return cents == null ? '' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export async function PublicMenuView({ slug }: { slug: string }) {
  const db = createPublicClient();
  const { data, error } = await db.schema('menus').rpc('get_public_menu', { p_slug: slug, p_require_delivery: false });
  if (error || !data) notFound();
  const snapshot = (data as any).snapshot;
  const profile = snapshot.profile ?? {};
  const categories = snapshot.categories ?? [];
  return <main style={{maxWidth:720,margin:'0 auto',padding:'0 16px 64px',fontFamily:'Inter,system-ui,sans-serif'}}>{profile.coverImageUrl&&<img src={profile.coverImageUrl} alt="Capa" style={{width:'100%',height:220,objectFit:'cover',borderRadius:'0 0 24px 24px'}}/>}<header style={{padding:'24px 0'}}>{profile.logoImageUrl&&<img src={profile.logoImageUrl} alt="Logo" width={72} height={72} style={{borderRadius:18,objectFit:'cover'}}/>}<h1>{profile.name}</h1>{profile.description&&<p>{profile.description}</p>}{profile.address&&<small>{profile.address}</small>}</header>{categories.map((category:any)=><section key={category.id} style={{marginTop:32}}><h2>{category.name}</h2>{category.description&&<p>{category.description}</p>}<div>{(category.items??[]).map((item:any)=><article key={item.id} style={{display:'grid',gridTemplateColumns:item.imageUrl?'1fr 96px':'1fr',gap:16,padding:'18px 0',borderBottom:'1px solid #e5e7eb',opacity:item.available?1:.55}}><div><strong>{item.title}</strong>{item.description&&<p style={{margin:'6px 0'}}>{item.description}</p>}<b>{money(item.priceCents)}</b>{!item.available&&<small style={{display:'block'}}>Indisponível</small>}</div>{item.imageUrl&&<img src={item.imageUrl} alt="" width={96} height={96} style={{borderRadius:14,objectFit:'cover'}}/>}</article>)}</div></section>)}</main>;
}
