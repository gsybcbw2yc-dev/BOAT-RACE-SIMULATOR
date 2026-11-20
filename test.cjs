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
