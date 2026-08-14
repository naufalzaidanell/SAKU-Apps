import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const merchant = readFileSync(new URL('../apps/mobile-web/app.js', import.meta.url), 'utf8');
const merchantConfig = readFileSync(new URL('../apps/mobile-web/config.uat.js', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../apps/admin-web/admin.js', import.meta.url), 'utf8');
const adminConfig = readFileSync(new URL('../apps/admin-web/config.uat.js', import.meta.url), 'utf8');
const uatOrigin = 'https://saku-backend-live-production.up.railway.app';

test('merchant preserves the approved entry and provisioning journey', () => {
  const milestones = [
    'cinematicIntro(next)',
    'languageView()',
    'featureIntroView(0)',
    "authView('register')",
    "request('/api/onboarding/state')",
    "request('/api/onboarding/complete'",
    'provisioningView()',
  ];
  let cursor = -1;
  for (const milestone of milestones) {
    const next = merchant.indexOf(milestone, cursor + 1);
    assert.notEqual(next, -1, `missing journey milestone: ${milestone}`);
    cursor = next;
  }
  assert.match(merchant, /provisioningView[\s\S]+await loadAppData\(\);renderApp\(\);startEvents\(\)/);
  assert.doesNotMatch(merchant, /err\?\.status===404[^\n]+loadAppData/);
});

test('merchant keeps approved four-tab navigation and Top 3 carousel', () => {
  assert.match(merchant, /\[\['dashboard','Dashboard'\],\['cashier','Kasir'\],\['products','Produk'\],\['report','Laporan'\]\]/);
  assert.match(merchant, /topProductsIndex/);
  assert.match(merchant, /topByQuantity/);
  assert.match(merchant, /top-products-carousel/);
});

test('UAT clients cannot mix core and onboarding origins', () => {
  const merchantContext = { window: {} };
  const adminContext = { window: {} };
  vm.runInNewContext(merchantConfig, merchantContext);
  vm.runInNewContext(adminConfig, adminContext);
  assert.equal(merchantContext.window.__SAKU_CONFIG__.environment, 'uat');
  assert.equal(merchantContext.window.__SAKU_CONFIG__.apiBaseUrl, uatOrigin);
  assert.equal(merchantContext.window.__SAKU_CONFIG__.onboardingBaseUrl, uatOrigin);
  assert.equal(adminContext.window.__SAKU_ADMIN_CONFIG__.environment, 'uat');
  assert.equal(adminContext.window.__SAKU_ADMIN_CONFIG__.apiBaseUrl, uatOrigin);
  assert.match(merchant, /onboardingBaseUrl\|\|cfg\.apiBaseUrl/);
  assert.doesNotMatch(merchantConfig, /saku-backend-uat-production/);
});

test('automatic authentication replay is limited to safe methods', () => {
  assert.match(merchant, /\['GET','HEAD'\]\.includes\(method\)/);
  assert.match(merchant, /AUTH_REFRESHED_RETRY_REQUIRED/);
  assert.match(merchant, /savePendingRevocation/);
  assert.match(admin, /savePendingRevocation/);
});

test('network payloads and images are bounded before allocation', () => {
  assert.match(merchant, /readJsonBounded\(res,max=1024\*1024\)/);
  assert.match(admin, /readJsonBounded\(r,max=1024\*1024\)/);
  assert.match(merchant, /file\.size>6\*1024\*1024/);
  assert.match(merchant, /bmp\.width\*bmp\.height>80000000/);
});

test('admin session is accepted only with an approved administrative role', () => {
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'AUDITOR']) assert.match(admin, new RegExp(`'${role}'`));
  assert.match(admin, /if\(!validRole\(d\.admin\)\)throw new Error\('ADMIN_CONTEXT_REQUIRED'\)/);
  assert.match(admin, /\/api\/admin\/login/);
  assert.match(admin, /\/api\/admin\/refresh/);
});

test('admin governance surface retains required capabilities', () => {
  for (const endpoint of [
    '/api/admin/dashboard',
    '/api/admin/merchants?limit=200',
    '/status',
    '/revoke-sessions',
    '/api/admin/security?limit=150',
    '/api/admin/audit?limit=150',
    '/api/admin/settings',
    '/api/admin/announcements',
  ]) assert.ok(admin.includes(endpoint), `missing admin capability: ${endpoint}`);
});
