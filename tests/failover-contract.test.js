'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Readable}=require('node:stream');
const root=path.join(__dirname,'..');
const lock=require('../vla-source-lock.json');
const guard=require('../lib/failover-guard.cjs');
const failoverPublicData=require('../lib/failover-public-data.cjs');
const modern=require('../lib/modern-netlify-handler.cjs');
const adminPlant=require('../lib/failover-admin-plant.cjs');
const blob=require('../lib/vercel-blob-compat.cjs');
const adapter=require('../lib/netlify-adapter.cjs');

function stagingEnv(extra={}){return{VLA_DATA_ENVIRONMENT:'staging',AIRTABLE_BASE_ID:lock.stagingBaseId,VLA_FAILOVER_WRITE_MODE:'staging',...extra};}
function disabledStagingEnv(extra={}){return{VERCEL_ENV:'production',VLA_DATA_ENVIRONMENT:'staging',AIRTABLE_BASE_ID:lock.stagingBaseId,VLA_FAILOVER_WRITE_MODE:'disabled',...extra};}
function activeEnv(extra={}){return{VLA_DATA_ENVIRONMENT:'production',AIRTABLE_BASE_ID:lock.productionBaseId,VLA_FAILOVER_WRITE_MODE:'active',VERCEL_ENV:'production',VLA_FAILOVER_ACTIVATION_FINGERPRINT:guard.activationFingerprint(),...extra};}
function mockSdk(){
  const rows=new Map();let seq=0;
  const notFound=()=>Object.assign(new Error('not found'),{status:404});
  const precondition=()=>Object.assign(new Error('precondition failed'),{status:412});
  return{
    rows,
    async head(p){const r=rows.get(p);if(!r)throw notFound();return{etag:r.etag,pathname:p};},
    async put(p,body,opts={}){const current=rows.get(p);if(current&&opts.allowOverwrite===false)throw Object.assign(new Error('already exists'),{status:409});if(opts.ifMatch&&(!current||current.etag!==opts.ifMatch))throw precondition();const etag=`etag-${++seq}`;rows.set(p,{body:String(body),etag});return{etag,pathname:p};},
    async get(p){const r=rows.get(p);if(!r)throw notFound();return{stream:Readable.from([Buffer.from(r.body)]),etag:r.etag};},
    async del(p){if(!rows.has(p))throw notFound();rows.delete(p);}
  };
}

test('source lock apunta al commit productivo exacto y release v15 auditado',()=>{
  assert.equal(lock.sourceCommit,'92289cfc51bbd8f4e7eb437f6c3c1d01acca6f22');
  assert.equal(lock.sourceRelease,'2026-08-21-v15');
});

test('100 veces: defaults ausentes quedan en STAGING exacto y escrituras disabled',()=>{
  for(let i=0;i<100;i++){
    assert.equal(guard.effectiveDataEnvironment({}),'staging');
    assert.equal(guard.effectiveBaseId({}),lock.stagingBaseId);
    assert.equal(guard.effectiveWriteMode({}),'disabled');
    const read=guard.authorize('public-data',{});
    assert.equal(read.allowed,true);assert.equal(read.write,false);assert.equal(read.mode,'disabled');assert.equal(read.dataEnv,'staging');assert.equal(read.base,lock.stagingBaseId);
    assert.throws(()=>guard.authorize('public-report-payment',{}),error=>error.code==='FAILOVER_WRITES_DISABLED');
    assert.throws(()=>guard.validateBasePair({VLA_DATA_ENVIRONMENT:'production'}),error=>error.code==='FAILOVER_PRODUCTION_BASE_MISMATCH');
  }
});

test('100 veces: defaults seguros se materializan antes de cargar funciones VLA',()=>{
  for(let i=0;i<100;i++){
    const env={VERCEL_ENV:'production'};
    const result=guard.materializeRuntimeDefaults(env);
    assert.equal(result.dataEnv,'staging');assert.equal(result.base,lock.stagingBaseId);assert.equal(result.mode,'disabled');
    assert.equal(env.VLA_DATA_ENVIRONMENT,'staging');assert.equal(env.AIRTABLE_BASE_ID,lock.stagingBaseId);assert.equal(env.VLA_FAILOVER_WRITE_MODE,'disabled');
    assert.equal(guard.realStagingReadsEnabled(env),true);
    const preview={VERCEL_ENV:'preview'};guard.materializeRuntimeDefaults(preview);assert.equal(guard.realStagingReadsEnabled(preview),false);
    assert.throws(()=>guard.materializeRuntimeDefaults({VERCEL_ENV:'production',VLA_DATA_ENVIRONMENT:'production'}),error=>error.code==='FAILOVER_PRODUCTION_BASE_MISMATCH');
  }
});

