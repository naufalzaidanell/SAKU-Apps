import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {verifiedPoolConfig, verifiedSsl} from '../db-config.mjs';
import {loadPinnedDataset} from '../seed-data.mjs';
import {
  boundedInteger,
  createTokenBucket,
  mayReadAllOutlets,
  principalFromValidatedContext,
  publicError,
  requireOnboardingAdmin,
  resolveCoreOrigin,
} from '../security.mjs';

test('database TLS always verifies the server certificate', () => {
  assert.deepEqual(verifiedSsl(), {rejectUnauthorized: true});
  const config=verifiedPoolConfig('postgres://user:pass@db.example/saku?sslmode=require',{max:2,statementTimeout:2500});
  assert.equal(config.ssl.rejectUnauthorized,true);
  assert.equal(new URL(config.connectionString).searchParams.has('sslmode'),false);
});

test('database CA input must be a PEM certificate', () => {
  assert.throws(()=>verifiedSsl(Buffer.from('not a certificate').toString('base64')),/DATABASE_CA_CERT_INVALID/);
});

test('core origin is exact and environment-bound', () => {
  assert.equal(resolveCoreOrigin('https://saku-backend-uat-production.up.railway.app/','uat'),'https://saku-backend-uat-production.up.railway.app');
  assert.throws(()=>resolveCoreOrigin('https://attacker.example','uat'),/CORE_API_ORIGIN_NOT_APPROVED/);
  assert.throws(()=>resolveCoreOrigin('https://saku-backend-uat-production.up.railway.app','production'),/CORE_API_ORIGIN_NOT_APPROVED/);
});

test('onboarding mutation is owner/admin or permission only', () => {
  const owner=principalFromValidatedContext(
    {id:'m1'},
    {sub:'u1',roleId:'r-owner',role:'CASHIER'},
    {id:'u1',roleId:'r-owner',role_name:'OWNER',isActive:true},
  );
  assert.equal(requireOnboardingAdmin(owner),owner);
  const staff=principalFromValidatedContext(
    {id:'m1'},
    {sub:'u2',roleId:'r-cashier',role:'OWNER'},
    {id:'u2',roleId:'r-cashier',role_name:'CASHIER',isActive:true},
  );
  assert.throws(()=>requireOnboardingAdmin(staff),/ONBOARDING_FORBIDDEN/);
  assert.throws(()=>principalFromValidatedContext(
    {id:'m1'},
    {sub:'u2',roleId:'r-owner'},
    {id:'u2',roleId:'r-cashier',role_name:'OWNER',isActive:true},
  ),/UNAUTHORIZED/);
});

test('outlet-wide analytics is fail-closed for unmapped staff', () => {
  assert.equal(mayReadAllOutlets({role:'OWNER',permissions:new Set()}),true);
  assert.equal(mayReadAllOutlets({role:'CASHIER',permissions:new Set()}),false);
  assert.equal(mayReadAllOutlets({role:'CASHIER',permissions:new Set(['analytics:all_outlets'])}),true);
});

test('public limit parser rejects NaN and unsafe integers', () => {
  assert.equal(boundedInteger('NaN',24,1,50),24);
  assert.equal(boundedInteger('999',24,1,50),50);
  assert.equal(boundedInteger('12',24,1,50),12);
});

test('unexpected errors are never returned to clients', () => {
  assert.deepEqual(publicError(Object.assign(new Error('password authentication failed for user'),{status:500})),{status:500,code:'REQUEST_FAILED'});
  assert.deepEqual(publicError(Object.assign(new Error('RATE_LIMITED'),{status:429})),{status:429,code:'RATE_LIMITED'});
});

test('token bucket limits bursts and refills deterministically', () => {
  let now=0;
  const bucket=createTokenBucket({capacity:2,refillPerSecond:1,now:()=>now});
  assert.equal(bucket.consume('client'),true);
  assert.equal(bucket.consume('client'),true);
  assert.equal(bucket.consume('client'),false);
  now=1000;
  assert.equal(bucket.consume('client'),true);
});

test('KBLI data is local, pinned, and complete', async () => {
  const dataset=await loadPinnedDataset();
  assert.equal(dataset.entries.length,1559);
  assert.equal(dataset.entries[0].code,'01111');
  assert.equal(dataset.entries.at(-1).code,'99000');
});

test('runtime start does not execute a mutating seed', async () => {
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.scripts.start,'node server.mjs');
  const seed=await readFile(new URL('../seed.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(seed,/INSERT INTO|UPDATE reference_kbli/);
  const sales=await readFile(new URL('../sales.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(sales,/NOT EXISTS \(SELECT 1 FROM user_outlets/);
});

test('gateway proxies only API routes with bounded bodies and an exact core origin', async () => {
  const source=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(source,/!url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(source,/isInlineMedia\?9\*1024\*1024:262144/);
  assert.match(source,/CORE\+url\.pathname\+url\.search/);
  assert.match(source,/\['authorization','content-type','x-admin-session','last-event-id'\]/);
  assert.doesNotMatch(source,/headers:\s*req\.headers/);
});
