import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

test('repository declares the locked package manager and strict TypeScript', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as Record<string, unknown>;
  assert.equal(pkg.name, 'gmn-menu');
  assert.equal(pkg.packageManager, 'pnpm@10.15.0');
  const tsconfig = JSON.parse(readFileSync(resolve(root, 'tsconfig.json'), 'utf8')) as { compilerOptions: Record<string, unknown> };
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(tsconfig.compilerOptions.exactOptionalPropertyTypes, true);
});

test('agent contract, admin design tokens and bootstrap CI exist', () => {
  assert.equal(existsSync(resolve(root, 'AGENTS.md')), true);
  assert.equal(existsSync(resolve(root, 'src/styles/gmn-admin-tokens.css')), true);
  const ciPath = resolve(root, '.github/workflows/ci.yml');
  assert.equal(existsSync(ciPath), true);
  const ci = readFileSync(ciPath, 'utf8');
  assert.match(ci, /verify:bootstrap/);
});


test('Next app has dependency-backed full typecheck/build verification in CI', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts?: Record<string,string> };
  for (const name of ['typecheck','build','verify']) assert.equal(typeof pkg.scripts?.[name], 'string', `missing ${name}`);
  const tsconfig = JSON.parse(readFileSync(resolve(root, 'tsconfig.json'), 'utf8')) as { compilerOptions: Record<string,unknown>; include?: string[] };
  assert.equal(tsconfig.compilerOptions.moduleResolution, 'Bundler');
  assert.equal(tsconfig.compilerOptions.jsx, 'preserve');
  assert.ok(tsconfig.include?.some((value) => value.includes('**/*.tsx')), 'tsx must be typechecked');
  const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /verify:bootstrap/);
  assert.match(ci, /pnpm install/);
  assert.match(ci, /pnpm verify/);
});

test('product SQL is a domain contract; shared Supabase migrations are applied only from gmn-core', () => {
  assert.equal(existsSync(resolve(root, 'database/contracts')), true);
  assert.equal(existsSync(resolve(root, 'supabase/migrations')), false);
});
