import{Pool}from'pg';
import{verifiedPoolConfig}from'./db-config.mjs';
import{KBLI_EXPECTED_COUNT,KBLI_SOURCE,KBLI_VERSION,loadPinnedDataset}from'./seed-data.mjs';
const connectionString=process.env.BOOTSTRAP_DATABASE_URL;
if(!connectionString)throw new Error('BOOTSTRAP_DATABASE_URL_REQUIRED');
const pool=new Pool(verifiedPoolConfig(connectionString,{max:2,statementTimeout:30000}));
const VERSION=KBLI_VERSION,SOURCE=KBLI_SOURCE,expected=KBLI_EXPECTED_COUNT;
try{
 const raw=await loadPinnedDataset();
 const client=await pool.connect(); try{await client.query('BEGIN');
  await client.query(`INSERT INTO reference_kbli_versions(version,source_name,source_url,sync_status,expected_level5_count,is_active,metadata) VALUES($1,'Badan Pusat Statistik',$2,'PENDING',$3,false,jsonb_build_object('canonical',true,'regulation','Peraturan BPS Nomor 7 Tahun 2025')) ON CONFLICT(version) DO UPDATE SET source_name=excluded.source_name,source_url=excluded.source_url,expected_level5_count=excluded.expected_level5_count,metadata=reference_kbli_versions.metadata||excluded.metadata,updated_at=now()`,[VERSION,raw.sourceUrl||SOURCE,expected]);
  for(let start=0;start<raw.entries.length;start+=100){const batch=raw.entries.slice(start,start+100),values=[],params=[];for(const e of batch){const b=params.length;params.push(e.code,e.parentCode||String(e.code).slice(0,4),e.category||null,e.title,e.description||null,e.searchText||`${e.title} ${e.description||''}`.toLowerCase(),e.sourceUrl||raw.sourceUrl||SOURCE);values.push(`('${VERSION}',$${b+1},5,$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},true,now())`);}await client.query(`INSERT INTO reference_kbli_entries(version,code,level,parent_code,category,title,description,search_text,source_url,active,synced_at) VALUES ${values.join(',')} ON CONFLICT(version,code) DO UPDATE SET level=excluded.level,parent_code=excluded.parent_code,category=excluded.category,title=excluded.title,description=excluded.description,search_text=excluded.search_text,source_url=excluded.source_url,active=true,synced_at=now()`,params);}
  const check=(await client.query(`SELECT count(*)::int n,min(code) first,max(code) last,count(DISTINCT category)::int categories FROM reference_kbli_entries WHERE version=$1 AND level=5 AND active=true`,[VERSION])).rows[0]; if(Number(check.n)!==1559||check.first!=='01111'||check.last!=='99000'||Number(check.categories)!==22)throw new Error(`KBLI_DB_GATE_FAILED:${JSON.stringify(check)}`);
  await client.query(`UPDATE reference_kbli_versions SET sync_status='ACTIVE',entry_count=$2,expected_level5_count=$2,source_synced_at=now(),activated_at=COALESCE(activated_at,now()),is_active=true,updated_at=now() WHERE version=$1`,[VERSION,expected]);
  await client.query(`UPDATE reference_kbli_versions SET is_active=false,updated_at=now() WHERE version<>$1 AND is_active=true`,[VERSION]); await client.query('COMMIT'); console.log('KBLI2025_BOOTSTRAP_SEED_PASS',check);
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}finally{await pool.end();}
