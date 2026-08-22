'use strict';

const {realStagingReadsEnabled}=require('./failover-guard.cjs');

function handlerEnv(env=process.env){
  if(!realStagingReadsEnabled(env))return env;
  return{...env,CONTEXT:'production',VLA_DATA_ENVIRONMENT:'production'};
}
async function disabledNotification(){
  return{sent:false,status:'Notificación externa bloqueada por failover',detail:'SMTP permanece aislado durante la contingencia y certificación.',recipientConfigured:false};
}
function getHandler(){
  return async function failoverAdminPlant(event){
    const legacy=require('../.vendor/vla/netlify/functions/_shared/_plant_admin_handler.js');
    const handler=legacy.createHandler({env:handlerEnv(process.env),notifyOwner:disabledNotification});
    return handler(event);
  };
}

module.exports={handlerEnv,disabledNotification,getHandler};
