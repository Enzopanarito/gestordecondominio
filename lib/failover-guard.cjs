'use strict';

const crypto=require('node:crypto');
const lock=require('../vla-source-lock.json');

const WRITE_HANDLERS=new Set([
  'admin-security','admin-manual-payment','public-report-payment','public-payment-report-supplement',
  'process-payment-report','send-receipt','resend-receipt','receipt-recovery-background','mkj-access','access-mode','access-auto-sync'
]);
const HARD_BLOCKED=new Set(['monthly-close','monthly-close-v2','monthly-close-v4','monthly-close-modern','audit-snapshot','audit-snapshot-modern']);
const WHATSAPP_PREFIX=/^whatsapp(?:-|$)/i;

function clean(value){return String(value??'').trim();}
function activationFingerprint(){return crypto.createHash('sha256').update(`${lock.sourceCommit}|${lock.productionBaseId}|VLA_FAILOVER_ACTIVE_V1`).digest('hex');}
function isWrite(handler){return WRITE_HANDLERS.has(clean(handler));}
function effectiveDataEnvironment(env=process.env){return clean(env.VLA_DATA_ENVIRONMENT||lock.defaultDataEnvironment).toLowerCase();}
function effectiveWriteMode(env=process.env){return clean(env.VLA_FAILOVER_WRITE_MODE||lock.writesDefault).toLowerCase();}
function effectiveBaseId(env=process.env,dataEnv=effectiveDataEnvironment(env)){
  const explicit=clean(env.AIRTABLE_BASE_ID);
  if(explicit)return explicit;
  return dataEnv==='staging'?lock.stagingBaseId:'';
}
function validateBasePair(env=process.env){
  const dataEnv=effectiveDataEnvironment(env);
  const base=effectiveBaseId(env,dataEnv);
  if(dataEnv==='staging'&&base!==lock.stagingBaseId)throw Object.assign(new Error('El entorno staging no apunta a la base ficticia autorizada.'),{code:'FAILOVER_STAGING_BASE_MISMATCH'});
  if(dataEnv==='production'&&base!==lock.productionBaseId)throw Object.assign(new Error('El entorno production no apunta a la base VLA esperada.'),{code:'FAILOVER_PRODUCTION_BASE_MISMATCH'});
  if(!['staging','production'].includes(dataEnv))throw Object.assign(new Error('VLA_DATA_ENVIRONMENT no es válido para el failover.'),{code:'FAILOVER_ENV_INVALID'});
  return{dataEnv,base};
}
function materializeRuntimeDefaults(env=process.env){
  const dataEnv=effectiveDataEnvironment(env);
  if(!clean(env.VLA_DATA_ENVIRONMENT))env.VLA_DATA_ENVIRONMENT=dataEnv;
  if(!clean(env.VLA_FAILOVER_WRITE_MODE))env.VLA_FAILOVER_WRITE_MODE=lock.writesDefault;
  if(!clean(env.AIRTABLE_BASE_ID)&&dataEnv==='staging')env.AIRTABLE_BASE_ID=lock.stagingBaseId;
  const pair=validateBasePair(env);
  return{...pair,mode:effectiveWriteMode(env)};
}
function realStagingReadsEnabled(env=process.env){
  try{
    const pair=validateBasePair(env);
    return clean(env.VERCEL_ENV).toLowerCase()==='production'&&pair.dataEnv==='staging'&&pair.base===lock.stagingBaseId;
  }catch(_){return false;}
}
function authorize(handler,env=process.env){
  const name=clean(handler);
  if(!name)throw Object.assign(new Error('Falta el handler.'),{code:'FAILOVER_HANDLER_MISSING'});
  if(HARD_BLOCKED.has(name))throw Object.assign(new Error('El cierre mensual está bloqueado en failover v1.'),{code:'FAILOVER_MONTHLY_CLOSE_BLOCKED'});
  if(WHATSAPP_PREFIX.test(name))throw Object.assign(new Error('WhatsApp no se ejecuta desde el failover.'),{code:'FAILOVER_WHATSAPP_BLOCKED'});
  const pair=validateBasePair(env);
  const mode=effectiveWriteMode(env);
  if(!isWrite(name))return{allowed:true,write:false,mode,...pair};
  if(mode==='disabled')throw Object.assign(new Error('Las escrituras del failover están deshabilitadas.'),{code:'FAILOVER_WRITES_DISABLED'});
  if(mode==='staging'){
    if(pair.dataEnv!=='staging'||pair.base!==lock.stagingBaseId)throw Object.assign(new Error('La escritura staging no está aislada correctamente.'),{code:'FAILOVER_STAGING_WRITE_GUARD'});
    return{allowed:true,write:true,mode,...pair};
  }
  if(mode==='active'){
    if(pair.dataEnv!=='production'||pair.base!==lock.productionBaseId)throw Object.assign(new Error('La activación real no apunta a producción de forma inequívoca.'),{code:'FAILOVER_ACTIVE_BASE_GUARD'});
    if(clean(env.VERCEL_ENV)!=='production')throw Object.assign(new Error('La activación real solo se permite en un deployment production de Vercel.'),{code:'FAILOVER_ACTIVE_VERCEL_GUARD'});
    if(clean(env.VLA_FAILOVER_ACTIVATION_FINGERPRINT)!==activationFingerprint())throw Object.assign(new Error('Falta la huella exacta de activación del failover.'),{code:'FAILOVER_ACTIVE_FINGERPRINT'});
    return{allowed:true,write:true,mode,...pair};
  }
  throw Object.assign(new Error('VLA_FAILOVER_WRITE_MODE no es válido.'),{code:'FAILOVER_WRITE_MODE_INVALID'});
}

module.exports={WRITE_HANDLERS,HARD_BLOCKED,WHATSAPP_PREFIX,clean,activationFingerprint,isWrite,effectiveDataEnvironment,effectiveWriteMode,effectiveBaseId,validateBasePair,materializeRuntimeDefaults,realStagingReadsEnabled,authorize};
