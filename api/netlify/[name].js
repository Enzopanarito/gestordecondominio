'use strict';

const handlers=require('../../.generated/handler-map.cjs');
const {runHandler}=require('../../lib/netlify-adapter.cjs');

module.exports=async function(req,res){
  const name=String(req.query?.name||'').trim();
  const handler=handlers[name];
  if(!handler){
    res.statusCode=404;
    res.setHeader('content-type','application/json; charset=utf-8');
    return res.end(JSON.stringify({message:'Función no disponible en failover v1.',function:name||null}));
  }
  return runHandler(name,handler,req,res);
};
