import {tenant} from './db.mjs';
import {principal} from './core.mjs';
import {mayReadAllOutlets} from './security.mjs';

const PERIODS=new Set(['daily','weekly','monthly','yearly']);
function periodStart(period){
  const unit=period==='daily'?'day':period==='weekly'?'week':period==='monthly'?'month':'year';
  return `(date_trunc('${unit}', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'UTC'`;
}
async function resolveOutlet(p,u){
  const requested=String(u.searchParams.get('outletId')||'').trim();
  if(requested){
    const allOutlets=mayReadAllOutlets(p);
    const r=await tenant(p.merchantId,'SELECT o.id FROM "Outlet" o LEFT JOIN user_outlets uo ON uo.outlet_id=o.id AND uo.user_id=$2 AND uo.merchant_id=$3 WHERE o.id=$1 AND o."merchantId"=$3 AND o."deletedAt" IS NULL AND ($4::boolean OR uo.outlet_id IS NOT NULL) LIMIT 1',[requested,p.userId,p.merchantId,allOutlets]);
    if(!r.rows[0])throw Object.assign(new Error('OUTLET_FORBIDDEN'),{status:403});
    return requested;
  }
  const mapped=await tenant(p.merchantId,'SELECT uo.outlet_id FROM user_outlets uo JOIN "Outlet" o ON o.id=uo.outlet_id WHERE uo.user_id=$1 AND uo.merchant_id=$2 AND o."merchantId"=$2 AND o."deletedAt" IS NULL ORDER BY uo.is_default DESC,uo.created_at ASC LIMIT 1',[p.userId,p.merchantId]);
  if(mapped.rows[0]?.outlet_id)return mapped.rows[0].outlet_id;
  if(!mayReadAllOutlets(p))throw Object.assign(new Error('OUTLET_REQUIRED'),{status:403});
  const r=await tenant(p.merchantId,'SELECT id FROM "Outlet" WHERE "merchantId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt" ASC,id ASC LIMIT 1',[p.merchantId]);
  return r.rows[0]?.id||null;
}
function rankRows(rows){
  const qty=[...rows].sort((a,b)=>b.quantitySold-a.quantitySold||b.grossSales-a.grossSales||String(a.productId).localeCompare(String(b.productId)));
  const rev=[...rows].sort((a,b)=>b.grossSales-a.grossSales||b.quantitySold-a.quantitySold||String(a.productId).localeCompare(String(b.productId)));
  const qr=new Map(qty.map((x,i)=>[x.productId,i+1])),rr=new Map(rev.map((x,i)=>[x.productId,i+1]));
  return rows.map(x=>({...x,rankByQuantity:qr.get(x.productId),rankByRevenue:rr.get(x.productId)}));
}
export async function productSales(req,u){
  const p=await principal(req),period=PERIODS.has(u.searchParams.get('period'))?u.searchParams.get('period'):'daily';
  const outletId=await resolveOutlet(p,u);if(!outletId)return{period,timezone:'Asia/Jakarta',outletId:null,items:[],topByQuantity:[],topByRevenue:[]};
  const start=periodStart(period);
  const sql=`SELECT p.id AS "productId",p.name,p."imageAssetId",SUM(ti.quantity)::int AS "quantitySold",COALESCE(SUM(ti."subTotal"),0)::numeric AS "grossSales",COUNT(DISTINCT t.id)::int AS "transactionCount" FROM "Transaction" t JOIN "Outlet" o ON o.id=t."outletId" JOIN "TransactionItem" ti ON ti."transactionId"=t.id JOIN "Product" p ON p.id=ti."productId" AND p."merchantId"=o."merchantId" WHERE t."outletId"=$1 AND o."merchantId"=$2 AND o."deletedAt" IS NULL AND t.status='COMPLETED' AND t."createdAt">=${start} GROUP BY p.id,p.name,p."imageAssetId"`;
  const r=await tenant(p.merchantId,sql,[outletId,p.merchantId]);
  const rows=r.rows.map(x=>({productId:x.productId,name:x.name,imageAssetId:x.imageAssetId||null,quantitySold:Number(x.quantitySold||0),grossSales:Number(x.grossSales||0),transactionCount:Number(x.transactionCount||0)}));
  const ranked=rankRows(rows);
  return{period,timezone:'Asia/Jakarta',outletId,items:[...ranked].sort((a,b)=>a.rankByQuantity-b.rankByQuantity),topByQuantity:[...ranked].sort((a,b)=>a.rankByQuantity-b.rankByQuantity).slice(0,3),topByRevenue:[...ranked].sort((a,b)=>a.rankByRevenue-b.rankByRevenue).slice(0,3)};
}
export async function topProducts(req,u){
  const daily=new URL(u.toString());daily.searchParams.set('period','daily');
  const d=await productSales(req,daily);
  return{period:'daily',timezone:d.timezone,outletId:d.outletId,items:d.topByQuantity.slice(0,3)};
}
