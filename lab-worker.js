'use strict';
importScripts('core.js','model-bridge.js','real-data.js','lab.js');
let running=false;
self.onmessage=async e=>{
  if(running||e.data?.type!=='start')return;
  running=true;
  try{
    let engine=null;
    if(e.data.config.model!=='experimental'&&e.data.config.model!==undefined){
      const source=await ModelBridge.browserSource(e.data.pack);
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      try{importScripts(url);engine=self.FrozenBoatModels;}finally{URL.revokeObjectURL(url)}
    }
    const real=e.data.batches?RealData.prepare(e.data.batches):null;
    const runner=new BoatLab.Runner(e.data.config,engine,real);
    function chunk(){
      try{
        const progress=runner.step(e.data.config.model==='integrated'?10:200);self.postMessage({type:'progress',progress});
        if(runner.done){self.postMessage({type:'result',report:runner.report()});running=false}
        else setTimeout(chunk,0);
      }catch(err){running=false;self.postMessage({type:'error',message:String(err.message)})}
    }
    chunk();
  }catch(err){running=false;self.postMessage({type:'error',message:String(err.message)})}
};
