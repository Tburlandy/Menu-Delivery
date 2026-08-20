import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const read=(p:string)=>readFileSync(resolve(root,p),'utf8');

test('root slug route maps cardapio and delivery hosts to their public experiences',()=>{
  const path='src/app/[slug]/page.tsx';
  assert.equal(existsSync(resolve(root,path)),true);
  const page=existsSync(resolve(root,path))?read(path):'';
  assert.match(page,/GMN_CARDAPIO_HOST/);
  assert.match(page,/GMN_DELIVERY_HOST/);
  assert.match(page,/PublicMenuView/);
  assert.match(page,/PublicDeliveryView/);
  assert.match(page,/notFound/);
});

test('legacy public paths reuse the same public view components',()=>{
  assert.match(read('src/app/cardapio/[slug]/page.tsx'),/PublicMenuView/);
  assert.match(read('src/app/delivery/[slug]/page.tsx'),/PublicDeliveryView/);
  const env=read('.env.example');
  assert.match(env,/GMN_CARDAPIO_HOST=cardapio\.example\.com/);
  assert.match(env,/GMN_DELIVERY_HOST=delivery\.example\.com/);
  const proxy=read('src/proxy.ts');
  assert.match(proxy,/GMN_CARDAPIO_HOST/);
  assert.match(proxy,/GMN_DELIVERY_HOST/);
  const menuAdmin=read('src/app/(authenticated)/menus/[unitId]/page.tsx');
  const deliveryAdmin=read('src/app/(authenticated)/menus/[unitId]/delivery/page.tsx');
  assert.match(menuAdmin,/NEXT_PUBLIC_CARDAPIO_URL/);
  assert.match(deliveryAdmin,/NEXT_PUBLIC_DELIVERY_URL/);
});
