import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const lock=JSON.parse(fs.readFileSync(path.join(ROOT,'vla-source-lock.json'),'utf8'));
const VENDOR=path.join(ROOT,'.vendor','vla');
const GENERATED=path.join(ROOT,'.generated');
const rawBase=`https://raw.githubusercontent.com/${lock.sourceRepository}/${lock.sourceCommit}`;

export const HANDLERS=Object.freeze([
  'public-data','login','admin-data','admin-security','admin-manual-payment',
  'public-report-payment','public-payment-report-status','public-payment-report-supplement',
  '_admin_payment_proof','payment-proof-prefill','payment-report-analyzer-background',
  'process-payment-report','send-receipt','resend-receipt','receipt-recovery-background',
  'mkj-access','access-mode','access-auto-sync','access-reconciliation-readonly',
  'bcv-rate','system-health','app-icon','public-plant','admin-plant'
]);
const HANDLER_FILES=Object.freeze({
  'public-plant':'netlify/functions/public-plant.mjs',
  'admin-plant':'netlify/functions/admin-plant.mjs'
});

export const PUBLIC_FILES=Object.freeze([
  'index.html','admin.html','audit.html','auditoria.html','cierre-auditoria.html',
  'mkj-access.html','seguridad.html','verificar-respaldo.html','whatsapp.html',
  'admin-autopilot.css','admin-autopilot.js','admin-feature-parity.js',
  'admin-plant-v1.css','admin-plant-v1.js','admin-owner-access-v1.js','admin-premium-10.css','admin-premium-10.js',
  'admin-payment-review-v10.css','admin-payment-review-v10.js',
  'admin-premium-controls.js','admin-premium-polish.css','admin-premium-preflight.js',
  'admin-premium.css','admin-premium.js','admin-responsive-v4.css','admin-responsive-v4.js',
  'admin-session-bridge.js','owner-current-month-v1.css','owner-current-month-v1.js',
  'owner-dark-contrast-v1.css','owner-mobile-v2-layout-fix.css','owner-mobile-v2.css',
  'owner-plant-v1.css','owner-plant-v1.js','owner-payment-report-v3.css','owner-payment-report-v3.js',
  'owner-report-sync-v1.css','owner-report-sync-v1.js','owner-breakdown-v7.css','owner-breakdown-v7.js',
  'payment-report-intelligence.js','vla-finance-v7.js','pwa-register.js','release.json','service-worker.js'
]);

const EXTRA_SOURCE=['scripts/tailwind-input.css'];
const sha256=data=>crypto.createHash('sha256').update(data).digest('hex');
const cleanRel=value=>String(value||'').replace(/^\/+/, '').replace(/\\/g,'/');
const handlerFile=name=>HANDLER_FILES[name]||`netlify/functions/${name}.js`;

