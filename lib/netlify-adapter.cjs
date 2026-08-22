'use strict';

const {authorize,clean}=require('./failover-guard.cjs');

function headersObject(req){const out={};for(const [key,value] of Object.entries(req.headers||{}))out[String(key).toLowerCase()]=Array.isArray(value)?value.join(', '):String(value??'');return out;}
function queryObject(req){const out={};for(const [key,value] of Object.entries(req.query||{})){if(key==='name')continue;out[key]=Array.isArray(value)?value[value.length-1]:String(value??'');}return out;}
function bodyText(req){if(req.body===undefined||req.body===null)return'';if(Buffer.isBuffer(req.body))return req.body.toString('utf8');if(typeof req.body==='string')return req.body;return JSON.stringify(req.body);}
function eventFromRequest(req){const headers=headersObject(req),proto=headers['x-forwarded-proto']||'https',host=headers['x-forwarded-host']||headers.host||'';if(!headers['x-nf-client-connection-ip']&&headers['x-forwarded-for'])headers['x-nf-client-connection-ip']=headers['x-forwarded-for'].split(',')[0].trim();const url=String(req.url||'/');return{httpMethod:String(req.method||'GET').toUpperCase(),headers,queryStringParameters:queryObject(req),body:bodyText(req),isBase64Encoded:false,path:url.split('?')[0],rawUrl:`${proto}://${host}${url}`,__netlifyModernRuntime:true};}
function setHeaders(res,headers={}){for(const [key,value] of Object.entries(headers||{})){if(value!==undefined&&value!==null)res.setHeader(key,String(value));}}
function sendNetlifyResponse(res,result={}){const status=Number(result.statusCode||200),headers=result.headers||{};setHeaders(res,headers);res.statusCode=status;const body=result.body??'';if(result.isBase64Encoded===true){res.end(Buffer.from(String(body),'base64'));return;}if(Buffer.isBuffer(body)){res.end(body);return;}res.end(String(body));}
function errorResponse(res,error){const code=clean(error?.code||'FAILOVER_ERROR');const status=code.startsWith('FAILOVER_')?503:500;res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify({message:'Failover VLA bloqueó la operación.',code,detail:clean(error?.message).slice(0,300)}));}
function ensureRuntimeUrl(req){const h=headersObject(req),host=h['x-forwarded-host']||h.host;if(!process.env.URL&&host)process.env.URL=`${h['x-forwarded-proto']||'https'}://${host}`;if(!process.env.PUBLIC_SITE_URL&&process.env.URL)process.env.PUBLIC_SITE_URL=process.env.URL;}

async function runHandler(name,handler,req,res){try{authorize(name,process.env,req?.method);ensureRuntimeUrl(req);const event=eventFromRequest(req);const result=await handler(event,{});return sendNetlifyResponse(res,result);}catch(error){console.error('VLA_FAILOVER_HANDLER_ERROR',name,error?.code||'',error?.message||error);return errorResponse(res,error);}}

module.exports={headersObject,queryObject,bodyText,eventFromRequest,setHeaders,sendNetlifyResponse,errorResponse,ensureRuntimeUrl,runHandler};
