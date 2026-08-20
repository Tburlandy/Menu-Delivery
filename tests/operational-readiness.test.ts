import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
test('gmn-menu exposes health and real operating docs',()=>{
  assert.equal(existsSync(new URL('../src/app/api/health/route.ts',import.meta.url)),true);
  const health=read('src/app/api/health/route.ts');
  assert.match(health,/service:\s*['"]gmn-menu['"]/);
  assert.match(health,/const\s+status\s*=\s*missing\.length\s*\?\s*503\s*:\s*200/);
  assert.doesNotMatch(health,/SUPABASE_SERVICE_ROLE_KEY\s*:/);
  const readme=read('README.md');
  for(const section of ['## Architecture','## Local development','## Environment','## Deployment','## Verification']) assert.match(readme,new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
test('gmn-menu full CI includes lint',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.lint,'eslint .');
  assert.equal(pkg.devDependencies.eslint,'9.39.5');
  assert.equal(pkg.devDependencies['eslint-config-next'],'16.3.0');
  const ci=read('.github/workflows/ci.yml');
  assert.match(ci,/Lint, typecheck, test and production build/);
});
