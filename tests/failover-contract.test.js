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

test('source lock apunta al release de producción v15 auditado',()=>{
  assert.equal(lock.sourceCommit,'e0ad5634c0faa7ff3e524498cea51f2798aa1a23');
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
    for(const name of ['public-plant','admin-plant']){
      const read=guard.authorize(name,disabledStagingEnv(),'GET');assert.equal(read.allowed,true);assert.equal(read.write,false);
      assert.throws(()=>guard.authorize(name,disabledStagingEnv(),'POST'),error=>error.code==='FAILOVER_WRITES_DISABLED');
    }
  }
});

test('100 veces: POST de Planta solo puede escribir contra STAGING en modo staging explícito',()=>{
  for(let i=0;i<100;i++){
    for(const name of ['public-plant','admin-plant']){
      const write=guard.authorize(name,stagingEnv(),'POST');assert.equal(write.allowed,true);assert.equal(write.write,true);assert.equal(write.base,lock.stagingBaseId);
      assert.throws(()=>guard.authorize(name,{VERCEL_ENV:'production',VLA_DATA_ENVIRONMENT:'production',AIRTABLE_BASE_ID:lock.productionBaseId,VLA_FAILOVER_WRITE_MODE:'staging'},'POST'),error=>error.code==='FAILOVER_STAGING_WRITE_GUARD');
    }
  }
});

test('adaptador moderno da semántica production a lecturas STAGING reales sin cambiar la base',async()=>{
  const env=disabledStagingEnv();
  assert.equal(modern.netlifyEnvValue('VLA_DATA_ENVIRONMENT',env),'production');
  assert.equal(modern.netlifyEnvValue('CONTEXT',env),'production');
  assert.equal(modern.netlifyEnvValue('AIRTABLE_BASE_ID',env),lock.stagingBaseId);
  const request=modern.requestFromEvent({httpMethod:'POST',rawUrl:'https://failover.example/api/vla/plant',headers:{'content-type':'application/json'},body:'{"ok":true}'});
  assert.equal(request.method,'POST');assert.equal(await request.text(),'{"ok":true}');
  const converted=await modern.responseToNetlify(new Response('ok',{status:201,headers:{'content-type':'text/plain'}}));
  assert.equal(converted.statusCode,201);assert.equal(Buffer.from(converted.body,'base64').toString(),'ok');
  const adminEnv=adminPlant.handlerEnv(env);assert.equal(adminEnv.VLA_DATA_ENVIRONMENT,'production');assert.equal(adminEnv.AIRTABLE_BASE_ID,lock.stagingBaseId);
  const notification=await adminPlant.disabledNotification();assert.equal(notification.sent,false);assert.match(notification.status,/bloqueada/i);
});

test('100 veces: staging permite escrituras solo contra la base ficticia exacta',()=>{
  for(let i=0;i<100;i++){
    const ok=guard.authorize('admin-manual-payment',stagingEnv());
    assert.equal(ok.allowed,true);assert.equal(ok.write,true);assert.equal(ok.mode,'staging');assert.equal(ok.base,lock.stagingBaseId);
    assert.throws(()=>guard.authorize('admin-manual-payment',stagingEnv({AIRTABLE_BASE_ID:lock.productionBaseId})),/staging no apunta|staging no está aislada/i);
  }
});

test('100 veces: activación real exige producción + Vercel production + huella exacta',()=>{
  for(let i=0;i<100;i++){
    const ok=guard.authorize('process-payment-report',activeEnv());assert.equal(ok.allowed,true);assert.equal(ok.mode,'active');
    assert.throws(()=>guard.authorize('process-payment-report',activeEnv({VLA_FAILOVER_ACTIVATION_FINGERPRINT:'bad'})),error=>error.code==='FAILOVER_ACTIVE_FINGERPRINT');
    assert.throws(()=>guard.authorize('process-payment-report',activeEnv({VERCEL_ENV:'preview'})),error=>error.code==='FAILOVER_ACTIVE_VERCEL_GUARD');
  }
});

test('100 veces: modo disabled nunca escribe',()=>{
  for(let i=0;i<100;i++)assert.throws(()=>guard.authorize('public-report-payment',{VLA_DATA_ENVIRONMENT:'staging',AIRTABLE_BASE_ID:lock.stagingBaseId,VLA_FAILOVER_WRITE_MODE:'disabled'}),error=>error.code==='FAILOVER_WRITES_DISABLED');
});

test('cierre mensual y WhatsApp permanecen bloqueados por contrato',()=>{
  for(const name of ['monthly-close','monthly-close-v4','audit-snapshot'])assert.throws(()=>guard.authorize(name,stagingEnv()),error=>error.code==='FAILOVER_MONTHLY_CLOSE_BLOCKED');
  for(const name of ['whatsapp','whatsapp-send','whatsapp-schedule-run'])assert.throws(()=>guard.authorize(name,stagingEnv()),error=>error.code==='FAILOVER_WHATSAPP_BLOCKED');
});