test('100 veces: Vercel Production lee STAGING real y Preview conserva fixture',()=>{
  const snapshotEnv={VLA_DATA_ENVIRONMENT:'staging'};
  for(let i=0;i<100;i++){
    const production={VERCEL_ENV:'production',VLA_DATA_ENVIRONMENT:'staging',AIRTABLE_BASE_ID:lock.stagingBaseId,VLA_FAILOVER_WRITE_MODE:'disabled'};
    const preview={VERCEL_ENV:'preview',VLA_DATA_ENVIRONMENT:'staging',AIRTABLE_BASE_ID:lock.stagingBaseId,VLA_FAILOVER_WRITE_MODE:'disabled'};
    assert.equal(failoverPublicData.shouldUsePreviewFixture(snapshotEnv,production),false);
    assert.equal(failoverPublicData.shouldUsePreviewFixture(snapshotEnv,preview),true);
  }
  assert.equal(typeof failoverPublicData.getHandler(),'function');
});

test('100 veces: Planta permite GET pero bloquea POST mientras writes=disabled',()=>{
  for(let i=0;i<100;i++){
    const env=disabledStagingEnv();
    assert.equal(guard.authorize('public-plant',env,'GET').write,false);
    assert.equal(guard.authorize('admin-plant',env,'HEAD').write,false);
    assert.throws(()=>guard.authorize('public-plant',env,'POST'),error=>error.code==='FAILOVER_WRITES_DISABLED');
    assert.throws(()=>guard.authorize('admin-plant',env,'PATCH'),error=>error.code==='FAILOVER_WRITES_DISABLED');
  }
});

test('100 veces: POST de Planta solo puede escribir contra STAGING en modo staging explícito',()=>{
  for(let i=0;i<100;i++){
    const allowed=guard.authorize('admin-plant',stagingEnv(),'POST');assert.equal(allowed.allowed,true);assert.equal(allowed.write,true);assert.equal(allowed.mode,'staging');
    assert.throws(()=>guard.authorize('admin-plant',{VLA_DATA_ENVIRONMENT:'production',AIRTABLE_BASE_ID:lock.productionBaseId,VLA_FAILOVER_WRITE_MODE:'staging'},'POST'),error=>error.code==='FAILOVER_STAGING_WRITE_GUARD');
  }
});

test('adaptador moderno da semántica production a lecturas STAGING reales sin cambiar la base',()=>{
  const env=disabledStagingEnv();
  assert.equal(modern.netlifyEnvValue('CONTEXT',env),'production');
  assert.equal(modern.netlifyEnvValue('VLA_DATA_ENVIRONMENT',env),'production');
  assert.equal(env.AIRTABLE_BASE_ID,lock.stagingBaseId);
  assert.equal(adminPlant.handlerEnv(env).VLA_DATA_ENVIRONMENT,'production');
  assert.equal(adminPlant.handlerEnv(env).AIRTABLE_BASE_ID,lock.stagingBaseId);
});

test('100 veces: staging permite escrituras solo contra la base ficticia exacta',()=>{
  for(let i=0;i<100;i++){
    const result=guard.authorize('public-report-payment',stagingEnv());assert.equal(result.allowed,true);assert.equal(result.write,true);assert.equal(result.mode,'staging');
    assert.throws(()=>guard.authorize('public-report-payment',{VLA_DATA_ENVIRONMENT:'staging',AIRTABLE_BASE_ID:lock.productionBaseId,VLA_FAILOVER_WRITE_MODE:'staging'}),error=>error.code==='FAILOVER_STAGING_BASE_MISMATCH');
  }
});

