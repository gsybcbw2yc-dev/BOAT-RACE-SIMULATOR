'use strict';
// Only the exact reviewed V58 pack is accepted. No model data is published here.
const ModelBridge=(()=>{
  const SHA='224374b16d2b0b85e9a0f65ba0e27523a93313479511bf85294f74dfb570460d';
  const COMMIT='11dab445ac57bdbd46e2ef9114dcc505de9f984a';
  const IDS=Object.freeze({v4:'V4-PL-2026-10-12',scenario:'V6-SCENARIO-2026-11-16',integrated:'V6-INTEGRATED-2026-11-16'});
  function validate(pack){
    if(pack?.schema!=='boat-frozen-model-pack-v1'||pack.siteVersion!==58||pack.siteCommit!==COMMIT||pack.sha256!==SHA||pack.encoding!=='gzip+base64'||JSON.stringify(pack.modelIds)!==JSON.stringify(Object.values(IDS))||typeof pack.payload!=='string'||pack.payload.length>1000000)throw Error('対応する非公開V58モデルパックではありません');
  }
  async function browserSource(pack){
    validate(pack);
    const data=Uint8Array.from(atob(pack.payload),x=>x.charCodeAt(0));
    const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),parts=[];let length=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>3000000)throw Error('モデルパックが大きすぎます');parts.push(value)}}finally{await reader.cancel().catch(()=>{})}
    const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength}
    const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    if(sha!==SHA)throw Error('モデルパックのSHA-256が不一致です');
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }
  function nodeEngine(pack){
    validate(pack);
    const bytes=require('node:zlib').gunzipSync(Buffer.from(pack.payload,'base64'),{maxOutputLength:3000000});
    if(require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==SHA)throw Error('モデルパックのSHA-256が不一致です');
    const ctx=Object.create(null);require('node:vm').runInNewContext(bytes.toString('utf8'),ctx,{timeout:5000});
    return ctx.FrozenBoatModels;
  }
  // Synthetic entries are explicitly fictional IDs, never real racer identities.
  // Use a single fixed post-training reference date; absent historical features
  // use the production model's own missing-data branches, not fabricated stats.
  function syntheticInput(race){
    return {date:'2026-11-17',venue:race.venue,courseAssumed:false,weather:{...race.weather,windDirNumber:null},boats:race.boats.map((b,i)=>({...b,registrationNumber:900000+i,active:true,integratedInput:true,localTop2:null,localTop3:null,lateCount:null,motorTop3:null,meetingDay:null}))};
  }
  function predictor(mode,engine){
    if(!IDS[mode]||!engine||engine.ids?.[mode]!==IDS[mode])throw Error('固定モデルパックを読み込んでください');
    return race=>engine.predict(mode,race.sim?syntheticInput(race):{date:race.date,venue:race.venue,courseAssumed:race.courseAssumed,weather:race.weather,boats:race.boats});
  }
  return Object.freeze({SHA,COMMIT,IDS,validate,browserSource,nodeEngine,syntheticInput,predictor});
})();
if(typeof module!=='undefined')module.exports=ModelBridge;
