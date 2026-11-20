'use strict';
importScripts('core.js','lab.js');
let running=false;
self.onmessage=e=>{
  if(running||e.data?.type!=='start')return;
  running=true;
  try{
    const runner=new BoatLab.Runner(e.data.config);
    function chunk(){
      try{
        const progress=runner.step(200);self.postMessage({type:'progress',progress});
        if(runner.done){self.postMessage({type:'result',report:runner.report()});running=false}
        else setTimeout(chunk,0);
      }catch(err){running=false;self.postMessage({type:'error',message:String(err.message)})}
    }
    chunk();
  }catch(err){running=false;self.postMessage({type:'error',message:String(err.message)})}
};
