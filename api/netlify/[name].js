'use strict';

const handlers=require('../../.generated/handler-map.cjs');
const {runHandler}=require('../../lib/netlify-adapter.cjs');
const {authorize}=require('../../lib/failover-guard.cjs');

module.exports=async function(req,res){
  const name=String(req.query?.name||'').trim();
  try{authorize(name,process.env);}catch(error){
    if(error?.code==='FAILOVER_MONTHLY_CLOSE_BLOCKED'||error?.code==='FAILOVER_WHATSAPP_BLOCKED'){
      res.statusCode=503;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');
      return res.end(JSON.stringify({message:error.message,code:error.code,function:name||null}));
    }
  }
  const handler=handlers[name];
  if(!handler){
    res.statusCode=404;
    res.setHeader('content-type','application/json; charset=utf-8');
    return res.end(JSON.stringify({message:'Función no disponible en failover v1.',function:name||null}));
  }
  return runHandler(name,handler,req,res);
};
