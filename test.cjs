const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const c=require('./core.js');
const plain=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(Object.values(c.COMBOS).map(a=>a.length),[120,20,30,15,15,6,6]);
// Public BOAT RACE manual: formation/box combinations must be unique and valid.
const all=[1,2,3,4,5,6],take=(type,method,groups,keys)=>Array.from(c.expandBets(type,method,groups,keys));
assert.deepEqual(take('trifecta','formation',[[1],[2,3],[2,3,4]]),['1-2-3','1-2-4','1-3-2','1-3-4']);
assert.equal(take('trifecta','formation',[[1],[2,3],all]).length,8);
assert.equal(take('trifecta','box',[[1,2,3]]).length,6);
assert.equal(take('trifecta','box',[[1,2,3,4]]).length,24);
assert.equal(take('trifecta','box',[all]).length,120);
assert.equal(take('trio','box',[[1,2,3]]).length,1);
assert.equal(take('trio','formation',[all,all,all]).length,20);
assert.equal(take('trio','formation',[[1,2],[1,2],[3]]).length,1);
assert.equal(take('trifecta','flow',[[1],all,all]).length,20);
assert.equal(take('trifecta','flow',[all,[2],all]).length,20);
assert.equal(take('trifecta','flow',[[1],[2],all]).length,4);
assert.equal(take('trifecta','flow',[[1],[1],all]).length,0);
assert.equal(take('trio','flow',[[1],all,all]).length,10);
assert.equal(take('trio','flow',[[1],[2],all]).length,4);
for(const type of ['exacta','quinella','quinella_place']){
  assert.equal(take(type,'flow',[[1],all]).length,5);
  assert.equal(take(type,'box',[all]).length,c.COMBOS[type].length);
}
for(const type of Object.keys(c.TYPES)){
  assert.deepEqual(take(type,'formation',Array.from({length:c.TYPES[type][1]},()=>all)),Array.from(c.COMBOS[type]));
  assert.equal(take(type,'normal',Array.from({length:c.TYPES[type][1]},(_,i)=>[i+1])).length,1);
}
assert.deepEqual(take('trifecta','normal',[[1],[1],[2]]),[]);
assert.deepEqual(take('trifecta','flow',[all,all,all]),[]);
assert.deepEqual(take('win','normal',[[6]]),['6']);
assert.deepEqual(take('place','box',[all]),[]);
assert.deepEqual(take('trifecta','odds',[],['1-2-3','1-2-3','1-1-3','1-2-4']),['1-2-3','1-2-4']);
const prior=[{type:'trifecta',key:'1-2-3',amount:100}];
const merged=c.mergeTickets(prior,[{type:'trifecta',key:'1-2-3',amount:200},{type:'trio',key:'1-2-3',amount:300}],600);
assert.deepEqual(plain(merged),[{type:'trifecta',key:'1-2-3',amount:300},{type:'trio',key:'1-2-3',amount:300}]);
assert.equal(prior[0].amount,100);
assert.throws(()=>c.mergeTickets(prior,[{type:'trifecta',key:'1-2-3',amount:200}],200));
assert.throws(()=>c.mergeTickets(prior,[{type:'trifecta',key:'1-1-3',amount:100}],1000));
assert.throws(()=>c.mergeTickets(prior,[{type:'trifecta',key:'1-2-3',amount:150}],1000));
assert.equal(c.validBetAmount(100),true);assert.equal(c.validBetAmount(0),false);
console.log('PASS: all seven wager types, formation/box/flow/odds selection, duplicate merge, valid stake and wallet limits.');
// Animation timing is a visual-only schematic, aligned with one physical finish line.
for(let lap=0;lap<=3;lap++)for(let radius of [73.5,91,108.5]){
  const p=c.replayPoint(lap,radius);assert.ok(Math.abs(p.x-360)<1e-8);assert.equal(p.y,160+radius);
}
const replay={finish:[4,1,2,6,3,5],firstMark:[1,4,3,2,5,6],actualST:all.map(lane=>({lane,st:.1+lane*.01}))};
assert.equal(c.replayState(replay,-.15).lap,0);
assert.equal(c.replayState(replay,.1).lap,1);
assert.equal(c.replayState(replay,1).lap,2);
assert.equal(c.replayState(replay,2).lap,3);
assert.equal(c.replayState(replay,3).finished,false);
assert.equal(c.replayState(replay,3.2).finished,true);
let previous=new Map();
for(let i=0;i<352;i++){
  const v=c.replayState(replay,-.15+i*.01);
  for(const b of v.order){assert.ok(Number.isFinite(b.progress));assert.ok(b.progress>=(previous.get(b.lane)??-Infinity)-1e-9);previous.set(b.lane,b.progress);}
}
assert.deepEqual(Array.from(c.replayState(replay,3.36).order,b=>b.lane),replay.finish);
assert.equal(c.replayState({...replay,firstMark:null},3.36).finished,true);
console.log('PASS: exact start/goal alignment, monotonic boat progress, three laps and individual finish order.');
const packPath=path.join(__dirname,'private-race-pack.json');
const pack=fs.existsSync(packPath)?c.validatePack(JSON.parse(fs.readFileSync(packPath,'utf8'))):null;
const profiles=pack?.profiles||Array.from({length:24},(_,i)=>({name:`Test ${i}`,win:4+i%5*.5,averageST:.15,grade:'A2',flyingCount:0}));
let total=0,passes=0,winningLanes=new Set,techniques=new Set;
for(let i=0;i<500;i++){
  const r=c.generateRace('test',1+i%20,1+i%24,1+i%12,600,profiles,pack?.venueProfiles?.[1+i%24]);
  assert.equal(new Set(r.boats.map(b=>b.name)).size,6);
  const result=c.outcome(r),dist=c.experimental(r).distribution;
  assert.equal(new Set(result.finish).size,6);
  assert.equal(result.engineVersion,c.ENGINE);
  assert.equal(result.timeline.length,6);
  assert.equal(result.splits.length,6);
  const byCrossing=i=>Array.from([...result.timeline].sort((a,b)=>a.points[i].t-b.points[i].t),b=>b.lane);
  assert.deepEqual(byCrossing(3),Array.from(result.firstMark));
  assert.deepEqual(byCrossing(24),Array.from(result.finish));
  assert.ok(result.actualST.every(a=>a.st>=0&&a.st<1));
  winningLanes.add(result.finish[0]);techniques.add(result.technique);
  if(result.firstMark[0]!==result.finish[0])passes++;
  const end=c.timelineEnd(result.timeline);
  assert.equal(c.timelineState(result.timeline,-18).lap,0);
  assert.equal(c.timelineState(result.timeline,1).lap,1);
  assert.equal(c.timelineState(result.timeline,end+4).finished,true);
  assert.deepEqual(Array.from(c.timelineState(result.timeline,end+4).order,b=>b.lane),Array.from(result.finish));
  for(const b of result.timeline){
    assert.equal(b.points.length,25);
    assert.equal(b.points[0].p,0);
    assert.equal(b.points.at(-1).p,3);
    for(let j=1;j<b.points.length;j++){
      const a=b.points[j-1],z=b.points[j];
      assert.ok(z.t>a.t&&z.p>a.p);
      assert.ok(Math.abs(c.pointAt(b,z.t).p-z.p)<1e-8);
      const q=c.pointAt(b,(a.t+z.t)/2);
      assert.ok(a.p<=q.p&&q.p<=z.p&&q.speed>=0&&Number.isFinite(q.r));
      const pose=c.boatPose(b,(a.t+z.t)/2);
      assert.ok(Number.isFinite(pose.x)&&Number.isFinite(pose.y)&&Number.isFinite(pose.angle));
    }
    const pre=c.boatPose(b,-9.00001),post=c.boatPose(b,-9);
    assert.ok(Math.hypot(pre.x-post.x,pre.y-post.y)<.01);
    assert.ok(Math.abs(c.boatPose(b,b.st).x-360)<1e-8);
  }
  assert.equal(dist.length,120);assert.ok(Math.abs(dist.reduce((n,x)=>n+x[1],0)-1)<1e-8);
  assert.ok(c.brier(dist,result.finish)>=0);
  assert.deepEqual(plain(c.outcome(r)),plain(result));
  const odds=c.market(r,4),pay=c.payoutMaps(r,result,odds);
  let tickets=[];
  for(const type of Object.keys(c.TYPES)){
    for(const key of c.winners(type,result.finish)){
      assert.ok(pay[type][key]>=100);tickets.push({type,key,amount:100});
      total++;
    }
  }
  assert.equal(c.settle(tickets,pay),tickets.reduce((s,t)=>s+pay[t.type][t.key],0));
}
assert.ok(winningLanes.size>=5);assert.ok(techniques.size>=4);assert.ok(passes>0);
console.log(`PASS: 500 sector timelines, ${passes} races with a different first-turn leader and winner, ${winningLanes.size} winning lanes, ${techniques.size} techniques; continuous progress and correct crossings.`);
for(const r of pack?.races||[]){
  const result=c.outcome(r),pay=c.payoutMaps(r,result,{});
  const timeline=c.archiveTimeline(r,result),actual=c.timelineState(timeline,c.timelineEnd(timeline)+4);
  assert.equal(result.firstMark,null);assert.equal(result.splits,undefined);
  assert.equal(result.engineVersion,'ARCHIVE');
  assert.deepEqual(Array.from(actual.order,b=>b.lane),Array.from(r.finish));
  assert.ok(timeline.every(b=>b.points.every((v,i)=>i===0||v.t>b.points[i-1].t)));
  assert.deepEqual(plain(result.actualST),plain(r.actualST));
  assert.equal(r.baseline.distribution.length,120);
  for(const type of Object.keys(c.TYPES))assert.deepEqual(Object.keys(pay[type]).sort(),Array.from(c.winners(type,r.finish)).sort());
  assert.ok(Math.abs(c.experimental(r).distribution.reduce((n,x)=>n+x[1],0)-1)<1e-8);
}
const s=c.newState('blind','sim','normal','test');assert.equal(c.borrow(s),false);
s.wallet-=100;assert.equal(c.borrow(s),true);assert.equal(s.wallet,109900);assert.equal(s.debt,10000);assert.equal(c.net(s),99900);
c.closeDay(s);assert.equal(s.wallet,108900);assert.equal(s.debt,10100);assert.equal(c.net(s),98800);
assert.equal(c.repay(s),true);assert.equal(c.net(s),98800);
s.wallet=0;s.debt=10000;for(let i=0;i<6;i++){c.closeDay(s);assert.equal(s.gameOver,false)}c.closeDay(s);assert.equal(s.gameOver,true);
console.log(`PASS: 500 synthetic races, ${total} winning ticket cases, ${pack?.races.length||0} archived races; 7-day insolvency, loan, interest, repayment, probability normalization and deterministic outcome.`);
// The game and research share exactly the same 3T market and race engine.
const lab=require('./lab.js'),cfg={train:1000,evaluate:240,seed:'test-2026'};
const ids=new Set;
for(const phase of ['train','eval'])for(let i=0;i<96;i++){const r=lab.card(cfg,phase,i);assert.ok(!ids.has(r.id));ids.add(r.id);assert.deepEqual(c.market3(r,0),c.market(r,0).trifecta)}
const l1=new lab.Runner(cfg);
while(l1.phase==='train')l1.step(1);
const qBefore=JSON.stringify(l1.q);
while(!l1.done)l1.step(23);
assert.equal(JSON.stringify(l1.q),qBefore);
const l2=new lab.Runner(cfg);while(!l2.done)l2.step(311);
const result=l1.report();assert.deepEqual(plain(l2.report()),plain(result));
assert.equal(result.training.races,cfg.train);assert.ok(result.states>0);
for(const m of result.evaluation){assert.equal(m.races,cfg.evaluate);assert.equal(m.pnl,m.returns-m.stake);assert.equal(m.episodes,5);assert.ok(m.participation>=0&&m.participation<=1)}
const skip=result.evaluation.find(m=>m.id==='skip');assert.equal(skip.pnl,0);assert.equal(skip.roi,null);assert.equal(skip.stake,0);
assert.throws(()=>new lab.Runner({train:1000001,evaluate:1}));
console.log('PASS: distinct training/evaluation race IDs, exact game odds, deterministic Q learning across chunk sizes, frozen evaluation, four identical-race comparison policies.');
