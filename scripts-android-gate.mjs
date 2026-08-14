import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));

const toolPkg = JSON.parse(read('apps/package.json'));
const requiredCaps = {
  '@capacitor/android': '8.3.0',
  '@capacitor/core': '8.3.0',
  '@capacitor/cli': '8.3.0',
  '@capacitor/haptics': '8.0.2',
  '@capacitor/keyboard': '8.0.3',
};
for (const [name, version] of Object.entries(requiredCaps)) {
  if (toolPkg.dependencies?.[name] !== version) failures.push(`Android toolchain dependency mismatch: ${name}`);
}
if (!exists('apps/package-lock.json')) failures.push('Android shared package-lock missing');

for (const [app, pkg, webFile] of [['mobile-android','com.saku.umkm','app.js'], ['admin-android','com.saku.admin','admin.js']]) {
  const gradle = read(`apps/${app}/app/build.gradle`);
  const variables = read(`apps/${app}/variables.gradle`);
  const manifest = read(`apps/${app}/app/src/main/AndroidManifest.xml`);
  const network = read(`apps/${app}/app/src/main/res/xml/network_security_config.xml`);
  const config = read(`apps/${app}/app/src/main/assets/capacitor.config.json`);
  const web = read(`apps/${app}/app/src/main/assets/public/${webFile}`);
  const test = read(`apps/${app}/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java`);

  if (!gradle.includes(`applicationId "${pkg}"`)) failures.push(`${app}: applicationId mismatch`);
  if (!gradle.includes('versionName "1.0.0"')) failures.push(`${app}: versionName not production normalized`);
  if (!variables.includes('compileSdkVersion = 36') || !variables.includes('targetSdkVersion = 36')) failures.push(`${app}: API 36 gate missing`);
  if (!manifest.includes('android:usesCleartextTraffic="false"')) failures.push(`${app}: cleartext not disabled`);
  if (!manifest.includes('android:allowBackup="false"')) failures.push(`${app}: Android backup not disabled`);
  if (!network.includes('cleartextTrafficPermitted="false"')) failures.push(`${app}: network security cleartext not disabled`);
  if (!config.includes(`"appId": "${pkg}"`)) failures.push(`${app}: Capacitor appId mismatch`);
  if (!test.includes(`assertEquals("${pkg}", appContext.getPackageName())`)) failures.push(`${app}: instrumentation package assertion stale`);
  if (/localStorage\.(setItem|getItem)|localStorage\[/.test(web)) failures.push(`${app}: localStorage authority detected in production app.js`);
  if (/http:\/\//i.test(web)) failures.push(`${app}: cleartext API URL detected in production web asset`);
  if (exists(`apps/${app}/app/angkringan-key.jks`)) failures.push(`${app}: legacy keystore present`);
  if (/storePassword\s+["'][^"']+["']|keyPassword\s+["'][^"']+["']/.test(gradle)) failures.push(`${app}: hardcoded signing credential`);
  if (!gradle.includes('SAKU_KEYSTORE_FILE') || !gradle.includes('SAKU_KEYSTORE_PASSWORD') || !gradle.includes('SAKU_KEY_ALIAS') || !gradle.includes('SAKU_KEY_PASSWORD')) failures.push(`${app}: environment-driven release signing guard missing`);
  if (!gradle.includes('Production release signing environment is incomplete')) failures.push(`${app}: release signing does not fail closed`);
}

if (read('apps/mobile-web/app.js') !== read('apps/mobile-android/app/src/main/assets/public/app.js')) failures.push('Merchant Android app.js is not synchronized with audited mobile web source');
if (read('apps/mobile-web/app.css') !== read('apps/mobile-android/app/src/main/assets/public/app.css')) failures.push('Merchant Android app.css is not synchronized with audited mobile web source');
if (read('apps/admin-web/admin.js') !== read('apps/admin-android/app/src/main/assets/public/admin.js')) failures.push('Admin Android admin.js is not synchronized with audited admin web source');
if (read('apps/admin-web/admin.css') !== read('apps/admin-android/app/src/main/assets/public/admin.css')) failures.push('Admin Android admin.css is not synchronized with audited admin web source');

const merchantMain = read('apps/mobile-android/app/src/main/java/com/saku/umkm/MainActivity.java');
for (const plugin of ['GoogleSignInPlugin','SecureSessionPlugin','ReportExportPlugin','RuntimeConfigPlugin','AppearancePlugin']) {
  if (!merchantMain.includes(`registerPlugin(${plugin}.class)`)) failures.push(`Merchant native plugin not registered: ${plugin}`);
}
const googlePlugin = read('apps/mobile-android/app/src/main/java/com/saku/umkm/GoogleSignInPlugin.java');
if (!googlePlugin.includes('call.getString("nonce")') || !googlePlugin.includes('.setNonce(requestNonce)')) failures.push('Merchant Google native plugin is not bound to server-issued nonce');
if (googlePlugin.includes('randomUUID') || googlePlugin.includes('SecureRandom')) failures.push('Merchant Google plugin appears to generate its own nonce');

const adminMain = read('apps/admin-android/app/src/main/java/com/saku/admin/MainActivity.java');
for (const plugin of ['AdminSecureSessionPlugin','RuntimeConfigPlugin','AppearancePlugin']) {
  if (!adminMain.includes(`registerPlugin(${plugin}.class)`)) failures.push(`Admin native plugin not registered: ${plugin}`);
}

if (failures.length) {
  console.error('ANDROID_PRODUCTION_GATE_FAIL', failures);
  process.exit(1);
}
console.log('ANDROID_PRODUCTION_GATE_PASS');
