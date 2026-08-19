'use strict';

const lock=require('../vla-source-lock.json');
const {validateBasePair,activationFingerprint}=require('../lib/failover-guard.cjs');

module.exports=async function(req,res){
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');
  if(String(req.method||'GET').toUpperCase()!=='GET'){res.statusCode=405;return res.end(JSON.stringify({ok:false,status:'method-not-allowed'}));}
  try{
    const pair=validateBasePair(process.env),mode=String(process.env.VLA_FAILOVER_WRITE_MODE||lock.writesDefault).trim().toLowerCase();
    const activeReady=mode==='active'&&pair.dataEnv==='production'&&process.env.VERCEL_ENV==='production'&&String(process.env.VLA_FAILOVER_ACTIVATION_FINGERPRINT||'')===activationFingerprint();
    res.statusCode=200;
    return res.end(JSON.stringify({ok:true,status:'operational',schema:'vla-failover-health-v1',sourceCommit:lock.sourceCommit,sourceRelease:lock.sourceRelease,dataEnvironment:pair.dataEnv,writeMode:mode,writeActive:activeReady,monthlyClose:'blocked',whatsapp:'external-not-migrated'}));
  }catch(error){
    res.statusCode=503;
    return res.end(JSON.stringify({ok:false,status:'guard-failed',code:String(error.code||'FAILOVER_GUARD'),detail:String(error.message||'').slice(0,240),sourceCommit:lock.sourceCommit}));
  }
};
