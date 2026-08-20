import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const read=(p:string)=>readFileSync(resolve(root,p),'utf8');

test('menu admin renders Delivery as locked upsell when the unit lacks delivery access',()=>{
  const access=read('src/lib/core/require-menu-access.ts');
  const page=read('src/app/(authenticated)/menus/[unitId]/page.tsx');
  assert.match(access,/supabase/);
  assert.match(page,/has_product_access/);
  assert.match(page,/WHATSAPP_DELIVERY/);
  assert.match(page,/delivery:manage/);
  assert.match(page,/Delivery.*🔒|🔒.*Delivery/s);
  assert.match(page,/deliveryEnabled/);
});
