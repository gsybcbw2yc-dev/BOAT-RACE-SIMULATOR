'use strict';
// Research-only, tabular Q learning. Never uses the user's game state or private data.
const BoatLab=(()=>{
  const C=typeof module!=='undefined'?require('./core.js'):Core;
  const VERSION='QLAB-1.1', HORIZON=48, ALPHA=.12, GAMMA=.96, RISK=.25;
  const B=typeof module!=='undefined'?require('./model-bridge.js'):ModelBridge;
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
    const model=raw.model??'experimental';if(model!=='experimental'&&!B.IDS[model])throw Error('未知の予測モデル');
    return {train,evaluate,seed,model};
  }
  function card(cfg,phase,i){
    // Separate seed namespaces ensure no generated race ID is reused in evaluation.
    return C.generateRace('QLAB/'+cfg.seed+'/'+phase,1+Math.floor(i/HORIZON),1+(i%24),1+Math.floor((i%HORIZON)/24),600+i%48*5,C.DEMO);
  }
  function features(race,predict=C.experimental){
    const distribution=predict(race).distribution,odds=C.market3(race,0),top=distribution.slice(0,10);
    if(distribution.length!==120||distribution.some(x=>!Number.isFinite(x[1])||x[1]<0)||Math.abs(distribution.reduce((s,x)=>s+x[1],0)-1)>1e-8)throw Error('固定モデルの確率分布が不正です');
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
    constructor(raw,engine=null,real=null){
      this.cfg=config(raw);this.q=Object.create(null);this.random=C.rng('QLAB/'+this.cfg.seed+'/exploration');this.phase='train';this.i=0;this.done=false;this.pending=null;
      this.predict=this.cfg.model==='experimental'?C.experimental:B.predictor(this.cfg.model,engine);
      this.real=real;if(real){if(!Array.isArray(real.train)||!Array.isArray(real.eval)||!real.train.length||!real.eval.length)throw Error('実レースの学習・評価データが不足しています');this.cfg.train=real.train.length;this.cfg.evaluate=real.eval.length;}
      this.trainB=bankroll();this.trainM=metric();this.evalPolicies=[{id:'q',label:'Q学習'},{id:'skip',label:'すべて見送り',action:0},{id:'top1',label:'上位1点・500',action:2},{id:'top10',label:'上位10点・100',action:5}].map(p=>({...p,b:bankroll(),m:metric()}));
      this.curve=[];this.block={pnl:0,reward:0,n:0};this.blockSize=Math.max(1,Math.ceil(this.cfg.train/80));
    }
    race(phase,i){return this.real?this.real[phase][i]:card(this.cfg,phase,i)}
    payout(race,f){if(!race.sim)return race.payouts;const result=C.outcome(race),winning=result.finish.slice(0,3).join('-');return {trifecta:{[winning]:Math.floor(f.odds[winning]*100/10)*10}}}
    row(key){return this.q[key]||(this.q[key]=ACTIONS.map(()=>0));}
    update(p,next,b){
      const row=this.row(p.key),target=p.reward+(next==null?0:GAMMA*Math.max(...allowed(b).map(i=>this.row(next)[i])));
      row[p.action]+=ALPHA*(target-row[p.action]);
    }
    trainOne(){
      const race=this.race('train',this.i),f=features(race,this.predict),b=this.trainB,key=stateKey(b,f,this.i);
      if(this.pending)this.update(this.pending,key,b);
      const valid=allowed(b),epsilon=.35-.30*(this.i/this.cfg.train);
      const action=this.random()<epsilon?valid[Math.floor(this.random()*valid.length)]:pick(this.q,key,b);
      // The action is locked before introducing outcome information.
      const tickets=betFor(action,f),payout=this.payout(race,f);
      const x=settle(b,this.trainM,tickets,payout);this.pending={key,action,reward:x.reward};
      this.block.pnl+=x.pnl;this.block.reward+=x.reward;this.block.n++;this.i++;
      if(this.i%HORIZON===0||this.i===this.cfg.train){this.update(this.pending,null,b);this.pending=null;finishEpisode(b,this.trainM);this.trainB=bankroll();}
      if(this.block.n>=this.blockSize||this.i===this.cfg.train){this.curve.push({races:this.i,pnlPerRace:this.block.pnl/this.block.n,rewardPerRace:this.block.reward/this.block.n});this.block={pnl:0,reward:0,n:0}}
      if(this.i===this.cfg.train){this.phase='eval';this.i=0;}
    }
    evalOne(){
      const race=this.race('eval',this.i),f=features(race,this.predict);
      const decisions=this.evalPolicies.map(p=>{let a=p.id==='q'?pick(this.q,stateKey(p.b,f,this.i),p.b):p.action;if(!allowed(p.b).includes(a))a=0;return betFor(a,f)});
      const payout=this.payout(race,f);
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
      return {schema:'boat-q-lab-report-v1',version:VERSION,engine:this.real?'verified-real-replay':C.ENGINE,model:this.cfg.model==='experimental'?C.MODEL:B.IDS[this.cfg.model],...(this.cfg.model==='experimental'?{}:{modelPack:{siteCommit:B.COMMIT,sha256:B.SHA}}),syntheticOnly:!this.real,...(this.real?{data:this.real.summary}:{}),config:{...this.cfg,horizon:HORIZON,initial:C.INITIAL,alpha:ALPHA,gamma:GAMMA,riskPenalty:RISK,marketTick:0,borrow:false,expenses:false},actions:ACTIONS,training:summarize(this.trainM),evaluation:this.evalPolicies.map(p=>({id:p.id,label:p.label,...summarize(p.m)})),curve:this.curve,states:Object.keys(this.q).length,q:this.q};
    }
  }
  return {Runner,config,card,features,stateKey,betFor,ACTIONS,VERSION};
})();
if(typeof module!=='undefined')module.exports=BoatLab;
