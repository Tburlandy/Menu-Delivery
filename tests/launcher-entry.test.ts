import test from 'node:test';import assert from'node:assert/strict';import{existsSync,readFileSync}from'node:fs';import{resolve}from'node:path';
const root=process.cwd();const read=(p:string)=>readFileSync(resolve(root,p),'utf8');
test('menu root routes launcher unitId to unit admin',()=>{const p='src/app/page.tsx';assert.equal(existsSync(resolve(root,p)),true);const s=read(p);assert.match(s,/unitId/);assert.match(s,/redirect/);assert.match(s,/menus/);});
test('delivery admin root routes launcher unitId to delivery settings',()=>{const p='src/app/delivery/page.tsx';assert.equal(existsSync(resolve(root,p)),true);const s=read(p);assert.match(s,/unitId/);assert.match(s,/redirect/);assert.match(s,/delivery/);});
