import Link from 'next/link';
import { requireMenuAccess } from '../../../../lib/core/require-menu-access';
import {
  addCategory, addItem, deleteCategory, deleteItem, publishMenuFromForm, updateCategoryFromForm, updateItemFromForm,
  updateMenuProfile, uploadAndSetBrandImage,
} from '../../../../modules/admin/actions';
import { uploadMenuPhotosAction } from '../../../../modules/menu/upload-menu-photos';

function price(cents: number | null) { return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ','); }

export default async function MenuAdmin({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const { db, user, supabase } = await requireMenuAccess(unitId, 'menu:view', 'MENU');
  const { data: deliveryEnabled, error: deliveryAccessError } = await supabase.schema('security').rpc('has_product_access', { p_user_id: user.id, p_unit_id: unitId, p_product_code: 'WHATSAPP_DELIVERY', p_permission: 'delivery:manage' });
  if (deliveryAccessError) throw deliveryAccessError;
  const { data: menu, error: menuError } = await db.schema('menus').from('menus').select('*').eq('unit_id', unitId).single();
  if (menuError || !menu) throw menuError ?? new Error('MENU_NOT_FOUND');
  const [{ data: categories }, { data: batches }] = await Promise.all([
    db.schema('menus').from('categories').select('*,items(*)').eq('menu_id', menu.id).order('position'),
    db.schema('menus').from('source_batches').select('id,status,error_message,created_at').eq('menu_id', menu.id).order('created_at', { ascending: false }).limit(8),
  ]);
  const orderedCategories = [...(categories ?? [])].sort((a:any,b:any)=>a.position-b.position);
  return <main className="admin-shell">
    <header className="admin-header"><div><small>Cardápio digital</small><h1>{menu.name}</h1><p>Edite o rascunho e publique quando quiser. O cardápio público continua na última versão publicada.</p></div><nav className="admin-nav"><Link href={`/menus/${unitId}/versions`}>Versões</Link>{deliveryEnabled ? <Link href={`/menus/${unitId}/delivery`}>Delivery</Link> : <span className="locked-upsell" title="Upsell ainda não contratado">Delivery 🔒</span>}<a href={`${(process.env.NEXT_PUBLIC_CARDAPIO_URL ?? process.env.NEXT_PUBLIC_MENU_PUBLIC_URL ?? '').replace(/\/$/,'')}/${menu.slug}`} target="_blank" rel="noreferrer">Ver público</a></nav></header>

    <section className="admin-card"><h2>Criar ou reprocessar a partir de fotos</h2><p>Envie novas fotos do cardápio físico. A IA extrai seções, itens, descrições e preços; a publicação anterior continua recuperável no histórico.</p><form action={uploadMenuPhotosAction.bind(null, menu.id)}><input type="file" name="files" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple required/><button>Extrair cardápio</button></form>{(batches ?? []).map((batch:any)=><p key={batch.id}><b>{batch.status}</b> — {new Date(batch.created_at).toLocaleString('pt-BR')} {batch.error_message ? `— ${batch.error_message}` : ''}</p>)}</section>

    <section className="admin-card"><h2>Restaurante</h2><form action={updateMenuProfile.bind(null, unitId)} className="admin-grid"><label>Nome<input name="name" defaultValue={menu.name}/></label><label>Telefone<input name="phone" defaultValue={(menu as any).phone ?? ''}/></label><label>WhatsApp<input name="whatsapp" defaultValue={(menu as any).whatsapp ?? ''}/></label><label>Endereço<input name="address" defaultValue={(menu as any).address ?? ''}/></label><label className="span-2">Descrição<textarea name="description" defaultValue={(menu as any).description ?? ''}/></label><button>Salvar dados</button></form><div className="admin-grid brand-assets"><form action={uploadAndSetBrandImage.bind(null, unitId, 'cover')}>{(menu as any).cover_image_url ? <img className="admin-image-preview cover-preview" src={(menu as any).cover_image_url} alt="Capa atual"/> : null}<label>Capa<input type="file" name="file" accept="image/jpeg,image/png,image/webp" required/></label><button>Trocar capa</button></form><form action={uploadAndSetBrandImage.bind(null, unitId, 'logo')}>{(menu as any).logo_image_url ? <img className="admin-image-preview logo-preview" src={(menu as any).logo_image_url} alt="Foto ou logo atual"/> : null}<label>Foto/logo<input type="file" name="file" accept="image/jpeg,image/png,image/webp" required/></label><button>Trocar foto/logo</button></form></div></section>

    <section className="admin-card"><h2>Seções e itens</h2><p>Altere nome, descrição, ordem, seção, preço, foto e disponibilidade. As mudanças só substituem o cardápio público quando você publicar.</p><form action={addCategory.bind(null, unitId)} className="inline-form"><input name="name" placeholder="Nova seção" required/><input name="description" placeholder="Descrição da seção"/><button>Adicionar seção</button></form>
      {orderedCategories.map((category:any)=><article className="menu-category" key={category.id}>
        <form action={updateCategoryFromForm.bind(null, unitId, category.id)} className="admin-grid"><label>Seção<input name="name" defaultValue={category.name}/></label><label>Ordem<input name="position" type="number" defaultValue={category.position}/></label><label className="span-2">Descrição<input name="description" defaultValue={category.description}/></label><label><input type="checkbox" name="active" defaultChecked={category.active}/> Visível</label><button>Salvar seção</button></form>
        <form action={deleteCategory.bind(null, unitId, category.id)}><button className="danger">Excluir seção e itens</button></form>
        <div className="menu-items">{(category.items ?? []).sort((a:any,b:any)=>a.position-b.position).map((item:any)=><form key={item.id} action={updateItemFromForm.bind(null, unitId, item.id)} className="menu-item-editor">
          {item.image_url ? <img className="admin-image-preview item-preview" src={item.image_url} alt={`Foto atual de ${item.title}`}/> : null}
          <label>Título<input name="title" defaultValue={item.title}/></label>
          <label>Descrição<input name="description" defaultValue={item.description} placeholder="Descrição"/></label>
          <label>Preço<input name="price" defaultValue={price(item.price_cents)} inputMode="decimal" placeholder="0,00"/></label>
          <label>Seção<select name="categoryId" defaultValue={item.category_id}>{orderedCategories.map((option:any)=><option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
          <label>Ordem<input name="position" type="number" defaultValue={item.position}/></label>
          <label><input type="checkbox" name="available" defaultChecked={item.available}/> Disponível</label>
          <label>Nova foto<input name="image" type="file" accept="image/jpeg,image/png,image/webp"/></label>
          {item.image_url ? <label><input type="checkbox" name="clearImage"/> Remover foto atual</label> : null}
          <div className="item-actions"><button>Salvar item</button><button formAction={deleteItem.bind(null, unitId, item.id)} className="danger">Excluir</button></div>
        </form>)}</div>
        <form action={addItem.bind(null, unitId)} className="inline-form"><input type="hidden" name="categoryId" value={category.id}/><input name="title" placeholder="Novo item" required/><input name="description" placeholder="Descrição"/><input name="price" placeholder="Preço" inputMode="decimal"/><button>Adicionar item</button></form>
      </article>)}
    </section>
    <form action={publishMenuFromForm.bind(null, unitId)}><button className="primary-action">Publicar alterações</button></form>
  </main>;
}
