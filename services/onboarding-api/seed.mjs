import {pool} from './db.mjs';
import {KBLI_EXPECTED_COUNT, KBLI_VERSION, loadPinnedDataset} from './seed-data.mjs';

// Runtime deployments only verify readiness. They never mutate reference data.
// Mutating seed work is isolated in seed-bootstrap.mjs with BOOTSTRAP_DATABASE_URL.
await loadPinnedDataset();
const result=await pool.query(
  'SELECT count(*)::int n,min(code) first,max(code) last FROM reference_kbli_entries WHERE version=$1 AND level=5 AND active=true',
  [KBLI_VERSION],
);
const check=result.rows[0];
if(Number(check?.n)!==KBLI_EXPECTED_COUNT||check?.first!=='01111'||check?.last!=='99000'){
  throw new Error('KBLI_RUNTIME_READINESS_FAILED');
}
console.log('KBLI2025_RUNTIME_VERIFY_PASS',check);
await pool.end();
