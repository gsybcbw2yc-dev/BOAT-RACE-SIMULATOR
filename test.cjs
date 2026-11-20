const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const ctx={module:{exports:{}}};
vm.runInNewContext(html.split('<script>')[1].split('</script>')[0],ctx);
const c=ctx.module.exports;
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
let total=0;
for(let i=0;i<500;i++){
  const r=c.generateRace('test',1+i%20,1+i%24,1+i%12,600,profiles,pack?.venueProfiles?.[1+i%24]);
  assert.equal(new Set(r.boats.map(b=>b.name)).size,6);
  const result=c.outcome(r),dist=c.experimental(r).distribution;
  assert.equal(new Set(result.finish).size,6);
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
for(const r of pack?.races||[]){
  const result=c.outcome(r),pay=c.payoutMaps(r,result,{});
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
