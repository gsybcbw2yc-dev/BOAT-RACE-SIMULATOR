'use strict';
const fs=require('node:fs');
const {Runner}=require('./lab.js');
const args=process.argv.slice(2),options={};let out='boat-q-report.json';
try{
  for(let i=0;i<args.length;i+=2){
    const key=args[i],value=args[i+1];if(value==null)throw Error('オプションに値が必要です');
    if(key==='--out')out=value;else if(['--train','--evaluate','--seed'].includes(key))options[key.slice(2)]=value;else throw Error('不明なオプション '+key);
  }
  const runner=new Runner(options);let last=Date.now();
  while(!runner.done){const p=runner.step(1000);if(Date.now()-last>1000||runner.done){process.stderr.write('\r'+p.phase+' '+p.train+'/'+p.trainTotal+' / '+p.evaluate+'/'+p.evalTotal+'    ');last=Date.now()}}
  const report=runner.report();fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});
  process.stderr.write('\n');console.table(report.evaluation.map(x=>({strategy:x.label,stake:x.stake,pnl:x.pnl,roi:x.roi,maxDD:x.maxDrawdown})));console.log('保存: '+out);
}catch(err){console.error('\n'+err.message);process.exitCode=1}
