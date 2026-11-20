'use strict';
// Core: deterministic generation, independent predictor, market and accounting.
const VERSION='0.4.0', MODEL='EXP-PL-0.1', INITIAL=100000, LOAN_LIMIT=100000, KEY='boat-sim-v1', N=[1,2,3,4,5,6];
const COLORS=['#fff','#30343b','#ef565d','#3b91e9','#f6ce43','#3cbe78'];
const VENUES=['','桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
const TYPES={trifecta:['3連単',3,true],trio:['3連複',3,false],exacta:['2連単',2,true],quinella:['2連複',2,false],quinella_place:['拡連複',2,false],win:['単勝',1,true],place:['複勝',1,true]};
const COST={practice:0,normal:1000,hard:3000}, DIFFICULTY={practice:'練習',normal:'ノーマル',hard:'ハード'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));const sum=a=>a.reduce((x,y)=>x+y,0);const round=(v,d=2)=>Math.round(v*10**d)/10**d;
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0};
function rng(seed){let x=hash(seed);return()=>{x=(x+0x6D2B79F5)|0;let z=Math.imul(x^x>>>15,1|x);z^=z+Math.imul(z^z>>>7,61|z);return ((z^z>>>14)>>>0)/4294967296}}
const range=(r,a,b)=>a+(b-a)*r();const time=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;const jst=ms=>{let d=new Date(ms+9*3600000);return d.getUTCHours()*60+d.getUTCMinutes()};
function perm(n,arr=N,p=[]){return n===0?[p]:arr.flatMap(x=>perm(n-1,arr.filter(y=>y!==x),[...p,x]))}
const ALL3=perm(3);const comboKey=(type,a)=>{let b=[...a];if(!TYPES[type][2])b.sort((x,y)=>x-y);return b.join('-')};
const COMBOS=Object.fromEntries(Object.entries(TYPES).map(([k,[,n,ordered]])=>[k,[...new Set(perm(n).map(a=>comboKey(k,a)))]]));
// The same legal combination set is shared by the UI and settlement engine.
function expandBets(type,method,groups=[],oddsKeys=[]){
  if(!TYPES[type])return [];
  const [,n]=TYPES[type],legal=COMBOS[type],clean=g=>[...new Set((Array.isArray(g)?g:[]).filter(x=>N.includes(x)))];
  if(method==='odds'){let keys=new Set(oddsKeys);return legal.filter(k=>keys.has(k))}
  if(method==='box'){if(n===1)return [];let lanes=new Set(clean(groups[0]));return legal.filter(k=>k.split('-').every(x=>lanes.has(+x)))}
  if(!['normal','formation','flow'].includes(method)||groups.length!==n)return [];
  let rows=groups.map(clean);
  if(method==='normal'&&rows.some(g=>g.length!==1))return [];
  if(method==='flow'&&(n===1||rows.some(g=>g.length!==1&&g.length!==6)||!rows.some(g=>g.length===1)||!rows.some(g=>g.length===6)))return [];
  let keys=new Set;
  function visit(i,p){if(i===n){keys.add(comboKey(type,p));return}for(let lane of rows[i])if(!p.includes(lane))visit(i+1,[...p,lane])}
  visit(0,[]);return legal.filter(k=>keys.has(k));
}
const validBetAmount=x=>Number.isSafeInteger(x)&&x>=100&&x%100===0;
function mergeTickets(cart,additions,balance){
  if(!Number.isFinite(balance)||!additions.length||additions.some(t=>!COMBOS[t.type]?.includes(t.key)||!validBetAmount(t.amount)))throw Error('100円単位の有効な買い目を指定してください');
  let m=new Map;for(let t of [...cart,...additions]){let id=t.type+'|'+t.key,old=m.get(id);m.set(id,{type:t.type,key:t.key,amount:(old?.amount||0)+t.amount})}
  let next=[...m.values()],total=sum(next.map(t=>t.amount));if(!Number.isSafeInteger(total)||total>balance)throw Error('所持金を超えています');return next;
}
function winners(type,finish){if(type==='quinella_place')return [[0,1],[0,2],[1,2]].map(a=>comboKey(type,a.map(i=>finish[i])));if(type==='place')return finish.slice(0,2).map(String);return [comboKey(type,finish.slice(0,TYPES[type][1]))]}
function pl(weights){let out=ALL3.map(a=>{let left=sum(weights),p=1;for(let n of a){p*=weights[n-1]/left;left-=weights[n-1]}return [a.join('-'),p]});return out.sort((a,b)=>b[1]-a[1])}
function marg(dist){let out=Array.from({length:6},()=>[0,0,0]);for(let [k,p] of dist)k.split('-').forEach((n,i)=>out[+n-1][i]+=p);return out}
function score(b,weather){let c=b.course||b.lane;let factors={course:[1.46,.5,.19,.05,-.22,-.47][c-1],skill:(b.win-5.2)*.32,motor:(b.motor-34)*.019,exhibit:(6.85-b.exhibit)*1.8,start:(Number.isFinite(b.averageST)?(.17-b.averageST)*4.0:0)-((b.flyingCount||0)*.08),local:((b.localWin||b.win)-b.win)*.09,wind:(weather.wind||0)*(.015*(c-3))};return {factors,score:sum(Object.values(factors))}}
function experimental(race){let ss=race.boats.map(b=>score(b,race.weather));let d=pl(ss.map(s=>Math.exp(s.score)));return {id:MODEL,distribution:d,details:ss.map(x=>x.factors),firstMark:ss.map((s,i)=>({lane:i+1,s:s.score+s.factors.start*.8})).sort((a,b)=>b.s-a.s).map(x=>x.lane)}}
const DEMO=Array.from({length:30},(_,i)=>({registrationNumber:null,name:`デモ選手 ${String(i+1).padStart(2,'0')}`,grade:['A1','A2','B1','B1','B2'][i%5],win:4.1+(i%13)*.29,averageST:.13+(i%7)*.013,flyingCount:i%9===0?1:0,nationalTop2:25+i%30,nationalTop3:40+i%30}));
function generateRace(seed,day,venue,no,minute,profiles,venueProfile){ let id=`sim/${seed}/${day}/${venue}/${no}`,r=rng(id+'/card'),pool=profiles.filter(p=>Number.isFinite(p.averageST)),weather={wind:Math.floor(range(r,0,7)),wave:Math.floor(range(r,1,6)),windDir:['追い風','向かい風','横風'][Math.floor(r()*3)]};let boats=N.map(lane=>{let p=pool.splice(Math.floor(r()*pool.length),1)[0];return {...p,lane,course:lane,localWin:round(clamp(p.win+range(r,-1.2,1.2),2,9)),motor:round(range(r,21,52)),motorNumber:Math.floor(range(r,10,81)),exhibit:round(range(r,6.65,7.05)),st:round(clamp(p.averageST+range(r,-.09,.09),.01,.36)).toFixed(2)}});let prior=[.53,.14,.12,.10,.07,.04],n=venueProfile?.n||0,venueBias=prior.map((p,i)=>clamp(Math.log(((venueProfile?.w?.[i]||0)+p*36)/(n+36)/p),-.65,.65));return {id,date:`DAY ${day}`,venue,no,minute,boats,weather,sim:true,venueBias,venueN:n}}
// Simulator generation only: the timeline is calculated before revealing any outcome.
// Normal six-boat races; no F/L, accidents or refunds are generated.
const ENGINE='SECTOR-1.0', TRACK_LENGTH=760+2*Math.PI*91;
const TURN_ENTRY=190/TRACK_LENGTH,TURN_APEX=(190+Math.PI*91/2)/TRACK_LENGTH,TURN_EXIT=(190+Math.PI*91)/TRACK_LENGTH;
const SECTORS=[0,TURN_ENTRY,TURN_APEX,TURN_EXIT,.5,TURN_ENTRY+.5,TURN_APEX+.5,TURN_EXIT+.5,1];
const RACE_POINTS=[0,...Array.from({length:3},(_,l)=>SECTORS.slice(1).map(p=>p+l)).flat()];
const soft=(u)=>u*u*(3-2*u);
const courseRadius=c=>91+(c-3.5)*7;
function raceSplitTimes(timeline){
  return timeline.map(b=>({lane:b.lane,course:b.course,st:b.st,times:[3,8,16,24].map(i=>round(b.points[i].t))}));
}
function simulateRace(race){
  const rand=rng(race.id+'/'+ENGINE),weather=race.weather||{},wave=clamp(Number(weather.wave)||0,0,10),wind=clamp(Number(weather.wind)||0,0,12);
  const boats=race.boats.map(b=>{
    const course=b.course||b.lane,st=round(clamp((b.averageST??.17)+range(rand,-.115,.115)+.012*(b.flyingCount||0),.01,.39));
    const skill=clamp((b.win-5)*.017+(b.motor-35)*.0022+(6.85-b.exhibit)*.13+((b.localWin??b.win)-b.win)*.006+range(rand,-.059,.059),-.19,.19);
    const attack=course===1?'逃げ':course===2?(rand()<.7?'差し':'まくり'):rand()<.38?'まくり差し':rand()<.65?'まくり':'差し';
    return {lane:b.lane,course,st,skill,attack,stable:range(rand,-.035,.035),points:[{p:0,t:st,r:courseRadius(course)}]};
  });
  for(let i=1;i<RACE_POINTS.length;i++){
    const prev=RACE_POINTS[i-1],p=RACE_POINTS[i],leg=(i-1)%8+1,lap=Math.floor((i-1)/8),turn=[2,3,6,7].includes(leg),first=lap===0&&leg<=3;
    const ordered=[...boats].sort((a,b)=>a.points[i-1].t-b.points[i-1].t);
    const previous=boats.map(b=>({lane:b.lane,...b.points[i-1]}));
    for(const b of boats){
      const old=b.points[i-1],pos=ordered.indexOf(b),ahead=previous.filter(a=>a.lane!==b.lane&&a.t<old.t&&old.t-a.t<1.65&&Math.abs(a.r-old.r)<22);
      let r=turn?clamp(74+pos*5.3+(b.lane-3.5)*1.35,65,111):clamp(80+pos*4.5+(b.lane-3.5)*2,65,112);
      if(first){
        if(leg===1)r=courseRadius(b.course);
        if(leg===2)r=b.attack==='逃げ'?72:b.attack==='差し'?clamp(72+b.course*2,76,91):b.attack==='まくり'?clamp(91+b.course*3,96,111):clamp(88+b.course*3,96,111);
        if(leg===3)r=b.attack==='まくり差し'?75+b.course*2:b.attack==='差し'?76+b.course*2:r;
      }
      const windFactor=weather.windDir==='向かい風'?(leg===1||leg===8?-.002*wind:.002*wind):weather.windDir==='追い風'?(leg===1||leg===8?.002*wind:-.002*wind):0;
      let pace=1+b.skill+b.stable+range(rand,-.047,.047)+windFactor-wave*.0025+(6-b.course)*.0048+(pos===0&&!first?.015:0);
      // Shorter inner turns, outside attack momentum, and wash from a nearby boat.
      let path=turn?1+(r-91)*.0045:1;
      if(first&&leg===1)pace+=(.18-b.st)*.48+(6-b.course)*.028;
      if(first&&turn){pace+=(6-b.course)*.006+(race.venueBias?.[b.course-1]||0)*.018;if(b.attack==='まくり')pace+=leg===2?.055:-.018;if(b.attack==='差し'||b.attack==='まくり差し')pace+=leg===3?.045:-.013}
      if(ahead.length)pace-=Math.min(.08,ahead.length*(turn?.034:.015));
      let duration=(p-prev)*34*(turn?1.19:.88)*path/clamp(pace,.68,1.40);
      // A close first turn can swing either way; independent race-day noise.
      if(first&&leg===3)duration+=range(rand,-.72,.72)+(b.course-1)*.12;
      b.points.push({p,t:old.t+Math.max(.65,duration),r});
    }
  }
  const firstMark=[...boats].sort((a,b)=>a.points[3].t-b.points[3].t).map(b=>b.lane);
  const finish=[...boats].sort((a,b)=>a.points.at(-1).t-b.points.at(-1).t).map(b=>b.lane);
  const winner=boats.find(b=>b.lane===finish[0]),technique=firstMark[0]!==winner.lane?'抜き':winner.course===1?'逃げ':winner.attack;
  return {finish,firstMark,technique,actualST:boats.map(b=>({lane:b.lane,st:b.st,course:b.course})),payouts:null,engineVersion:ENGINE,timeline:boats,splits:raceSplitTimes(boats)};
}
function outcome(race){
  if(!race.sim)return {finish:race.finish,technique:race.technique,payouts:race.payouts,actualST:race.actualST,firstMark:null,engineVersion:'ARCHIVE'};
  return simulateRace(race);
}
// Actual races use only known course/ST and finish. Intermediate splits and routes are fictional.
function archiveTimeline(race,result){
  const random=rng(race.id+'/archive-replay-1'),st=result.actualST||[],courses=N.map(n=>Number(st.find(x=>x.lane===n)?.course??race.boats.find(x=>x.lane===n)?.course??n));
  const valid=courses.every(n=>N.includes(n))&&new Set(courses).size===6;
  return N.map((lane,i)=>{
    let course=valid?courses[i]:lane,record=st.find(x=>x.lane===lane),start=Number(record?.st),known=record?.st!=null&&Number.isFinite(start)&&start>=0&&start<1;
    if(!known)start=.16;
    const f=result.finish.indexOf(lane),early=clamp(f+range(random,-1.95,1.95),0,5),finish=102+f*1.12+range(random,0,.3);
    let points=RACE_POINTS.map((p,j)=>{
      if(j===0)return {p,t:start,r:courseRadius(course)};
      if(j===24)return {p,t:finish,r:courseRadius(course)};
      const mix=clamp(p/2,0,1),turn=[2,3,6,7].includes((j-1)%8+1),t=start+p*(finish-start)/3+(early-f)*(1-mix)*Math.min(p*3,1)*1.1+range(random,-.13,.13);
      return {p,t,r:clamp((turn?73:82)+(early*(1-mix)+f*mix)*5.2+(lane-3.5)*1.8,65,112)};
    });
    return {lane,course,st:known?start:null,attack:'推定',points};
  });
}
function timelineEnd(timeline){return Math.max(...timeline.map(b=>b.points.at(-1).t))}
function pointAt(boat,t){
  const points=boat.points,first=points[0],end=points.at(-1);
  if(t<first.t){let u=clamp((t+9)/(first.t+9),0,1);return {p:-.14*(1-u**1.45),r:first.r,speed:.14*1.45*Math.pow(u,.45)/(first.t+9)}}
  if(t>=end.t)return {p:3+Math.min(.07,(t-end.t)*.018),r:end.r,speed:t-end.t<3.8?.018:0};
  let i=1;while(points[i].t<t)i++;
  const a=points[i-1],b=points[i],duration=b.t-a.t,u=clamp((t-a.t)/duration,0,1),sec=(b.p-a.p)/duration;
  const prev=points[i-2],next=points[i+1],harm=(x,y)=>2*x*y/(x+y),m0=prev?harm(sec,(a.p-prev.p)/(a.t-prev.t)):sec,m1=next?harm(sec,(next.p-b.p)/(next.t-b.t)):sec;
  const p=(2*u**3-3*u**2+1)*a.p+(u**3-2*u**2+u)*duration*m0+(-2*u**3+3*u**2)*b.p+(u**3-u**2)*duration*m1;
  const speed=((6*u*u-6*u)*a.p+(3*u*u-4*u+1)*duration*m0+(-6*u*u+6*u)*b.p+(3*u*u-2*u)*duration*m1)/duration;
  return {p:clamp(p,a.p,b.p),r:a.r+(b.r-a.r)*soft(u),speed:Math.max(0,speed)};
}
function boatPose(boat,t){
  const sample=pointAt(boat,t);
  if(t< -9){
    const target=replayPoint(-.14,sample.r),u=clamp((t+18)/9,0,1),v=1-u,x0=56+(boat.course-1)*12,y0=145+(boat.course-1)*7,x1=x0+12,x2=target.x-33,y1=y0+18,y2=target.y;
    const x=v**3*x0+3*v*v*u*x1+3*v*u*u*x2+u**3*target.x,y=v**3*y0+3*v*v*u*y1+3*v*u*u*y2+u**3*target.y;
    const dx=3*v*v*(x1-x0)+6*v*u*(x2-x1)+3*u*u*(target.x-x2),dy=3*v*v*(y1-y0)+6*v*u*(y2-y1)+3*u*u*(target.y-y2);
    return {...sample,x,y,angle:Math.atan2(dy,dx)};
  }
  const a=replayPoint(sample.p,sample.r),before=pointAt(boat,t-.075),b=replayPoint(before.p,before.r);
  const ahead=replayPoint(sample.p+.001,sample.r),angle=Math.hypot(a.x-b.x,a.y-b.y)>.01?Math.atan2(a.y-b.y,a.x-b.x):Math.atan2(ahead.y-a.y,ahead.x-a.x);
  return {...sample,...a,angle};
}
function timelineState(timeline,t){
  let order=timeline.map(b=>({lane:b.lane,course:b.course,st:b.st,attack:b.attack,finishAt:b.points.at(-1).t,...boatPose(b,t)})).sort((a,b)=>b.p-a.p||a.finishAt-b.finishAt);
  const leader=order[0],lap=leader.p<0?0:Math.min(3,Math.floor(leader.p)+1),finished=order.every(b=>t>=b.finishAt),fraction=leader.p-Math.floor(leader.p);
  const phase=t< -12?'ピットアウト':t< -9?'待機・進入':t<0?'スタート助走':lap===0?'スタートライン':finished?'FINISH・全艇ゴール':leader.p>=3?'ゴール・後続艇通過中':fraction<TURN_ENTRY?(lap===1?'スタート・1Mへ':lap===3?'最終周回':'第2周回'):fraction<TURN_EXIT?'第1ターンマーク':fraction<TURN_ENTRY+.5?'バックストレッチ':fraction<TURN_EXIT+.5?'第2ターンマーク':lap===3?'最終直線':'ホームストレッチ';
  return {order,lap,finished,phase,leader,fraction};
}
function marketDistribution(race,tick){let r=rng(race.id+'/market/'+tick);return pl(race.boats.map(b=>Math.exp([1.7,.48,.10,-.10,-.22,-.3][b.lane-1]+(race.venueBias?.[b.lane-1]||0)*.6+(b.win-5)*.28+(b.motor-35)*.013+range(r,-.15,.15))))}
function market3(race,tick=0){if(!race.sim)return Object.fromEntries(race.officialOdds);return Object.fromEntries(marketDistribution(race,tick).map(([k,p])=>[k,Math.max(1,Math.floor(.75/Math.max(p,.00001)*10)/10)]))}
function market(race,tick){if(!race.sim)return {trifecta:Object.fromEntries(race.officialOdds)};let dist=marketDistribution(race,tick);let maps={};for(let type of Object.keys(TYPES)){let p=Object.fromEntries(COMBOS[type].map(k=>[k,0]));for(let [key,val] of dist){let a=key.split('-').map(Number);for(let w of winners(type,a))p[w]+=val}maps[type]=Object.fromEntries(Object.entries(p).map(([k,v])=>[k,Math.max(1,Math.floor(.75/Math.max(v,.00001)*10)/10)]))}return maps}
function normalizePayouts(p){let out={};for(let t of Object.keys(TYPES))out[t]=Object.fromEntries((p[t]||[]).map(x=>[x.combination.split(/[-=]/).map(Number).sort(TYPES[t][2]?()=>0:(a,b)=>a-b).join('-'),x.amount]));return out}
function payoutMaps(race,result,odds){if(!race.sim)return normalizePayouts(result.payouts);return Object.fromEntries(Object.keys(TYPES).map(t=>[t,Object.fromEntries(winners(t,result.finish).map(k=>[k,Math.floor(odds[t][k]*100/10)*10]))]))}
function settle(tickets,pay){return tickets.reduce((v,t)=>v+(pay[t.type]?.[t.key]||0)*(t.amount/100),0)}
function newState(mode,kind,difficulty,seed=String(Date.now())){return {version:1,mode,kind,difficulty,seed,day:1,wallet:INITIAL,debt:0,negativeDays:0,clock:0,logs:[],days:[],gameOver:false,peak:INITIAL,drawdown:0,processed:[],replayIndex:0,expenses:0,interest:0}}
function net(s){return s.wallet-s.debt}function loss(s){return net(s)-INITIAL}function drawdown(s){s.peak=Math.max(s.peak,net(s));s.drawdown=Math.max(s.drawdown,s.peak-net(s))}function canBorrow(s){return loss(s)<0&&s.debt+10000<=LOAN_LIMIT&&!s.gameOver}
function borrow(s){if(!canBorrow(s))return false;s.wallet+=10000;s.debt+=10000;return true}
function repay(s){let x=Math.min(10000,s.debt,Math.max(0,s.wallet));if(x<=0)return false;s.wallet-=x;s.debt-=x;return true}
function closeDay(s){let fee=COST[s.difficulty],interest=Math.ceil(s.debt*.01);s.wallet-=fee;s.debt+=interest;s.expenses+=fee;s.interest+=interest;s.negativeDays=net(s)<0?s.negativeDays+1:0;drawdown(s);s.days.push({day:s.day,net:net(s),wallet:s.wallet,debt:s.debt,fee,interest});s.gameOver=s.negativeDays>=7;s.day++;s.clock=0;s.processed=[];s.replayIndex++}
function brier(dist,finish){let m=marg(dist);return sum(m.map((x,i)=>(x[0]-(i+1===finish[0]?1:0))**2))}
function validatePack(d){if(d?.schema!=='boat-simulator-data-v1'||!Array.isArray(d.races)||!Array.isArray(d.profiles)||d.profiles.length<6)throw Error('対応するデータパックではありません');let ids=new Set;for(let r of d.races){if(ids.has(r.id)||!Number.isFinite(r.deadline)||r.boats?.length!==6||!r.boats.every((b,i)=>b.lane===i+1&&typeof b.name==='string'&&[b.win,b.motor,b.exhibit].every(Number.isFinite)&&(b.averageST==null||Number.isFinite(b.averageST)))||r.finish?.length!==6||new Set(r.finish).size!==6||!r.finish.every(x=>N.includes(x))||r.baseline?.distribution?.length!==120||r.officialOdds?.length!==120||!(Date.parse(r.baseline.captured)<r.deadline)||!(Date.parse(r.oddsAt)<r.deadline)||!Object.keys(TYPES).every(t=>Array.isArray(r.payouts?.[t])))throw Error('無効なレース: '+r.id);ids.add(r.id);for(let rows of [r.baseline.distribution,r.officialOdds])if(new Set(rows.map(x=>x[0])).size!==120||!rows.every(x=>COMBOS.trifecta.includes(x[0])&&Number.isFinite(x[1])&&x[1]>=0))throw Error('買い目データが不正です');if(Math.abs(sum(r.baseline.distribution.map(x=>x[1]))-1)>1e-6)throw Error('確率合計が不正です')}if(!d.profiles.every(p=>typeof p.name==='string'&&Number.isFinite(p.win)&&(p.averageST==null||Number.isFinite(p.averageST))))throw Error('選手データが不正です');return d}
// The start/goal line is progress 0; unit distance is one full lap.
function replayPoint(progress,radius=91){
  const straight=380,arc=Math.PI*91,length=2*straight+2*arc;
  let d=((progress*length%length)+length)%length;
  if(d<190)return {x:360+d,y:160+radius};
  d-=190;
  if(d<arc){let a=Math.PI/2-d/91;return {x:550+radius*Math.cos(a),y:160+radius*Math.sin(a)}}
  d-=arc;
  if(d<straight)return {x:550-d,y:160-radius};
  d-=straight;
  if(d<arc){let a=-Math.PI/2-d/91;return {x:170+radius*Math.cos(a),y:160+radius*Math.sin(a)}}
  return {x:170+d-arc,y:160+radius};
}
function replayState(result,t){
  const rank=result.finish,early=result.firstMark||rank,st=result.actualST||[],firstTurn=(190+Math.PI*91/2)/(760+2*Math.PI*91);
  let order=N.map(lane=>{
    let e=early.indexOf(lane),f=rank.indexOf(lane),start=clamp(Number(st.find(b=>b.lane===lane)?.st??.15),0,.5)*.11;
    const points=[[-.15,-.15-start],[start,0],[firstTurn+e*.028,firstTurn],[1+e*.038,1],[2+f*.038,2],[3+f*.038,3]];
    let progress=points[0][1];
    for(let i=1;i<points.length;i++){let [a,p]=points[i-1],[b,q]=points[i];if(t>=b){progress=q;continue}progress=p+(q-p)*clamp((t-a)/(b-a),0,1);break}
    if(t>points[5][0])progress=3+Math.min(.065,(t-points[5][0])*.42);
    return {lane,progress,finishAt:points[5][0]};
  }).sort((a,b)=>b.progress-a.progress||a.finishAt-b.finishAt);
  const leader=order[0].progress,lap=leader<0?0:Math.min(3,Math.floor(leader)+1),finished=order.every(b=>b.progress>=3);
  let fraction=leader-Math.floor(leader),phase=lap===0?'スタート準備':finished?'FINISH・全艇ゴール':leader>=3?'ゴール・後続艇通過中':fraction<.08?(lap===1?'スタート':lap===3?'最終周回':'第2周回'):fraction<.36&&fraction>.16?'第1ターンマーク':fraction>.65&&fraction<.86?'第2ターンマーク':lap===3?'最終周回・直線':'道中・順位変動';
  return {order,lap,finished,phase};
}
const Core={perm,COMBOS,TYPES,pl,marg,experimental,generateRace,outcome,market,payoutMaps,settle,newState,borrow,repay,closeDay,net,loss,brier,validatePack,winners,expandBets,mergeTickets,validBetAmount,replayPoint,replayState,simulateRace,archiveTimeline,timelineState,timelineEnd,pointAt,boatPose,raceSplitTimes,ENGINE,RACE_POINTS,market3,DEMO,rng,INITIAL,MODEL};if(typeof module!=='undefined')module.exports=Core;
