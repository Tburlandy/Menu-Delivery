import test from 'node:test';
import assert from 'node:assert/strict';
const moduleUrl = new URL('../src/domain/extracted-menu.ts', import.meta.url);

test('valid extracted menu normalizes titles descriptions and integer-cent prices', async () => {
  const { validateExtractedMenu } = await import(moduleUrl.href);
  const result = validateExtractedMenu({ categories:[{name:'  Pizzas  ',items:[{title:' Margherita ',description:'  molho  ',priceCents:4590,confidence:0.91}]}]});
  assert.deepEqual(result,{categories:[{name:'Pizzas',items:[{title:'Margherita',description:'molho',priceCents:4590,confidence:0.91}]}]});
});

test('invalid extraction fails closed instead of publishing malformed menu', async () => {
  const { validateExtractedMenu } = await import(moduleUrl.href);
  for (const input of [null,{}, {categories:[]}, {categories:[{name:'',items:[]}]}, {categories:[{name:'X',items:[{title:'Y',priceCents:12.5,confidence:2}]}]}]) {
    assert.throws(()=>validateExtractedMenu(input),/menu|categor|item|price|confidence/i);
  }
});
