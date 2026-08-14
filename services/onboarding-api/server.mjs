import http from 'node:http';
import {Readable} from 'node:stream';
import {version, search} from './kbli.mjs';
import {state} from './state.mjs';
import {progress} from './progress.mjs';
import {complete} from './complete.mjs';
import {productSales} from './sales.mjs';
import {createTokenBucket, publicError, requestId} from './security.mjs';
import {CORE} from './core.mjs';

const port=Number(process.env.PORT||3000);
const allowedOrigins=new Set(String(process.env.CORS_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean));
const perClient=createTokenBucket({capacity:30,refillPerSecond:0.5});
const globalSearch=createTokenBucket({capacity:300,refillPerSecond:5});
let searchInFlight=0;

function responseHeaders(req,id,contentType='application/json; charset=utf-8'){
  const origin=String(req.headers.origin||'');
  return {'content-type':contentType,'access-control-allow-origin':allowedOrigins.has(origin)?origin:'null','access-control-allow-headers':'authorization,content-type,x-admin-session,x-request-id,last-event-id','access-control-allow-methods':'GET,HEAD,PATCH,POST,PUT,DELETE,OPTIONS','access-control-expose-headers':'x-request-id','cache-control':'no-store','vary':'Origin','x-request-id':id};
}
const send=(req,res,status,data,id)=>{res.writeHead(status,responseHeaders(req,id));res.end(JSON.stringify(data));};
const readRaw=async(req,max=131072)=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(new Error('PAYLOAD_TOO_LARGE'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks,size);};
const read=async req=>{const body=(await readRaw(req)).toString('utf8');return body?JSON.parse(body):{};};
const clientKey=req=>String(req.headers['x-real-ip']||String(req.headers['x-forwarded-for']||'').split(',').at(-1)||req.socket.remoteAddress||'unknown').trim().slice(0,128);

async function proxyCore(req,res,url,id){
  const method=String(req.method||'GET').toUpperCase();
  if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(method)||!url.pathname.startsWith('/api/'))return false;
  const headers={accept:String(req.headers.accept||'application/json'),'x-request-id':id};
  for(const name of ['authorization','content-type','x-admin-session','last-event-id'])if(req.headers[name])headers[name]=String(req.headers[name]);
  const isInlineMedia=/^\/api\/media\/product\/[^/]+\/upload-inline$/.test(url.pathname);
  const body=['GET','HEAD'].includes(method)?undefined:await readRaw(req,isInlineMedia?9*1024*1024:262144);
  const isEventStream=url.pathname==='/api/events';
  const upstream=await fetch(CORE+url.pathname+url.search,{method,headers,body,redirect:'manual',signal:isEventStream?undefined:AbortSignal.timeout(30000)});
  const contentType=String(upstream.headers.get('content-type')||'application/json; charset=utf-8');
  res.writeHead(upstream.status,responseHeaders(req,id,contentType));
  if(!upstream.body||method==='HEAD'){res.end();return true;}
  await new Promise((resolve,reject)=>{
    const stream=Readable.fromWeb(upstream.body);
    stream.on('error',reject);res.on('finish',resolve);res.on('close',resolve);stream.pipe(res);
  });
  return true;
}

http.createServer(async(req,res)=>{
  const id=requestId(req.headers['x-request-id']);
  try{
    if(req.method==='OPTIONS'){res.writeHead(204,responseHeaders(req,id));return res.end();}
    const url=new URL(req.url||'/','http://localhost');
    if(req.method==='GET'&&url.pathname==='/health')return send(req,res,200,{ok:true,service:'saku-onboarding'},id);
    if(req.method==='GET'&&url.pathname==='/api/reference/kbli/version')return send(req,res,200,{ok:true,data:await version()},id);
    if(req.method==='GET'&&url.pathname==='/api/reference/kbli/search'){
      if(!perClient.consume(clientKey(req))||!globalSearch.consume('global')||searchInFlight>=8)throw Object.assign(new Error('RATE_LIMITED'),{status:429});
      searchInFlight+=1;
      try{return send(req,res,200,{ok:true,data:await search(url)},id);}finally{searchInFlight-=1;}
    }
    if(req.method==='GET'&&url.pathname==='/api/analytics/product-sales')return send(req,res,200,{ok:true,data:await productSales(req,url)},id);
    if(req.method==='GET'&&url.pathname==='/api/onboarding/state')return send(req,res,200,{ok:true,data:await state(req)},id);
    if(req.method==='PATCH'&&url.pathname==='/api/onboarding/state')return send(req,res,200,{ok:true,data:await progress(req,await read(req))},id);
    if(req.method==='POST'&&url.pathname==='/api/onboarding/complete')return send(req,res,200,{ok:true,data:await complete(req,await read(req))},id);
    if(await proxyCore(req,res,url,id))return;
    return send(req,res,404,{ok:false,error:'NOT_FOUND'},id);
  }catch(error){
    const safe=publicError(error);
    console.error(JSON.stringify({level:'error',requestId:id,status:safe.status,error:safe.code,internal:String(error?.message||'REQUEST_FAILED')}));
    return send(req,res,safe.status,{ok:false,error:safe.code,requestId:id},id);
  }
}).listen(port,'0.0.0.0',()=>console.log(`saku-onboarding ${port}`));
