'use strict';
// Research-only, tabular Q learning. Never uses the user's game state or private data.
const BoatLab=(()=>{
  const C=typeof module!=='undefined'?require('./core.js'):Core;
  const VERSION='QLAB-1.0', HORIZON=48, ALPHA=.12, GAMMA=.96, RISK=.25;
  const ACTIONS=[
    {label:'見送り',n:0,amount:0},
    {label:'上位1点 × 100',n:1,amount:100},
    {label:'上位1点 × 500',n:1,amount:500},
    {label:'上位3点 × 100',n:3,amount:100},
    {label:'上位3点 × 300',n:3,amount:300},
    {label:'上位10点 × 100',n:10,amount:100}
  ];
  const metric=()=>({races:0,participated:0,hits:0,stake:0,returns:0,pnl:0,episodes:0,lossEpisodes:0,bustEpisodes:0,maxDrawdown:0});
  const bankroll=()=>({wallet:C.INITIAL,peak:C.INITIAL,dd:0});
  const group=(v,a,b)=>v<a?0:v<b?1:2;
  function config(raw={}){
    const train=Number(raw.train??10000),evaluate=Number(raw.evaluate??2000),seed=String(raw.seed??'20261121');
    if(!Number.isInteger(train)||train<1||train>1000000||!Number.isInteger(evaluate)||evaluate<1||evaluate>100000||!seed.length||seed.length>80)throw Error('学習1〜100万R、評価1〜10万R、シード1〜80文字を指定してください');
    return {train,evaluate,seed};
  }
  function card(cfg,phase,i){
    // Separate seed namespaces ensure no generated race ID is reused in evaluation.
    return C.generateRace('QLAB/'+cfg.seed+'/'+phase,1+Math.floor(i/HORIZON),1+(i%24),1+Math.floor((i%HORIZON)/24),600+i%48*5,C.DEMO);
  }
  function features(race){
    const distribution=C.experimental(race).distribution,odds=C.market3(race,0),top=distribution.slice(0,10);
    return {top,odds,confidence:top.reduce((s,x)=>s+x[1],0),edge:top.reduce((s,x)=>s+x[1]*odds[x[0]],0)/10};
  }
  function stateKey(b,f,round){
    return [group(b.wallet/C.INITIAL,.8,1.05),group(b.dd/C.INITIAL,.02,.08),group(f.confidence,.35,.55),group(f.edge,.60,.90),round%HORIZON<24?0:1].join(':');
  }
  const allowed=b=>ACTIONS.map((a,i)=>a.n*a.amount<=b.wallet?i:-1).filter(i=>i>=0);
  function pick(q,key,b){
    const row=q[key]||ACTIONS.map(()=>0),valid=allowed(b);
    return valid.reduce((best,i)=>row[i]>row[best]?i:best,valid[0]);
  }
  function betFor(action,f){
    const a=ACTIONS[action];
    return f.top.slice(0,a.n).map(([key])=>({type:'trifecta',key,amount:a.amount}));
  }
  function settle(b,m,tickets,payout){
    const stake=tickets.reduce((s,x)=>s+x.amount,0);
    if(stake>b.wallet)throw Error('仮想残高超過');
    const ret=C.settle(tickets,payout),pnl=ret-stake,oldDD=b.peak-b.wallet;
    b.wallet+=pnl;b.peak=Math.max(b.peak,b.wallet);const newDD=b.peak-b.wallet;b.dd=Math.max(b.dd,newDD);
    m.races++;m.participated+=Number(stake>0);m.hits+=Number(ret>0);m.stake+=stake;m.returns+=ret;m.pnl+=pnl;m.maxDrawdown=Math.max(m.maxDrawdown,b.dd);
    // Penalize new drawdown in addition to virtual profit/loss.
    return {pnl,reward:(pnl-RISK*Math.max(0,newDD-oldDD))/1000};
  }
  function finishEpisode(b,m){
    m.episodes++;m.lossEpisodes+=Number(b.wallet<C.INITIAL);m.bustEpisodes+=Number(b.wallet<100);
  }
  function summarize(m){
    return {...m,roi:m.stake?m.returns/m.stake:null,averageEpisodePnL:m.episodes?m.pnl/m.episodes:0,participation:m.races?m.participated/m.races:0};
  }
  class Runner{
    constructor(raw){
      this.cfg=config(raw);this.q=Object.create(null);this.random=C.rng('QLAB/'+this.cfg.seed+'/exploration');this.phase='train';this.i=0;this.done=false;this.pending=null;
      this.trainB=bankroll();this.trainM=metric();this.evalPolicies=[{id:'q',label:'Q学習'},{id:'skip',label:'すべて見送り',action:0},{id:'top1',label:'上位1点・500',action:2},{id:'top10',label:'上位10点・100',action:5}].map(p=>({...p,b:bankroll(),m:metric()}));
      this.curve=[];this.block={pnl:0,reward:0,n:0};this.blockSize=Math.max(1,Math.ceil(this.cfg.train/80));
    }
    row(key){return this.q[key]||(this.q[key]=ACTIONS.map(()=>0));}
    update(p,next,b){
      const row=this.row(p.key),target=p.reward+(next==null?0:GAMMA*Math.max(...allowed(b).map(i=>this.row(next)[i])));
      row[p.action]+=ALPHA*(target-row[p.action]);
    }
    trainOne(){
      const race=card(this.cfg,'train',this.i),f=features(race),b=this.trainB,key=stateKey(b,f,this.i);
      if(this.pending)this.update(this.pending,key,b);
      const valid=allowed(b),epsilon=.35-.30*(this.i/this.cfg.train);
      const action=this.random()<epsilon?valid[Math.floor(this.random()*valid.length)]:pick(this.q,key,b);
      // The action is locked before introducing outcome information.
      const tickets=betFor(action,f),result=C.outcome(race),winning=result.finish.slice(0,3).join('-'),payout={trifecta:{[winning]:Math.floor(f.odds[winning]*100/10)*10}};
      const x=settle(b,this.trainM,tickets,payout);this.pending={key,action,reward:x.reward};
      this.block.pnl+=x.pnl;this.block.reward+=x.reward;this.block.n++;this.i++;
      if(this.i%HORIZON===0||this.i===this.cfg.train){this.update(this.pending,null,b);this.pending=null;finishEpisode(b,this.trainM);this.trainB=bankroll();}
      if(this.block.n>=this.blockSize||this.i===this.cfg.train){this.curve.push({races:this.i,pnlPerRace:this.block.pnl/this.block.n,rewardPerRace:this.block.reward/this.block.n});this.block={pnl:0,reward:0,n:0}}
      if(this.i===this.cfg.train){this.phase='eval';this.i=0;}
    }
    evalOne(){
      const race=card(this.cfg,'eval',this.i),f=features(race);
      const decisions=this.evalPolicies.map(p=>{let a=p.id==='q'?pick(this.q,stateKey(p.b,f,this.i),p.b):p.action;if(!allowed(p.b).includes(a))a=0;return betFor(a,f)});
      const result=C.outcome(race),key=result.finish.slice(0,3).join('-'),payout={trifecta:{[key]:Math.floor(f.odds[key]*100/10)*10}};
      this.evalPolicies.forEach((p,i)=>settle(p.b,p.m,decisions[i],payout));this.i++;
      if(this.i%HORIZON===0||this.i===this.cfg.evaluate)for(const p of this.evalPolicies){finishEpisode(p.b,p.m);p.b=bankroll();}
      if(this.i===this.cfg.evaluate){this.done=true;this.phase='done';}
    }
    step(limit=200){
      for(let j=0;j<limit&&!this.done;j++)this.phase==='train'?this.trainOne():this.evalOne();
      return this.progress();
    }
    progress(){return {phase:this.phase,train:this.phase==='train'?this.i:this.cfg.train,evaluate:this.phase==='train'?0:this.done?this.cfg.evaluate:this.i,trainTotal:this.cfg.train,evalTotal:this.cfg.evaluate,states:Object.keys(this.q).length}};
    report(){
      if(!this.done)throw Error('評価がまだ完了していません');
      return {schema:'boat-q-lab-report-v1',version:VERSION,engine:C.ENGINE,model:C.MODEL,syntheticOnly:true,config:{...this.cfg,horizon:HORIZON,initial:C.INITIAL,alpha:ALPHA,gamma:GAMMA,riskPenalty:RISK,marketTick:0,borrow:false,expenses:false},actions:ACTIONS,training:summarize(this.trainM),evaluation:this.evalPolicies.map(p=>({id:p.id,label:p.label,...summarize(p.m)})),curve:this.curve,states:Object.keys(this.q).length,q:this.q};
    }
  }
  return {Runner,config,card,features,stateKey,betFor,ACTIONS,VERSION};
})();
if(typeof module!=='undefined')module.exports=BoatLab;
