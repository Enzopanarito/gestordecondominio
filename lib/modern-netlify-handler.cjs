'use strict';

const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {realStagingReadsEnabled}=require('./failover-guard.cjs');

function netlifyEnvValue(key,env=process.env){
  const name=String(key||'');
  if(realStagingReadsEnabled(env)&&(name==='CONTEXT'||name==='VLA_DATA_ENVIRONMENT'))return 'production';
  return env[name];
}
function ensureNetlifyRuntime(){
  if(!globalThis.Netlify||typeof globalThis.Netlify!=='object')globalThis.Netlify={};
  if(!globalThis.Netlify.env||typeof globalThis.Netlify.env!=='object')globalThis.Netlify.env={};
  if(globalThis.Netlify.env.__vlaFailoverShim!==true){
    globalThis.Netlify.env.get=key=>netlifyEnvValue(key,process.env);
    globalThis.Netlify.env.__vlaFailoverShim=true;
  }
  return globalThis.Netlify;
}
function requestFromEvent(event={}){
  const method=String(event.httpMethod||'GET').toUpperCase();
  const headers=new Headers(event.headers||{});
  let url=String(event.rawUrl||'');
  if(!url){
    const host=headers.get('host')||'failover.invalid';
    const params=new URLSearchParams(event.queryStringParameters||{});
    url=`https://${host}${event.path||'/'}${params.size?`?${params.toString()}`:''}`;
  }
  const init={method,headers};
  if(!['GET','HEAD'].includes(method)&&event.body!==undefined&&event.body!==null&&String(event.body)!=='')init.body=event.isBase64Encoded?Buffer.from(String(event.body),'base64'):String(event.body);
  return new Request(url,init);
}
async function responseToNetlify(response){
  if(!(response instanceof Response))throw new TypeError('La función moderna no devolvió Response.');
  const headers={};response.headers.forEach((value,key)=>{headers[key]=value;});
  const body=Buffer.from(await response.arrayBuffer());
  return{statusCode:response.status,headers,isBase64Encoded:true,body:body.toString('base64')};
}
function createModernHandler(relativePath){
  const absolute=path.resolve(__dirname,'..',String(relativePath||''));
  const href=pathToFileURL(absolute).href;
  let modulePromise=null;
  return async function modernHandler(event,context={}){
    ensureNetlifyRuntime();
    modulePromise=modulePromise||import(href);
    const mod=await modulePromise;
    if(typeof mod.default!=='function')throw new TypeError(`La función moderna no exporta default: ${relativePath}`);
    return responseToNetlify(await mod.default(requestFromEvent(event),context));
  };
}

module.exports={netlifyEnvValue,ensureNetlifyRuntime,requestFromEvent,responseToNetlify,createModernHandler};