async function fetchRaw(rel){
  const response=await fetch(`${rawBase}/${cleanRel(rel)}`,{headers:{'user-agent':'VLA-failover-source-lock'}});
  if(!response.ok)throw new Error(`SOURCE_FETCH_${response.status}:${rel}`);
  return Buffer.from(await response.arrayBuffer());
}
async function exists(rel){
  const response=await fetch(`${rawBase}/${cleanRel(rel)}`,{method:'HEAD',headers:{'user-agent':'VLA-failover-source-lock'}});
  return response.ok;
}
function write(rel,data){
  const target=path.join(VENDOR,cleanRel(rel));
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,data);
}
async function resolveModule(fromRel,spec){
  const base=cleanRel(path.posix.normalize(path.posix.join(path.posix.dirname(fromRel),spec)));
  const candidates=path.posix.extname(base)?[base]:[`${base}.js`,`${base}.json`,`${base}.cjs`,`${base}.mjs`,`${base}/index.js`];
  for(const candidate of candidates)if(await exists(candidate))return candidate;
  throw new Error(`SOURCE_DEPENDENCY_NOT_FOUND:${fromRel}:${spec}`);
}
function relativeSpecs(text){
  const found=new Set();
  const patterns=[/require\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,/import\s+(?:[^'";]+?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g];
  for(const re of patterns){let match;while((match=re.exec(text)))found.add(match[1]);}
  return [...found];
}
async function syncClosure(entries){
  const queue=[...entries],seen=new Set(),manifest=[];
  while(queue.length){
    const rel=cleanRel(queue.shift());
    if(seen.has(rel))continue;
    seen.add(rel);
    const data=await fetchRaw(rel);
    write(rel,data);
    manifest.push({path:rel,sha256:sha256(data),bytes:data.length});
    if(/\.(?:js|cjs|mjs)$/.test(rel)){
      const text=data.toString('utf8');
      for(const spec of relativeSpecs(text))queue.push(await resolveModule(rel,spec));
    }
  }
  return manifest;
}
function writeBlobShim(){
  const target=path.join(VENDOR,'netlify/functions/_shared/_blobs_compat.js');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,"'use strict';\nmodule.exports=require('../../../../../lib/vercel-blob-compat.cjs');\n");
}
function writeHandlerMap(){
  fs.mkdirSync(GENERATED,{recursive:true});
  const lines=["'use strict';","const map=Object.create(null);","const modern=require('../lib/modern-netlify-handler.cjs');"];
  for(const name of HANDLERS){
    if(name==='public-plant'){
      lines.push(`map[${JSON.stringify(name)}]=modern.createModernHandler('.vendor/vla/netlify/functions/public-plant.mjs');`);
      continue;
    }
    if(name==='admin-plant'){
      lines.push(`map[${JSON.stringify(name)}]=require('../lib/failover-admin-plant.cjs').getHandler();`);
      continue;
    }
    const safe=name.replace(/[^A-Za-z0-9_]/g,'_');
    lines.push(`const ${safe}=require('../.vendor/vla/netlify/functions/${name}.js'); map[${JSON.stringify(name)}]=${safe}.handler||${safe};`);
  }
  lines.push('module.exports=Object.freeze(map);','');
  fs.writeFileSync(path.join(GENERATED,'handler-map.cjs'),lines.join('\n'));
}

async function main(){
  fs.rmSync(VENDOR,{recursive:true,force:true});
  fs.rmSync(GENERATED,{recursive:true,force:true});
  const staticManifest=[];
  for(const rel of [...PUBLIC_FILES,...EXTRA_SOURCE]){
    const data=await fetchRaw(rel);write(rel,data);staticManifest.push({path:rel,sha256:sha256(data),bytes:data.length});
  }
  const handlerEntries=HANDLERS.map(handlerFile);
  const codeManifest=await syncClosure(handlerEntries);
  writeBlobShim();
  writeHandlerMap();
  const release=JSON.parse(fs.readFileSync(path.join(VENDOR,'release.json'),'utf8'));
  if(release.release!==lock.sourceRelease)throw new Error(`SOURCE_RELEASE_MISMATCH expected=${lock.sourceRelease} actual=${release.release}`);
  const manifest={schema:'vla-failover-vendor-manifest-v1',generatedAt:new Date().toISOString(),sourceRepository:lock.sourceRepository,sourceCommit:lock.sourceCommit,sourceRelease:release.release,handlers:HANDLERS,handlerFiles:Object.fromEntries(HANDLERS.map(name=>[name,handlerFile(name)])),staticFiles:staticManifest,codeFiles:codeManifest};
  fs.writeFileSync(path.join(VENDOR,'vendor-manifest.json'),JSON.stringify(manifest,null,2));
  console.log(`VLA_FAILOVER_SOURCE_SYNC_OK commit=${lock.sourceCommit} handlers=${HANDLERS.length} codeFiles=${codeManifest.length} static=${staticManifest.length}`);
}

main().catch(error=>{console.error(error.stack||error);process.exit(1)});
