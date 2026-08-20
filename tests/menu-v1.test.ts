import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=process.cwd(),read=(p:string)=>readFileSync(resolve(root,p),'utf8');

test('menu schema supports source batches, editable draft, immutable publications, delivery and fine permissions',()=>{
  const path='database/contracts/0007_menu_v1.sql';assert.equal(existsSync(resolve(root,path)),true);const s=read(path);
  for(const name of['source_batches','source_images','categories','items','publications','delivery_settings','delivery_areas','orders','order_lines','rate_limits'])assert.match(s,new RegExp(`menus\\.${name}`));
  assert.match(s,/menus\.versions/);assert.match(s,/snapshot\s+jsonb/i);assert.match(s,/menu:view/i);assert.match(s,/menu:edit/i);assert.match(s,/delivery:manage/i);assert.match(s,/enable row level security/i);
  assert.match(s,/menus_items_category_same_menu_fk/);assert.match(s,/menu_source_batches_runner_job_uidx/);
  assert.doesNotMatch(s,/values\('menu-source'/);assert.doesNotMatch(s,/values\('menu-public'/);
});

test('extracted menu validation rejects malformed structure and keeps price in integer cents',async()=>{const{validateExtractedMenu}=await import('../src/domain/extracted-menu.ts');assert.deepEqual(validateExtractedMenu({categories:[{name:'Lanches',items:[{title:'X Burger',description:'Bom',priceCents:2500,confidence:.9}]}]}),{categories:[{name:'Lanches',items:[{title:'X Burger',description:'Bom',priceCents:2500,confidence:.9}]}]});assert.throws(()=>validateExtractedMenu({categories:[]}),/category/i);assert.throws(()=>validateExtractedMenu({categories:[{name:'',items:[]}]}),/category/i);assert.throws(()=>validateExtractedMenu({categories:[{name:'X',items:[{title:'A',priceCents:10.5,confidence:1}]}]}),/price/i)});

test('photo upload is authenticated, private, then queues MENU_EXTRACT with signed remote inputs',()=>{const p='src/modules/menu/upload-menu-photos.ts';assert.equal(existsSync(resolve(root,p)),true);const a=read(p);assert.match(a,/requireMenuResourceAccess/);assert.match(a,/menu-source-images/);assert.match(a,/createSignedUrl/);assert.match(a,/MENU_EXTRACT/);assert.match(a,/remoteInputs/);assert.match(a,/12\s*\*\s*1024\s*\*\s*1024/);assert.match(a,/runner_job_id/)});

test('menu extraction callback finds batch by runner job, validates result and auto-publishes idempotently',()=>{const route='src/app/api/internal/jobs/callback/route.ts',handler='src/modules/menu/handle-job-callback.ts';for(const p of[route,handler])assert.equal(existsSync(resolve(root,p)),true);const s=read(handler);assert.match(s,/validateExtractedMenu/);assert.match(s,/runner_job_id/);assert.match(s,/accept_menu_extraction/);assert.match(s,/published_version_id/);assert.match(read(route),/GMN_INTERNAL_CALLBACK_SECRET/)});

test('menu admin edits profile, categories, items, images, availability/order and publishes versioned snapshots',()=>{const actions='src/modules/admin/actions.ts',page='src/app/(authenticated)/menus/[unitId]/page.tsx';for(const p of[actions,page])assert.equal(existsSync(resolve(root,p)),true);const a=read(actions);for(const term of['category','item','price','available','position','cover','logo','publish_menu_version'])assert.match(a,new RegExp(term,'i'));assert.match(a,/menu:edit/);assert.match(a,/menu:publish/);assert.match(read(page),/seção|item|Preço|Publicar/i)});

test('public cardapio reads immutable current publication and does not require delivery entitlement',()=>{const p='src/app/cardapio/[slug]/page.tsx',view='src/modules/public/public-menu-view.tsx';for(const x of[p,view])assert.equal(existsSync(resolve(root,x)),true);assert.match(read(p),/PublicMenuView/);const s=read(view);assert.match(s,/get_public_menu/);assert.match(s,/p_require_delivery:\s*false/);assert.match(s,/snapshot/)});

test('delivery RPC uses current publication prices, entitlements, atomic rate limit and serialized idempotency',()=>{const sql=read('database/contracts/0007_menu_v1.sql');assert.match(sql,/create_delivery_order/i);assert.match(sql,/current_publication_id/i);assert.match(sql,/jsonb_array_elements/i);assert.match(sql,/unit_price_cents/i);assert.match(sql,/WHATSAPP_DELIVERY/i);assert.match(sql,/submission_key/i);assert.match(sql,/on conflict/i);assert.match(sql,/rate_limits/i);assert.match(sql,/fingerprint_hash/i);assert.match(sql,/pg_advisory_xact_lock/);assert.doesNotMatch(sql,/grant\s+select\s+on\s+menus\.orders\s+to\s+anon/i)});

test('delivery endpoint persists through service RPC, formats order and never trusts browser prices',()=>{const route='src/app/api/public/delivery/[slug]/orders/route.ts';assert.equal(existsSync(resolve(root,route)),true);const s=read(route);assert.match(s,/createHmac/);assert.match(s,/create_delivery_order/);assert.match(s,/formatWhatsAppOrder/);assert.match(s,/wa\.me/);assert.match(s,/submissionKey/);const mapping=s.match(/const lines=(.*?);const db=/s)?.[1]??'';assert.match(mapping,/itemId/);assert.match(mapping,/quantity/);assert.match(mapping,/note/);assert.doesNotMatch(mapping,/unitPriceCents/)});

test('public delivery is separately entitled and supports cart/address/pickup/areas/payment/notes',()=>{const p='src/app/delivery/[slug]/page.tsx',view='src/modules/public/public-delivery-view.tsx',client='src/app/delivery/[slug]/delivery-client.tsx';for(const x of[p,view,client])assert.equal(existsSync(resolve(root,x)),true);assert.match(read(p),/PublicDeliveryView/);assert.match(read(view),/p_require_delivery:\s*true/);const c=read(client);for(const t of['cart','address','PICKUP','DELIVERY','payment','note','quantity'])assert.match(c,new RegExp(t,'i'))});

test('shared Supabase session and guard separate MENU permissions from delivery permissions',()=>{for(const p of['src/proxy.ts','src/lib/supabase/proxy.ts','src/lib/supabase/user-server.ts','src/lib/core/require-menu-access.ts'])assert.equal(existsSync(resolve(root,p)),true);const g=read('src/lib/core/require-menu-access.ts');assert.match(g,/MENU/);assert.match(g,/WHATSAPP_DELIVERY/);assert.match(g,/menu:view/);assert.match(g,/delivery:manage/);assert.match(g,/requireMenuResourceAccess/)});

test('platform team can create a pre-sale menu demo from photos and later reuse the same menu',()=>{for(const p of['src/app/(authenticated)/menus/new/page.tsx','src/app/(authenticated)/demos/[menuId]/page.tsx','src/modules/menu/create-demo-menu.ts'])assert.equal(existsSync(resolve(root,p)),true);const c=read('src/modules/menu/create-demo-menu.ts');assert.match(c,/requirePlatformAdmin/);assert.match(c,/createCoreProspect/);assert.match(c,/prospect_id/);assert.match(c,/uploadMenuPhotos/);assert.match(read('src/app/(authenticated)/demos/[menuId]/page.tsx'),/Demo pré-venda/);});

test('pre-sale prospect menu is publicly demonstrable but delivery stays locked until unit entitlements exist',()=>{const s=read('database/contracts/0007_menu_v1.sql');assert.match(s,/v_menu\.unit_id is null[^;]*v_menu\.prospect_id is null or p_require_delivery[^;]*return null/i);assert.match(s,/else if not menus\.has_entitlement\(v_menu\.unit_id,'MENU'\)/i);});

test('menu admin exposes complete item editing including moving groups and replacing/removing photos',()=>{
  const page=read('src/app/(authenticated)/menus/[unitId]/page.tsx');
  const actions=read('src/modules/admin/actions.ts');
  assert.match(page,/name="categoryId"/);
  assert.match(page,/Limpar foto|Remover foto/i);
  assert.match(page,/cover_image_url/);
  assert.match(page,/logo_image_url/);
  assert.match(page,/uploadMenuPhotosAction/);
  assert.match(actions,/const categoryId = String\(form\.get\('categoryId'\)/);
  assert.match(actions,/\{ categoryId \}/);
  assert.match(actions,/clearImage/);
  assert.match(actions,/imageUrl:\s*null/);
});

test('menu guards and RLS use central product access for MENU and WHATSAPP_DELIVERY',()=>{
  const guard=read('src/lib/core/require-menu-access.ts');const path='database/contracts/0008_product_access.sql';assert.equal(existsSync(resolve(root,path)),true);const sql=read(path);
  assert.match(guard,/has_product_access/);assert.match(guard,/is_platform_admin/);assert.doesNotMatch(guard,/schema\('core'\)|from\('entitlements'\)|platform_admins/);
  assert.match(sql,/has_product_access/);assert.match(sql,/'MENU'/);assert.match(sql,/'WHATSAPP_DELIVERY'/);assert.match(sql,/menu:view/);assert.match(sql,/delivery:manage/);
});
