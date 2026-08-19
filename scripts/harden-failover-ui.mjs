import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const DIST=path.join(ROOT,'dist');
const lock=JSON.parse(fs.readFileSync(path.join(ROOT,'vla-source-lock.json'),'utf8'));
const adminPath=path.join(DIST,'admin.html');
const runtimePath=path.join(DIST,'failover-runtime.js');

function requiredReplace(text,pattern,replacement,label){
  if(!pattern.test(text))throw new Error(`FAILOVER_OPERATOR_ANCHOR_MISSING:${label}`);
  return text.replace(pattern,replacement);
}

let admin=fs.readFileSync(adminPath,'utf8');
admin=requiredReplace(
  admin,
  /<p class=['"]text-center text-slate-500 mb-6['"]>Usa la misma contraseña de siempre<\/p>/,
  `<p class='text-center text-slate-500 mb-6'>Acceso exclusivo de contingencia · credenciales del entorno</p>`,
  'admin-login-copy'
);
admin=requiredReplace(
  admin,
  new RegExp(`<a href=['"]https:\\/\\/airtable\\.com\\/${lock.productionBaseId}['"][^>]*>🗂️ Airtable<\\/a>`),
  `<a id='vla-failover-airtable-link' href='https://airtable.com/${lock.stagingBaseId}' target='_blank' rel='noopener noreferrer' class='bg-amber-600 text-white px-4 py-2 rounded-full shadow font-semibold'>🧪 Airtable STAGING</a>`,
  'airtable-production-link'
);
admin=requiredReplace(
  admin,
  /<button id=['"]close-btn['"]([^>]*)>📆 Cierre de Mes<\/button>/,
  `<button id='close-btn'$1 disabled title='Cierre mensual bloqueado en failover v1'>🔒 Cierre bloqueado en failover</button>`,
  'close-button'
);
fs.writeFileSync(adminPath,admin);

const runtime=`(function(){
  document.documentElement.dataset.vlaFailover='1';
  var stagingBase=${JSON.stringify(lock.stagingBaseId)},productionBase=${JSON.stringify(lock.productionBaseId)};
  function ensureBadge(){
    var b=document.getElementById('vla-failover-badge');
    if(!b){b=document.createElement('div');b.id='vla-failover-badge';b.setAttribute('role','status');b.style.cssText='position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:100000;padding:8px 13px;border-radius:999px;background:#92400e;color:#fff;font:900 11px/1.1 system-ui;letter-spacing:.06em;box-shadow:0 5px 18px #0004;text-align:center;white-space:nowrap';document.body.appendChild(b);}return b;
  }
  function enforce(info){
    var env=String(info&&info.dataEnvironment||'unknown').toLowerCase(),mode=String(info&&info.writeMode||'unknown').toLowerCase();
    var b=ensureBadge();
    if(env==='staging'&&mode==='disabled'){b.textContent='VLA FAILOVER · STAGING · SOLO LECTURA';b.style.background='#92400e';}
    else if(env==='staging'){b.textContent='VLA FAILOVER · STAGING · PRUEBAS CONTROLADAS';b.style.background='#7c3aed';}
    else if(env==='production'&&info&&info.writeActive===true){b.textContent='VLA FAILOVER · CONTINGENCIA ACTIVA';b.style.background='#b91c1c';}
    else{b.textContent='VLA FAILOVER · ESTADO NO VERIFICADO';b.style.background='#991b1b';}
    var close=document.getElementById('close-btn');if(close){close.disabled=true;close.setAttribute('aria-disabled','true');close.title='Cierre mensual bloqueado en failover v1';close.textContent='🔒 Cierre bloqueado en failover';}
    var airtable=document.getElementById('vla-failover-airtable-link');if(airtable){var base=env==='production'?productionBase:stagingBase;airtable.href='https://airtable.com/'+base;airtable.textContent=env==='production'?'🗂️ Airtable PRODUCCIÓN':'🧪 Airtable STAGING';}
  }
  function boot(){
    enforce(null);
    fetch('/api/failover-health',{cache:'no-store'}).then(function(r){return r.json();}).then(enforce).catch(function(){enforce(null);});
    var observer=new MutationObserver(function(){var close=document.getElementById('close-btn');if(close&&!close.disabled)close.disabled=true;});observer.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();\n`;
fs.writeFileSync(runtimePath,runtime);

const finalAdmin=fs.readFileSync(adminPath,'utf8');
if(finalAdmin.includes(`href='https://airtable.com/${lock.productionBaseId}'`)||finalAdmin.includes(`href="https://airtable.com/${lock.productionBaseId}"`))throw new Error('FAILOVER_PRODUCTION_AIRTABLE_LINK_REMAINS');
if(!finalAdmin.includes("id='vla-failover-airtable-link'"))throw new Error('FAILOVER_STAGING_AIRTABLE_LINK_MISSING');
if(!finalAdmin.includes('Cierre bloqueado en failover'))throw new Error('FAILOVER_CLOSE_UI_GUARD_MISSING');
const finalRuntime=fs.readFileSync(runtimePath,'utf8');
for(const marker of ['STAGING · SOLO LECTURA','CONTINGENCIA ACTIVA','/api/failover-health'])if(!finalRuntime.includes(marker))throw new Error(`FAILOVER_RUNTIME_MARKER_MISSING:${marker}`);
console.log(`VLA_FAILOVER_OPERATOR_SAFETY_OK staging=${lock.stagingBaseId} production-link=dynamic close=blocked`);
