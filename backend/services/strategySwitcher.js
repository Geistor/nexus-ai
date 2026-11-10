'use strict';
const crypto = require('crypto');
function num(v,f=0){ const n=Number(v); return Number.isFinite(n)?n:f; }
function clamp(v,min,max){ return Math.max(min,Math.min(max,num(v,min))); }
function pickStrategyMode(regimeInfo, analytics = {}, symbolInfo = {}) {
  const regime = regimeInfo?.regime || 'sideways'; const winRate = Number(analytics?.summary?.winRate || 0.5); let mode='balanced'; const reasons=[];
  if (regime === 'bull') { mode='trend_follow'; reasons.push('Bull regime -> trend following'); }
  else if (regime === 'bear') { mode='defensive_short_bias'; reasons.push('Bear regime -> defensive short bias'); }
  else { mode='mean_reversion'; reasons.push('Sideways regime -> mean reversion'); }
  if (winRate < 0.4) { mode='capital_preservation'; reasons.push('Gyenge win rate -> capital preservation'); }
  if (symbolInfo?.microstructure?.signal === 'toxic_flow') { mode='defensive'; reasons.push('Toxic flow -> defensive mode'); }
  return { mode, reasons };
}
function strategyHash(value){ return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16); }
function parsePct(text, names, fallback){
  for(const name of names){ const re=new RegExp(`${name}\\s*[:=]?\\s*(\\d+(?:[.,]\\d+)?)\\s*%?`,'i'); const m=String(text).match(re); if(m) return Number(m[1].replace(',','.')); }
  return fallback;
}
function buildStrategyConfigFromText(text='', options={}) {
  const raw=String(text||'').trim(); const lower=raw.toLowerCase(); const unresolved=[];
  const symbols=['BTC/USDT','ETH/USDT','SOL/USDT'].filter(s=>lower.includes(s.toLowerCase().replace('/',''))||lower.includes(s.toLowerCase()));
  const family = /mean|átlag|reversion/.test(lower)?'mean-reversion':/breakout|kitör/.test(lower)?'breakout':/momentum/.test(lower)?'momentum':/scalp/.test(lower)?'scalp':/trend/.test(lower)?'trend':'balanced';
  const regime = /range|oldalaz/.test(lower)?'ranging':/volatile|volatilis/.test(lower)?'volatile':/trend/.test(lower)?'trend':'any';
  const side = /csak\s*(sell|short|eladás)|\bshort\b/.test(lower)?'SELL':/csak\s*(buy|long|vétel)|\blong\b/.test(lower)?'BUY':'BOTH';
  const maxRiskPct=clamp(parsePct(lower,['max risk','max kockázat','kockázat'],0.5),0.05,2);
  const stopLossPct=clamp(parsePct(lower,['stop loss','stoploss','sl'],0.5),0.05,5);
  const takeProfitPct=clamp(parsePct(lower,['take profit','takeprofit','tp'],1),0.05,10);
  const timeframe=(lower.match(/\b(1m|3m|5m|15m|30m|1h|4h)\b/)||[])[1]||'5m';
  if(!raw) unresolved.push('A stratégialeírás üres.');
  if(symbols.length===0) unresolved.push('Nincs megadva támogatott symbol; alapértelmezésként a jelenlegi whitelist használható.');
  if(/martingale|korlátlan\s*dca|all[- ]?in|teljes\s*tőke/i.test(raw)) unresolved.push('Nem támogatott vagy veszélyes kockázati feltétel.');
  const config={ schemaVersion:'nexus-strategy-config-1.0', family, regime, side, symbols:symbols.length?symbols:['BTC/USDT','ETH/USDT','SOL/USDT'], timeframe, risk:{maxRiskPct,stopLossPct,takeProfitPct}, deployment:{initialMode:'shadow',liveAuthority:false,autoPromotion:false}, generatedFrom:'natural-language-constrained-parser' };
  const id=`strat_${strategyHash(config)}`;
  return { ok:unresolved.filter(x=>/veszélyes|üres/.test(x)).length===0, id, config, unresolved, status:unresolved.length?'needs-review':'valid-shadow-config', arbitraryCodeExecution:false, policy:'schema-validated-no-eval-shadow-first' };
}
function buildVisualStrategyGraph(input={}){
  const config=input.config||{}; const blockers=Array.isArray(input.blockers)?input.blockers:[];
  const nodes=[
    {id:'market',label:'Piaci adat',type:'source'},{id:'validate',label:'Adatvalidáció',type:'guard'},{id:'regime',label:`Rezsim: ${config.regime||'any'}`,type:'analysis'},
    {id:'strategy',label:`Stratégia: ${config.family||'balanced'}`,type:'decision'},{id:'signal',label:`Jel: ${config.side||'BOTH'}`,type:'decision'},
    {id:'risk',label:`Risk gate ≤ ${num(config.risk?.maxRiskPct,0.5)}%`,type:'guard'},{id:'sizing',label:'Pozícióméret',type:'guard'},
    {id:'execution',label:'Execution authority',type:'authority'},{id:'exit',label:'Adaptive Exit / lifecycle',type:'exit'},{id:'journal',label:'Journal → Scorecard → Learning',type:'learning'}
  ];
  const edges=nodes.slice(0,-1).map((n,i)=>({from:n.id,to:nodes[i+1].id}));
  return { version:'visual-strategy-graph-1.0', configId:input.id||null, nodes, edges, blockers, executable:false, initialMode:'shadow', policy:'graph-reflects-config-and-runtime-gates-no-direct-code-execution' };
}
module.exports={pickStrategyMode,buildStrategyConfigFromText,buildVisualStrategyGraph};
