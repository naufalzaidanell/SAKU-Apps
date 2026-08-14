import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import test from 'node:test';

const workflowDir=new URL('../.github/workflows/',import.meta.url);
const workflows=readdirSync(workflowDir).filter(name=>/\.ya?ml$/.test(name));

test('all third-party workflow actions are pinned to immutable commits',()=>{
  for(const name of workflows){
    const source=readFileSync(new URL(name,workflowDir),'utf8');
    for(const match of source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)){
      const use=match[1];
      if(use.startsWith('./'))continue;
      assert.match(use,/@[a-f0-9]{40}$/i,`${name}: mutable action reference ${use}`);
    }
  }
});

test('verification workflows cannot write repository contents',()=>{
  for(const name of workflows){
    const source=readFileSync(new URL(name,workflowDir),'utf8');
    assert.doesNotMatch(source,/contents:\s*write/,`${name}: contents write permission`);
    assert.doesNotMatch(source,/git\s+push/,`${name}: source mutation from CI`);
  }
});

test('parity automation has no reusable static credential or credential artifact',()=>{
  const parity=readFileSync(new URL('../mobile2/tools/parity_ui.py',import.meta.url),'utf8');
  assert.match(parity,/secrets\.token_urlsafe/);
  assert.doesNotMatch(parity,/PASSWORD\s*=\s*["'][^"']+["']/);
  assert.doesNotMatch(parity,/test-account\.txt/);
});

test('native parity follows the approved four-tab navigation',()=>{
  const parity=readFileSync(new URL('../mobile2/tools/parity_ui.py',import.meta.url),'utf8');
  assert.match(parity,/tap_text\("Dashboard", timeout=15\)/);
  assert.match(parity,/tap_desc\("Buka profil dan pengaturan", timeout=15\)/);
  assert.doesNotMatch(parity,/tap_text\("(?:Beranda|Akun)"/);
});
