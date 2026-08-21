import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const VENDOR=path.join(ROOT,'.vendor','vla');
const DIST=path.join(ROOT,'dist');
const lock=JSON.parse(fs.readFileSync(path.join(ROOT,'vla-source-lock.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(VENDOR,'vendor-manifest.json'),'utf8'));
const publicFiles=manifest.staticFiles.map(item=>item.path).filter(name=>!name.startsWith('scripts/'));
const TAILWIND_CDN=/<script\s+src=["']https:\/\/cdn\.tailwindcss\.com["']><\/script>/gi;

const ownerAssets=`<meta name="vla-owner-mobile" content="fluid-v2"><meta name="vla-owner-payment-report" content="progressive-v13"><meta name="vla-owner-report-sync" content="cross-device-v1"><meta name="vla-owner-dark-contrast" content="wcag-v1"><meta name="vla-owner-current-month" content="assessment-v1"><meta name="vla-owner-plant" content="intelligent-v1"><link id="vla-owner-mobile-v2" rel="stylesheet" href="/owner-mobile-v2.css"><link id="vla-owner-mobile-v2-layout-fix" rel="stylesheet" href="/owner-mobile-v2-layout-fix.css"><link id="vla-owner-payment-report-v3-css" rel="stylesheet" href="/owner-payment-report-v3.css"><link id="vla-owner-report-sync-v1-css" rel="stylesheet" href="/owner-report-sync-v1.css"><link id="vla-owner-dark-contrast-v1" rel="stylesheet" href="/owner-dark-contrast-v1.css"><link id="vla-owner-current-month-v1-css" rel="stylesheet" href="/owner-current-month-v1.css"><link id="vla-owner-plant-v1-css" rel="stylesheet" href="/owner-plant-v1.css"><script id="vla-payment-intelligence" defer src="/payment-report-intelligence.js"></script><script id="vla-owner-payment-report-v3" defer src="/owner-payment-report-v3.js"></script><script id="vla-owner-report-sync-v1" defer src="/owner-report-sync-v1.js"></script><script id="vla-owner-current-month-v1" defer src="/owner-current-month-v1.js"></script><script id="vla-owner-plant-v1" defer src="/owner-plant-v1.js"></script><script id="vla-owner-mobile-release">document.documentElement.dataset.vlaOwnerMobile='fluid-v2';document.documentElement.dataset.vlaOwnerDarkContrast='wcag-v1';</script>`;

const adminBoot=`<style id="vla-admin-boot-style">#login.hidden{display:none!important}html[data-vla-admin-page="1"] #app{visibility:hidden!important;opacity:0!important}html[data-vla-admin-page="1"][data-vla-admin-ready="1"] #app{visibility:visible!important;opacity:1!important}#vla-admin-loader{display:none;position:fixed;inset:0;z-index:99999;align-items:center;justify-content:center;padding:24px;background:linear-gradient(145deg,#061f3b,#020b17);font-family:Inter,system-ui,sans-serif}#login.hidden~#vla-admin-loader,#app:not(.hidden)~#vla-admin-loader{display:flex}html[data-vla-admin-ready="1"] #vla-admin-loader{display:none}.vla-admin-loader-card{width:min(92vw,430px);padding:34px 30px;border-radius:28px;background:#fff;text-align:center;color:#0f172a}.vla-admin-loader-logo{width:88px;height:88px;margin:0 auto 18px;border-radius:24px}.vla-admin-loader-card strong{display:block;font-size:23px;font-weight:900}.vla-admin-loader-card span{display:block;margin-top:8px;color:#64748b}</style><script id="vla-admin-boot-marker">document.documentElement.dataset.vlaAdminPage='1';</script>`;
const adminAssets=`${adminBoot}<meta name="vla-admin-ui" content="premium-v1"><meta name="vla-admin-quality" content="10"><meta name="vla-admin-responsive" content="fluid-v4"><meta name="vla-admin-plant" content="intelligent-v1"><link id="vla-admin-premium-css" rel="stylesheet" href="/admin-premium.css"><link id="vla-admin-premium-polish" rel="stylesheet" href="/admin-premium-polish.css"><link id="vla-admin-premium-10-css" rel="stylesheet" href="/admin-premium-10.css"><link id="vla-admin-responsive-v4-css" rel="stylesheet" href="/admin-responsive-v4.css"><link id="vla-admin-autopilot-css" rel="stylesheet" href="/admin-autopilot.css"><link id="vla-admin-plant-v1-css" rel="stylesheet" href="/admin-plant-v1.css"><script id="vla-admin-session-bridge" src="/admin-session-bridge.js"></script><script id="vla-admin-owner-access-v1" defer src="/admin-owner-access-v1.js"></script><script id="vla-admin-plant-v1" defer src="/admin-plant-v1.js"></script><script id="vla-admin-premium-v1">(function waitForAdmin(){if(window.ready===true){var files=['/admin-premium-preflight.js','/admin-premium.js','/admin-premium-controls.js','/admin-premium-10.js','/admin-feature-parity.js','/admin-responsive-v4.js','/admin-autopilot.js'];var i=0;function next(){if(i>=files.length)return;var s=document.createElement('script');s.src=files[i++];s.onload=next;document.body.appendChild(s)}next()}else setTimeout(waitForAdmin,60)})();</script>`;
const adminLoader=`<div id="vla-admin-loader" role="status" aria-live="polite"><div class="vla-admin-loader-card"><img class="vla-admin-loader-logo" src="/.netlify/functions/app-icon?app=portal&size=180" alt="Logo Villa Los Apamates"><strong>Villa Los Apamates</strong><span>Preparando portal administrativo de contingencia…</span></div></div>`;
const failoverRuntime=`<script id="vla-failover-runtime" src="/failover-runtime.js" defer></script>`;

function injectBefore(html,needle,fragment){return html.includes(needle)?html:html.includes('</head>')?html.replace('</head>',fragment+'</head>'):fragment+html;}
function transformHtml(name,text){
  let html=text.replace(TAILWIND_CDN,'<link rel="stylesheet" href="/tailwind.generated.css">');
  if(name==='index.html')html=injectBefore(html,'id="vla-owner-mobile-v2"',ownerAssets);
  if(name==='admin.html'){
    html=injectBefore(html,'id="vla-admin-premium-v1"',adminAssets);
    if(!html.includes('id="vla-admin-loader"'))html=html.includes('</body>')?html.replace('</body>',adminLoader+'</body>'):html+adminLoader;
  }
  html=injectBefore(html,'id="vla-failover-runtime"',failoverRuntime);
  return html;
}
function copy(rel){
  const source=path.join(VENDOR,rel),target=path.join(DIST,rel);
  if(!fs.existsSync(source))throw new Error(`FAILOVER_STATIC_MISSING:${rel}`);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  let data=fs.readFileSync(source);
  if(rel.endsWith('.html'))data=Buffer.from(transformHtml(rel,data.toString('utf8')));
  fs.writeFileSync(target,data);
}

fs.rmSync(DIST,{recursive:true,force:true});fs.mkdirSync(DIST,{recursive:true});
for(const file of publicFiles)copy(file);
fs.writeFileSync(path.join(DIST,'failover-runtime.js'),`(function(){document.documentElement.dataset.vlaFailover='1';var b=document.createElement('div');b.id='vla-failover-badge';b.textContent='CONTINGENCIA VLA';b.style.cssText='position:fixed;right:10px;bottom:10px;z-index:100000;padding:7px 10px;border-radius:999px;background:#7c2d12;color:#fff;font:800 11px/1.1 system-ui;letter-spacing:.06em;box-shadow:0 5px 18px #0004';document.addEventListener('DOMContentLoaded',function(){document.body.appendChild(b)},{once:true})})();\n`);
fs.writeFileSync(path.join(DIST,'failover-status.json'),JSON.stringify({schema:'vla-failover-status-v1',sourceCommit:lock.sourceCommit,sourceRelease:lock.sourceRelease,environment:process.env.VLA_DATA_ENVIRONMENT||lock.defaultDataEnvironment,writes:process.env.VLA_FAILOVER_WRITE_MODE||lock.writesDefault,monthlyClose:'blocked',whatsapp:'external'},null,2));

const bin=path.join(ROOT,'node_modules','.bin',process.platform==='win32'?'tailwindcss.cmd':'tailwindcss');
execFileSync(bin,['-i',path.join(VENDOR,'scripts','tailwind-input.css'),'-o',path.join(DIST,'tailwind.generated.css'),'--content',[path.join(DIST,'*.html'),path.join(DIST,'*.js')].join(','),'--minify'],{cwd:ROOT,stdio:'inherit'});
for(const file of ['index.html','admin.html']){
  const text=fs.readFileSync(path.join(DIST,file),'utf8');
  if(/cdn\.tailwindcss\.com/i.test(text))throw new Error(`TAILWIND_CDN_REMAINS:${file}`);
  if(!text.includes('vla-failover-runtime'))throw new Error(`FAILOVER_MARKER_MISSING:${file}`);
}
const owner=fs.readFileSync(path.join(DIST,'index.html'),'utf8');
for(const marker of ['vla-owner-report-sync-v1','vla-owner-plant-v1'])if(!owner.includes(marker))throw new Error(`FAILOVER_OWNER_ASSET_MISSING:${marker}`);
const admin=fs.readFileSync(path.join(DIST,'admin.html'),'utf8');
for(const marker of ['vla-admin-plant-v1-css','vla-admin-plant-v1'])if(!admin.includes(marker))throw new Error(`FAILOVER_ADMIN_ASSET_MISSING:${marker}`);
console.log(`VLA_FAILOVER_STATIC_BUILD_OK files=${publicFiles.length+3} source=${lock.sourceCommit}`);
