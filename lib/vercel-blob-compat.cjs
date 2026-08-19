'use strict';

const crypto=require('node:crypto');
let sdkPromise=null;
const defaultSdk=()=>sdkPromise||(sdkPromise=import('@vercel/blob'));

function codedError(code,message,extra={}){return Object.assign(new Error(message),{code,...extra});}
function environmentValue(environment,key){if(!environment)return'';if(typeof environment.get==='function')return String(environment.get(key)||'');return String(environment[key]||'');}
function connectLambdaEvent(){return{connected:true,source:'vercel-blob-compat'};}
function validateConditions(options={}){if(options.onlyIfMatch&&options.onlyIfNew)throw codedError('BLOBS_CONDITION_CONFLICT','onlyIfMatch y onlyIfNew son mutuamente excluyentes.');if(options.onlyIfMatch&&typeof options.onlyIfMatch!=='string')throw codedError('BLOBS_ETAG_INVALID','onlyIfMatch requiere un ETag.');}
function asBuffer(value){if(Buffer.isBuffer(value))return Buffer.from(value);if(value instanceof ArrayBuffer)return Buffer.from(new Uint8Array(value));if(ArrayBuffer.isView(value))return Buffer.from(value.buffer,value.byteOffset,value.byteLength);if(typeof value==='string')return Buffer.from(value);return Buffer.from(value??'');}
function hash(value){return crypto.createHash('sha256').update(String(value)).digest('hex');}
function pathname(storeName,key){const store=String(storeName||'').replace(/[^A-Za-z0-9._-]/g,'_');if(!store)throw codedError('BLOBS_STORE_INVALID','Nombre de almacén inválido.');return`vla-compat/${store}/${hash(key)}.vlab.json`;}
function authOptions(env=process.env){const token=String(env.BLOB_READ_WRITE_TOKEN||'').trim();return token?{token}:{ };}
function isNotFound(error){return error?.status===404||error?.statusCode===404||/not.?found/i.test(String(error?.name||''))||/not.?found/i.test(String(error?.message||''));}
function isPrecondition(error){return error?.status===409||error?.status===412||error?.statusCode===409||error?.statusCode===412||/precondition|already.?exists|overwrite/i.test(String(error?.name||''))||/precondition|already.?exists|overwrite/i.test(String(error?.message||''));}
async function streamBuffer(stream){if(!stream)return Buffer.alloc(0);if(typeof stream.arrayBuffer==='function')return Buffer.from(await stream.arrayBuffer());const chunks=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);}
function encodeEnvelope(key,data,metadata={}){return JSON.stringify({schema:'vla-vercel-blob-compat-v1',key:String(key),metadata:{...metadata},data:asBuffer(data).toString('base64')});}
function decodeEnvelope(key,buffer){let parsed;try{parsed=JSON.parse(buffer.toString('utf8'));}catch(_){throw codedError('BLOBS_ENVELOPE_INVALID','El objeto Vercel Blob no contiene un sobre VLA válido.');}if(parsed?.schema!=='vla-vercel-blob-compat-v1'||parsed.key!==String(key)||typeof parsed.data!=='string')throw codedError('BLOBS_ENVELOPE_INVALID','El sobre almacenado no coincide con la clave lógica.');return{data:Buffer.from(parsed.data,'base64'),metadata:parsed.metadata&&typeof parsed.metadata==='object'?parsed.metadata:{}};}

function createVercelStore(name,{sdkProvider=defaultSdk,env=process.env}={}){
 const objectPath=key=>pathname(name,key);
 async function headSafe(key){const sdk=await sdkProvider();try{return await sdk.head(objectPath(key),{access:'private',...authOptions(env)});}catch(error){if(isNotFound(error))return null;throw error;}}
 async function read(key){const sdk=await sdkProvider();let result;try{result=await sdk.get(objectPath(key),{access:'private',useCache:false,...authOptions(env)});}catch(error){if(isNotFound(error))return null;throw error;}if(!result)return null;const buffer=await streamBuffer(result.stream||result);const envelope=decodeEnvelope(key,buffer);const etag=String(result.etag||result.blob?.etag||'')||String((await headSafe(key))?.etag||'');return{...envelope,etag};}
 async function set(key,data,options={}){validateConditions(options);const sdk=await sdkProvider();const body=encodeEnvelope(key,data,options.metadata||{}),opts={access:'private',addRandomSuffix:false,contentType:'application/json',...authOptions(env)};
  if(options.onlyIfNew){const existing=await headSafe(key);if(existing)return{modified:false,etag:String(existing.etag||'')};opts.allowOverwrite=false;}
  else{opts.allowOverwrite=true;if(options.onlyIfMatch)opts.ifMatch=options.onlyIfMatch;}
  try{const out=await sdk.put(objectPath(key),body,opts);return{modified:true,etag:String(out?.etag||'')};}catch(error){if((options.onlyIfNew||options.onlyIfMatch)&&isPrecondition(error)){const existing=await headSafe(key);return{modified:false,etag:String(existing?.etag||'')};}throw codedError('BLOBS_WRITE_FAILED',String(error.message||error),{cause:error});}
 }
 return{
  async get(key,options={}){const entry=await read(key);if(!entry)return null;if(options.type==='json')return JSON.parse(entry.data.toString('utf8'));if(options.type==='arrayBuffer')return entry.data.buffer.slice(entry.data.byteOffset,entry.data.byteOffset+entry.data.byteLength);return Buffer.from(entry.data);},
  async getWithMetadata(key,options={}){const entry=await read(key);if(!entry)return null;let data;if(options.type==='json')data=JSON.parse(entry.data.toString('utf8'));else if(options.type==='arrayBuffer')data=entry.data.buffer.slice(entry.data.byteOffset,entry.data.byteOffset+entry.data.byteLength);else data=Buffer.from(entry.data);return{data,metadata:{...entry.metadata},etag:entry.etag};},
  set,
  setJSON(key,data,options={}){return set(key,Buffer.from(JSON.stringify(data),'utf8'),options);},
  async delete(key){const sdk=await sdkProvider();try{await sdk.del(objectPath(key),{...authOptions(env)});return true;}catch(error){if(isNotFound(error))return false;throw error;}},
  _pathname:objectPath
 };
}
function getAtomicStore(name,options={}){return createVercelStore(name,options);}
async function atomicWrite(store,key,body,options={}){return store.set(key,body,options);}
async function atomicSet(store,key,data,options={}){return atomicWrite(store,key,data,options);}
async function atomicSetJSON(store,key,data,options={}){return store.setJSON(key,data,options);}
function wrapStore(store){return store;}

module.exports={environmentValue,connectLambdaEvent,validateConditions,atomicWrite,atomicSet,atomicSetJSON,wrapStore,getAtomicStore,createVercelStore,pathname,encodeEnvelope,decodeEnvelope,isNotFound,isPrecondition};
