import fs from 'node:fs';
import { Pool } from '@neondatabase/serverless';
const file=new URL('../../reference-data/kbli2025.json',import.meta.url);
const dataset=JSON.parse(fs.readFileSync(file,'utf8'));
const entries=dataset?.entries||[];
if(dataset?.version!=='KBLI2025'||entries.length!==1559) throw new Error(`KBLI_GATE count ${entries.length}`);
if(entries[0]?.code!=='01111'||entries.at(-1)?.code!=='99000'||new Set(entries.map(e=>e.code)).size!==1559||new Set(entries.map(e=>e.category)).size!==22) throw new Error('KBLI_GATE dataset validation');
const connectionString=process.env.BOOTSTRAP_DATABASE_URL;
if(!connectionString) throw new Error('KBLI_GATE database connection missing');
const pool=new Pool({connectionString}); const db=await pool.connect();
try{
 await db.query('BEGIN');
 await db.query(`INSERT INTO public.reference_kbli_versions(version,source_name,source_url,effective_date,revision_date,sync_status,expected_level5_count,metadata,is_active) VALUES ('KBLI2025','Badan Pusat Statistik','https://klasifikasi.web.bps.go.id/app/kbli',DATE '2025-12-24',DATE '2026-01-13','PENDING',1559,jsonb_build_object('regulation','Peraturan BPS Nomor 7 Tahun 2025','canonical',true),false) ON CONFLICT(version) DO UPDATE SET source_name=excluded.source_name,source_url=excluded.source_url,effective_date=excluded.effective_date,revision_date=excluded.revision_date,expected_level5_count=excluded.expected_level5_count,metadata=public.reference_kbli_versions.metadata||excluded.metadata,updated_at=now()`);
 for(let i=0;i<entries.length;i+=180){ const batch=entries.slice(i,i+180),values=[],params=[]; let n=1; for(const e of batch){ values.push(`($${n++},$${n++},5,$${n++},$${n++},$${n++},NULL,$${n++},$${n++},true,now())`); params.push('KBLI2025',e.code,e.code.slice(0,4),e.category,e.title,`${e.title} ${e.code}`.toLowerCase(),'https://klasifikasi.web.bps.go.id/app/kbli'); } await db.query(`INSERT INTO public.reference_kbli_entries(version,code,level,parent_code,category,title,description,search_text,source_url,active,synced_at) VALUES ${values.join(',')} ON CONFLICT(version,code) DO UPDATE SET level=5,parent_code=excluded.parent_code,category=excluded.category,title=excluded.title,search_text=excluded.search_text,source_url=excluded.source_url,active=true,synced_at=now()`,params); }
 const check=(await db.query(`SELECT count(*)::int AS n,min(code) AS first,max(code) AS last,count(DISTINCT category)::int AS categories FROM public.reference_kbli_entries WHERE version='KBLI2025' AND level=5 AND active=true`)).rows[0];
 if(Number(check?.n)!==1559||check?.first!=='01111'||check?.last!=='99000'||Number(check?.categories)!==22) throw new Error(`KBLI_GATE database ${JSON.stringify(check)}`);
 await db.query(`UPDATE public.reference_kbli_versions SET sync_status='READY',entry_count=1559,source_synced_at=now(),activated_at=COALESCE(activated_at,now()),is_active=true,updated_at=now() WHERE version='KBLI2025'`); await db.query('COMMIT'); console.log('SAKU_KBLI2025_SEED_PASS 1559');
}catch(error){await db.query('ROLLBACK').catch(()=>undefined);throw error;}finally{db.release();await pool.end();}
