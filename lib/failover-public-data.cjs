'use strict';

const {realStagingReadsEnabled}=require('./failover-guard.cjs');

let cachedHandler=null;
function previewFixtureModule(){return require('../.vendor/vla/netlify/functions/_shared/_public_preview_fixture');}
function sourceModule(){return require('../.vendor/vla/netlify/functions/public-data-v3');}
function shouldUsePreviewFixture(snapshotEnv,runtimeEnv=process.env){
  if(realStagingReadsEnabled(runtimeEnv))return false;
  return previewFixtureModule().enabled(snapshotEnv);
}
function getHandler(){
  if(!cachedHandler){
    cachedHandler=sourceModule().createHandler({
      previewEnabled:snapshotEnv=>shouldUsePreviewFixture(snapshotEnv,process.env)
    });
  }
  return cachedHandler;
}

module.exports={shouldUsePreviewFixture,getHandler};
