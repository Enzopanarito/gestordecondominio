'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const modern=require('../lib/modern-netlify-handler.cjs');

const root=path.join(__dirname,'..');

function restoreEnv(snapshot){
  for(const key of ['VERCEL_ENV','VLA_DATA_ENVIRONMENT','VLA_FAILOVER_WRITE_MODE','AIRTABLE_BASE_ID']){
    if(snapshot[key]===undefined)delete process.env[key];else process.env[key]=snapshot[key];
  }
}

test('public-plant usa import literal trazable por Vercel y responde desde fixture aislado',async()=>{
  const source=fs.readFileSync(path.join(root,'lib','modern-netlify-handler.cjs'),'utf8');
  assert.match(source,/import\('\.\.\/\.vendor\/vla\/netlify\/functions\/public-plant\.mjs'\)/);
  const map=fs.readFileSync(path.join(root,'.generated','handler-map.cjs'),'utf8');
  assert.match(map,/createPublicPlantHandler\(\)/);

  const snapshot={
    VERCEL_ENV:process.env.VERCEL_ENV,
    VLA_DATA_ENVIRONMENT:process.env.VLA_DATA_ENVIRONMENT,
    VLA_FAILOVER_WRITE_MODE:process.env.VLA_FAILOVER_WRITE_MODE,
    AIRTABLE_BASE_ID:process.env.AIRTABLE_BASE_ID
  };
  try{
    process.env.VERCEL_ENV='preview';
    process.env.VLA_DATA_ENVIRONMENT='staging';
    process.env.VLA_FAILOVER_WRITE_MODE='disabled';
    process.env.AIRTABLE_BASE_ID='appZhq8nVZ7lZ2k6K';
    const handler=modern.createPublicPlantHandler();
    const result=await handler({
      httpMethod:'GET',
      rawUrl:'https://failover-preview.example/api/vla/plant?ownerId=recPreviewHouse01',
      headers:{host:'failover-preview.example'}
    });
    assert.equal(result.statusCode,200);
    const payload=JSON.parse(Buffer.from(result.body,'base64').toString('utf8'));
    assert.equal(payload.success,true);
    assert.equal(payload.dataEnvironment,'preview-fixture');
    assert.equal(payload.house,1);
  }finally{restoreEnv(snapshot);}
});