test('100 veces: Vercel Blob conserva create-only, metadata, ETag y compare-and-set',async()=>{
  const sdk=mockSdk(),store=blob.createVercelStore('test-store',{sdkProvider:async()=>sdk,env:{BLOB_READ_WRITE_TOKEN:'test'}});
  for(let i=0;i<100;i++){
    const key=`proof/${i}`,first=await store.set(key,Buffer.from(`v${i}`),{onlyIfNew:true,metadata:{i}});assert.equal(first.modified,true);assert.ok(first.etag);
    const duplicate=await store.set(key,Buffer.from('other'),{onlyIfNew:true,metadata:{i:999}});assert.equal(duplicate.modified,false);assert.equal(duplicate.etag,first.etag);
    const read=await store.getWithMetadata(key);assert.equal(read.data.toString(),`v${i}`);assert.equal(read.metadata.i,i);assert.equal(read.etag,first.etag);
    const changed=await store.set(key,Buffer.from(`v${i}-2`),{onlyIfMatch:first.etag,metadata:{i,revision:2}});assert.equal(changed.modified,true);assert.notEqual(changed.etag,first.etag);
    const stale=await store.set(key,Buffer.from('stale'),{onlyIfMatch:first.etag});assert.equal(stale.modified,false);assert.equal(stale.etag,changed.etag);
    const final=await store.getWithMetadata(key);assert.equal(final.data.toString(),`v${i}-2`);assert.equal(final.metadata.revision,2);
  }
});

test('adaptador conserva método, query, IP, JSON y respuesta base64',()=>{
  const req={method:'POST',url:'/x?a=1',headers:{host:'backup.example','x-forwarded-for':'1.2.3.4, 5.6.7.8'},query:{name:'x',a:'1'},body:{hello:'world'}};
  const event=adapter.eventFromRequest(req);assert.equal(event.httpMethod,'POST');assert.deepEqual(event.queryStringParameters,{a:'1'});assert.equal(event.headers['x-nf-client-connection-ip'],'1.2.3.4');assert.equal(event.body,'{"hello":"world"}');assert.equal(event.rawUrl,'https://backup.example/x?a=1');
  const headers={};let ended=null;const res={setHeader:(k,v)=>headers[k]=v,end:v=>ended=v};adapter.sendNetlifyResponse(res,{statusCode:200,headers:{'content-type':'application/octet-stream'},isBase64Encoded:true,body:Buffer.from('ok').toString('base64')});assert.equal(res.statusCode,200);assert.equal(Buffer.from(ended).toString(),'ok');
});

test('fuente vendorizada queda fijada al commit y wrappers canónicos actuales, incluida Planta',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'.vendor','vla','vendor-manifest.json'),'utf8'));
  assert.equal(manifest.sourceCommit,lock.sourceCommit);assert.equal(manifest.sourceRelease,lock.sourceRelease);assert.ok(manifest.codeFiles.length>20);
  const publicWrapper=fs.readFileSync(path.join(root,'.vendor','vla','netlify','functions','public-data.js'),'utf8');
  const adminWrapper=fs.readFileSync(path.join(root,'.vendor','vla','netlify','functions','admin-data.js'),'utf8');
  assert.match(publicWrapper,/public-data-v3/);assert.match(adminWrapper,/admin-data-v3/);
  assert.equal(manifest.handlerFiles['public-plant'],'netlify/functions/public-plant.mjs');
  assert.equal(manifest.handlerFiles['admin-plant'],'netlify/functions/admin-plant.mjs');
  for(const rel of ['netlify/functions/public-plant.mjs','netlify/functions/admin-plant.mjs'])assert.ok(fs.existsSync(path.join(root,'.vendor','vla',rel)),`Falta ${rel}`);
  for(const rel of ['owner-plant-v1.css','owner-plant-v1.js','admin-plant-v1.css','admin-plant-v1.js','owner-report-sync-v1.css','owner-report-sync-v1.js'])assert.ok(manifest.staticFiles.some(item=>item.path===rel),`Falta asset ${rel}`);
  const map=fs.readFileSync(path.join(root,'.generated','handler-map.cjs'),'utf8');assert.match(map,/process-payment-report/);assert.match(map,/public-report-payment/);assert.match(map,/public-plant/);assert.match(map,/admin-plant/);assert.match(map,/modern-netlify-handler/);assert.doesNotMatch(map,/monthly-close/);assert.doesNotMatch(map,/whatsapp/);
  const shim=fs.readFileSync(path.join(root,'.vendor','vla','netlify','functions','_shared','_blobs_compat.js'),'utf8');assert.match(shim,/vercel-blob-compat/);
  const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  assert.ok(vercel.rewrites.some(item=>item.source==='/api/vla/plant'&&item.destination==='/api/netlify/public-plant'));
  assert.ok(vercel.rewrites.some(item=>item.source==='/api/vla/admin/plant'&&item.destination==='/api/netlify/admin-plant'));
});
