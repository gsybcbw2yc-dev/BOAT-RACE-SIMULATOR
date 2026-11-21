'use strict';
// Import raw privately held V58 GitHub sync batches, not public/live data.
const RealData=(()=>{
  const C=typeof module!=='undefined'?require('./core.js'):Core;
  const tables=['collection_forecasts','collection_odds','collection_archive_results','collection_official_payouts','collection_result_corrections'];
  const time=s=>Date.parse(s),jst=t=>new Date(t+9*3600000).toISOString().slice(0,10);
  function prepare(batches){
    if(!Array.isArray(batches)||!batches.length)throw Error('V58同期バッチを選択してください');
    const maps=Object.fromEntries(tables.map(k=>[k,new Map]));
    for(const batch of batches){
      if(batch?.schema!==1||!/^\d{4}-\d{2}-\d{2}$/.test(batch.date)||!batch.tables||tables.slice(0,4).some(k=>!Array.isArray(batch.tables[k])))throw Error('同期バッチの形式が不正です');
      for(const k of tables)for(const row of batch.tables[k]||[]){
        if(typeof row.race_id!=='string'||!row.race_id.startsWith(batch.date+'/'))throw Error('バッチのレースIDが不一致です');
        const prior=maps[k].get(row.race_id);
        if(prior&&JSON.stringify(prior)!==JSON.stringify(row))throw Error('同じレースに競合する観測があります');
        maps[k].set(row.race_id,row);
      }
    }
    const races=[];let excluded=0;
    for(const [id,f] of maps.collection_forecasts){
      let x,o,odds,a,p,c;
      try{
        x=JSON.parse(f.inputs_json);o=maps.collection_odds.get(id);a=maps.collection_archive_results.get(id);p=maps.collection_official_payouts.get(id);c=maps.collection_result_corrections.get(id);
        if(!['A','B'].includes(x.qualityTier)||f.model_id!=='V4-PL-2026-10-12'||!o||!a||f.date<='2026-11-16'||id!==f.date+'/'+String(f.venue).padStart(2,'0')+'/'+f.race_no)throw Error('unverified');
        if(!Number.isFinite(f.deadline_ms)||!Number.isFinite(time(f.fetched_at))||!Number.isFinite(time(f.captured_at))||!Number.isFinite(time(o.fetched_at))||time(f.fetched_at)>time(f.captured_at)||time(f.captured_at)>time(o.fetched_at)||time(o.fetched_at)>=f.deadline_ms||jst(time(f.captured_at))!==f.date||jst(time(o.fetched_at))!==f.date)throw Error('timing');
        const officialBase='https://www.boatrace.jp/owpc/pc/race/',payUrl=officialBase+'pay?hd='+f.date.replaceAll('-','');
        function officialRace(url,path){const u=new URL(url);return u.origin==='https://www.boatrace.jp'&&u.pathname==='/owpc/pc/race/'+path&&u.searchParams.get('hd')===f.date.replaceAll('-','')&&+u.searchParams.get('jcd')===+f.venue&&+u.searchParams.get('rno')===+f.race_no}
        if(!officialRace(o.source_url,'odds3t')||!officialRace(x.programEvidence?.source,'racelist')||!officialRace(x.previewEvidence?.source,'beforeinfo')||![x.programEvidence,x.previewEvidence].every(e=>Number.isFinite(time(e.fetchedAt))&&time(e.fetchedAt)<=time(f.captured_at)))throw Error('official provenance');
        const result=c||a,official=c||p;
        if(!official||result.state!=='normal'||result.finish!==official.finish||result.payout!==official.payout||official.source_url!==payUrl||!Number.isFinite(time(result.fetched_at))||!Number.isFinite(time(official.fetched_at))||jst(time(result.fetched_at))<=f.date||jst(time(official.fetched_at))<=f.date||!C.COMBOS.trifecta.includes(result.finish)||!Number.isSafeInteger(result.payout)||result.payout<=0)throw Error('result');
        odds=JSON.parse(o.odds_json);
        if(!Array.isArray(odds)||odds.length!==120||new Set(odds.map(v=>v[0])).size!==120||odds.some(v=>!C.COMBOS.trifecta.includes(v[0])||!Number.isFinite(v[1])||v[1]<1))throw Error('odds');
        if(!Array.isArray(x.boats)||x.boats.length!==6||x.boats.some((b,i)=>b.lane!==i+1||b.active===false||b.integratedInput!==true||!Number.isInteger(b.registrationNumber)||b.registrationNumber<=0||!Number.isFinite(b.exhibit)||!/^F?(?:0?\.\d+|0|1(?:\.0+)?)$/.test(b.st)||!Number.isInteger(b.course))||new Set(x.boats.map(b=>b.course)).size!==6||new Set(x.boats.map(b=>b.registrationNumber)).size!==6)throw Error('input');
        races.push({id,date:f.date,venue:f.venue,no:f.race_no,deadline:f.deadline_ms,boats:x.boats,courseAssumed:false,weather:x.weather,sim:false,officialOdds:odds,payouts:{trifecta:{[result.finish]:result.payout}}});
      }catch{excluded++}
    }
    races.sort((a,b)=>a.deadline-b.deadline||a.id.localeCompare(b.id));
    const days=[...new Set(races.map(r=>r.date))];if(days.length<2)throw Error('公式品質A/B・照合済みの実レースが2開催日以上必要です（現在 '+races.length+'R / '+days.length+'日）');
    const split=days[Math.max(1,Math.floor(days.length*.7))],train=races.filter(r=>r.date<split),evalR=races.filter(r=>r.date>=split);
    return {train,eval:evalR,summary:{eligible:races.length,excluded,trainEnd:train.at(-1).date,evalStart:split,quality:'A/B',sourcePublicationVerified:false}};
  }
  return {prepare};
})();
if(typeof module!=='undefined')module.exports=RealData;