test('100 veces: activación real exige producción + Vercel production + huella exacta',()=>{
  for(let i=0;i<100;i++){
    const result=guard.authorize('public-report-payment',activeEnv());assert.equal(result.allowed,true);assert.equal(result.write,true);assert.equal(result.mode,'active');
    assert.throws(()=>guard.authorize('public-report-payment',activeEnv({VLA_FAILOVER_ACTIVATION_FINGERPRINT:'incorrecta'})),error=>error.code==='FAILOVER_ACTIVE_FINGERPRINT_MISMATCH');
    assert.throws(()=>guard.authorize('public-report-payment',activeEnv({VERCEL_ENV:'preview'})),error=>error.code==='FAILOVER_ACTIVE_VERCEL_ENV_REQUIRED');
  }
});

test('100 veces: modo disabled nunca escribe',()=>{
  for(let i=0;i<100;i++)assert.throws(()=>guard.authorize('public-report-payment',disabledStagingEnv()),error=>error.code==='FAILOVER_WRITES_DISABLED');
});

test('cierre mensual y WhatsApp permanecen bloqueados por contrato',()=>{
  assert.throws(()=>guard.authorize('monthly-close-v4',activeEnv()),error=>error.code==='FAILOVER_MONTHLY_CLOSE_BLOCKED');
  assert.throws(()=>guard.authorize('whatsapp-send',activeEnv()),error=>error.code==='FAILOVER_WHATSAPP_BLOCKED');
});

test('100 veces: Vercel Blob conserva create-only, metadata, ETag y compare-and-set',async()=>{
  const sdk=mockSdk(),store=blob.createBlobStore('audit',{sdk});
  for(let i=0;i<100;i++){
    const key=`item-${i}`;await store.setJSON(key,{value:i},{onlyIfNew:true,metadata:{cycle:i}});
    const first=await store.getWithMetadata(key,{type:'json'});assert.equal(first.data.value,i);assert.equal(first.metadata.cycle,i);assert.ok(first.etag);
    await assert.rejects(()=>store.setJSON(key,{value:99},{onlyIfNew:true}),error=>error.code==='BLOB_KEY_EXISTS');
    await store.setJSON(key,{value:i+1},{onlyIfMatch:first.etag,metadata:{cycle:i+1}});
    const second=await store.getWithMetadata(key,{type:'json'});assert.equal(second.data.value,i+1);assert.equal(second.metadata.cycle,i+1);
    await assert.rejects(()=>store.setJSON(key,{value:3},{onlyIfMatch:'stale-etag'}),error=>error.code==='BLOB_PRECONDITION_FAILED');
  }
});

test('adaptador conserva método, query, IP, JSON y respuesta base64',async()=>{
  const req={method:'POST',url:'/x?a=1',headers:{host:'example.test','content-type':'application/json','x-forwarded-for':'1.2.3.4'},body:{ok:true},query:{a:'1'},socket:{remoteAddress:'5.6.7.8'}};
  const event=adapter.eventFromRequest(req);assert.equal(event.httpMethod,'POST');assert.equal(event.queryStringParameters.a,'1');assert.equal(event.headers['x-nf-client-connection-ip'],'1.2.3.4');assert.equal(event.body,JSON.stringify({ok:true}));
  let ended='';const res={statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(v){ended=v;}};
  adapter.sendNetlifyResponse(res,{statusCode:201,headers:{'content-type':'text/plain'},isBase64Encoded:true,body:Buffer.from('hola').toString('base64')});assert.equal(res.statusCode,201);assert.equal(String(ended),'hola');
});

test('fuente vendorizada queda fijada al commit y wrappers canónicos actuales, incluida Planta',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'.vendor','vla','vendor-manifest.json'),'utf8'));
  assert.equal(manifest.sourceCommit,lock.sourceCommit);assert.equal(manifest.sourceRelease,lock.sourceRelease);assert.equal(manifest.handlers.length,24);
  assert.equal(manifest.handlerFiles['public-plant'],'netlify/functions/public-plant.mjs');assert.equal(manifest.handlerFiles['admin-plant'],'netlify/functions/admin-plant.mjs');
  assert.equal(manifest.staticFiles.some(item=>item.path==='owner-plant-v1.js'),true);assert.equal(manifest.staticFiles.some(item=>item.path==='owner-report-sync-v1.js'),true);
});
