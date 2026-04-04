
let chart, candleSeries, ema20Series, ema50Series, slLine = null, tpLine = null;
let availableSymbols = [];

async function keszitPersistenciaSnapshotot(){
  const label = prompt('Adj nevet a mentésnek:', 'manual');
  if(label === null) return;
  const res = await fetch('/api/persistence/snapshot', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ label })
  });
  const out = await res.json().catch(()=>({}));
  if(!res.ok || out.error){
    alert(out.error || 'Nem sikerült AI mentést készíteni.');
    return;
  }
  alert('AI mentés elkészült.');
  await refresh();
}


let utolsoDashboardAdat = null;

function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

async function kerAIReszletesElemzest(symbol, tipus){
  try{
    const res = await fetch('/api/ai/explain', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ symbol, tipus })
    });
    const out = await res.json();
    if(!res.ok || out.error){
      alert(out.error || 'Nem sikerült lekérni az elemzést.');
      return;
    }
    megjelenitAIReszletesElemzest(symbol, tipus, out);
  }catch(e){
    alert('Nem sikerült lekérni az elemzést.');
  }
}


async function kerTradeElemzest(tradeId){
  try{
    const res = await fetch('/api/ai/trade-explain', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ tradeId })
    });
    const out = await res.json();
    if(!res.ok || out.error){
      alert(out.error || 'Nem sikerült lekérni a trade elemzést.');
      return;
    }
    const cel = document.getElementById(`trade-extra-${tradeId}`);
    if(!cel) return;
    cel.innerHTML = `
      <div class="extra-elemzes-fejlec">Trade elemzés</div>
      <div class="extra-elemzes-torzs">${escapeHtml(out.szoveg || '')}</div>
    `;
  }catch(e){
    alert('Nem sikerült lekérni a trade elemzést.');
  }
}

function megjelenitAIReszletesElemzest(symbol, tipus, out){
  const cel = document.getElementById(`ai-extra-${symbol.replaceAll('/','_')}`);
  if(!cel) return;
  const cimMap = {
    piaci_osszefoglalo: 'Piaci összefoglaló',
    kockazati_osszefoglalo: 'Kockázati összefoglaló',
    belepesi_indoklas: 'Belépési indoklás',
    kilepesi_indoklas: 'Kilépési indoklás'
  };
  cel.innerHTML = `
    <div class="extra-elemzes-fejlec">${cimMap[tipus] || 'AI elemzés'}</div>
    <div class="extra-elemzes-torzs">${escapeHtml(out.szoveg || '')}</div>
  `;
}


function usd(n){ return '$'+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function pct(n){ return (Number(n||0)*100).toFixed(2)+'%'; }

function magyarDontesMagyarazat(d){
  if(!d) return 'Nincs AI döntés.';
  const actionMap = { BUY:'VÉTEL', SELL:'ELADÁS', HOLD:'TARTÁS' };
  const action = actionMap[d.action] || d.action || 'ISMERETLEN';
  const conf = pct(d.confidence || 0);
  const reasons = Array.isArray(d.reasons) ? d.reasons : [];

  let intro = `AI döntés: ${action}. Bizonyosság: ${conf}.`;
  if((d.action || '') === 'BUY') intro += ' A rendszer vételi lehetőséget látott.';
  if((d.action || '') === 'SELL') intro += ' A rendszer eladási vagy short lehetőséget látott.';
  if((d.action || '') === 'HOLD') intro += ' A rendszer szerint most érdemes kivárni.';

  if(!reasons.length) return intro + ' Nem érkezett részletes indoklás.';
  return intro + ' Indokok: ' + reasons.join(' | ');
}


function initChart() {
  chart = LightweightCharts.createChart(document.getElementById('tvchart'), {
    layout:{ background:{ color:'#101a2b' }, textColor:'#ebf3ff' },
    grid:{ vertLines:{ color:'rgba(255,255,255,.06)' }, horzLines:{ color:'rgba(255,255,255,.06)' } },
    rightPriceScale:{ borderColor:'#223553' },
    timeScale:{ borderColor:'#223553', timeVisible:true, secondsVisible:false }
  });
  candleSeries = chart.addCandlestickSeries({ upColor:'#22dd88', downColor:'#ff687f', borderVisible:false, wickUpColor:'#22dd88', wickDownColor:'#ff687f' });
  ema20Series = chart.addLineSeries({ color:'#1fe1ff', lineWidth:2, priceLineVisible:false });
  ema50Series = chart.addLineSeries({ color:'#ffc95a', lineWidth:2, priceLineVisible:false });
  window.addEventListener('resize', ()=>chart.applyOptions({ width: document.getElementById('tvchart').clientWidth }));
}

async function act(url){
  const res = await fetch(url,{method:'POST', headers:{'Content-Type':'application/json'}});
  const out = await res.json().catch(()=>({}));
  if (out.error) alert(out.error);
  await refresh();
}

async function connectExchange(exchange){
  const payload = {
    exchange,
    apiKey: document.getElementById(`${exchange}_apiKey`)?.value || '',
    apiSecret: document.getElementById(`${exchange}_apiSecret`)?.value || '',
    passphrase: document.getElementById(`${exchange}_passphrase`)?.value || '',
    marketType: document.getElementById(`${exchange}_marketType`)?.value || 'future',
    marginMode: document.getElementById(`${exchange}_marginMode`)?.value || 'cross',
    leverage: Number(document.getElementById(`${exchange}_leverage`)?.value || 3),
    useSandbox: !!document.getElementById(`${exchange}_sandbox`)?.checked
  };
  const res = await fetch('/api/exchanges/connect', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  const out = await res.json().catch(()=>({}));
  if (!res.ok || out.error) alert(out.error || 'Connection failed');
  await refreshExchangeÁllapot();
  await refresh();
}

async function disconnectExchange(exchange){
  const res = await fetch('/api/exchanges/disconnect', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ exchange })
  });
  const out = await res.json().catch(()=>({}));
  if (!res.ok || out.error) alert(out.error || 'Disconnect failed');
  await refreshExchangeÁllapot();
  await refresh();
}

async function refreshExchangeÁllapot() {
  const res = await fetch('/api/exchanges/status');
  const out = await res.json();
  (out.exchanges || []).forEach(item => {
    const el = document.getElementById(`${item.exchange}_status`);
    if (!el) return;
    const d = item.details || {};
    el.textContent = item.connected
      ? `Kapcsolat · ${d.marketType || '-'} · ${d.marginMode || '-'} · Lev ${d.leverage || '-'} · Sandbox: ${d.useSandbox ? 'ON' : 'OFF'} · Szabad USDT: ${usd(d.balancePreview?.usdtFree || 0)}`
      : 'Not connected';
  });
}

async function loadChart() {
  const symbol = document.getElementById('chartSymbol').value;
  const timeframe = document.getElementById('chartTimeframe').value;
  document.getElementById('chartÁllapot').textContent = 'Betöltés...';
  const res = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);
  const data = await res.json();
  candleSeries.setData(data.candles || []);
  ema20Series.setData(data.ema20 || []);
  ema50Series.setData(data.ema50 || []);
  candleSeries.setMarkers(data.markers || []);
  if (slLine) { candleSeries.removePriceLine(slLine); slLine = null; }
  if (tpLine) { candleSeries.removePriceLine(tpLine); tpLine = null; }
  if (data.openPosition) {
    slLine = candleSeries.createPriceLine({ price:data.openPosition.stopLoss, color:'#ff687f', lineWidth:2, lineStyle:LightweightCharts.LineStyle.Dashed, axisLabelVisible:true, title:'SL' });
    tpLine = candleSeries.createPriceLine({ price:data.openPosition.takeProfit, color:'#22dd88', lineWidth:2, lineStyle:LightweightCharts.LineStyle.Dashed, axisLabelVisible:true, title:'TP' });
  }
  chart.timeScale().fitContent();
  document.getElementById('chartÁllapot').textContent = `${data.symbol} · ${data.timeframe}`;
}

async function refresh(){
  const res = await fetch('/api/dashboard');
  const data = await res.json();
  const s = data.state || {};
  utolsoDashboardAdat = data;
  document.getElementById('equity').textContent = usd(s.equity);
  document.getElementById('pnlDay').textContent = pct((s.equity - s.dailyStartEquity)/Math.max(1,s.dailyStartEquity)) + ' ma';
  document.getElementById('modelState').textContent = s.modelLoaded ? 'NN ON' : 'Tartalék mód';
  document.getElementById('modelInfo').textContent = s.modelInfo?.activeVersion || s.modelInfo?.backend || '-';
  document.getElementById('botState').innerHTML = '<span class="dot '+(s.botEnabled?'g':'rr')+'"></span> '+(s.botEnabled?'ON':'OFF');
  document.getElementById('killState').innerHTML = '<span class="dot '+(s.killSwitch?'rr':'g')+'"></span> '+(s.killSwitch?'ACTIVE':'SAFE');
  document.getElementById('winRate').textContent = pct(s.stats?.winRate || 0);
  document.getElementById('tradeCount').textContent = (s.stats?.totalTrades || 0)+' kötés';

  if(!availableSymbols.length){
    availableSymbols = data.config?.symbols || [];
    const sel = document.getElementById('chartSymbol');
    availableSymbols.forEach(sym=>{
      const opt = document.createElement('option');
      opt.value = sym; opt.textContent = sym;
      sel.appendChild(opt);
    });
    if(availableSymbols.length) await loadChart();
  }

  document.getElementById('decisions').innerHTML = Object.entries(s.aiDecision || {}).map(([sym,d]) =>
    '<div class="logItem"><strong>'+sym+'</strong> - '+d.action+' ('+pct(d.confidence)+')'
    +'<div class="muted">'+(d.source||'-')+' '+(d.modelVersion||'')+'</div>'
    +'<div class="magyarázat">'+magyarDontesMagyarazat(d)+'</div>'
    +'<div class="extra-ai-gombok">'
      +'<button class="s mini" onclick="kerAIReszletesElemzest(\''+sym+'\',\'piaci_osszefoglalo\')">Piaci összefoglaló</button>'
      +'<button class="s mini" onclick="kerAIReszletesElemzest(\''+sym+'\',\'kockazati_osszefoglalo\')">Kockázati összefoglaló</button>'
      +'<button class="s mini" onclick="kerAIReszletesElemzest(\''+sym+'\',\'belepesi_indoklas\')">Belépési indoklás</button>'
      +'<button class="s mini" onclick="kerAIReszletesElemzest(\''+sym+'\',\'kilepesi_indoklas\')">Kilépési indoklás</button>'
    +'</div>'
    +'<div id="ai-extra-'+sym.replaceAll('/','_')+'" class="extra-elemzes-doboz"></div>'
    +((d.reasons||[]).map(r=>'<div class="reason">'+r+'</div>').join(''))
    +'</div>'
  ).join('');

  const openPositions = Object.values(s.openPositions || {});
  document.getElementById('positions').innerHTML = openPositions.length
    ? openPositions.map(p =>
      '<div class="logItem"><strong>'+p.symbol+'</strong> '+p.side+' @ '+(p.venue||'-')+
      '<div class="kv"><div class="muted">Entry</div><div>'+usd(p.entry)+'</div><div class="muted">SL</div><div>'+usd(p.stopLoss)+'</div><div class="muted">TP</div><div>'+usd(p.takeProfit)+'</div><div class="muted">Size</div><div>'+p.size+'</div><div class="muted">Allokáció</div><div>'+Number(p.allocationMultiplier||1).toFixed(2)+'x</div><div class="muted">Slippage</div><div>'+((Number(p.estimatedSlippagePct||0)*100).toFixed(4))+'%</div></div></div>'
    ).join('')
    : '<div class="muted">Nincs nyitott pozíció</div>';

  const balances = s.venueBalances || {};
  const latency = s.latencyStats || {};
  const exchangeConnections = s.exchangeConnections || {};
  document.getElementById('latency').innerHTML = Object.keys({...balances, ...latency, ...exchangeConnections}).map(name => {
    const b = balances[name] || exchangeConnections[name]?.balancePreview || {};
    const l = latency[name] || {};
    const c = exchangeConnections[name] || {};
    return '<div class="logItem"><strong>'+name+'</strong><div class="kv"><div class="muted">Kapcsolat</div><div>'+(c.connected ? 'IGEN' : 'NEM')+'</div><div class="muted">Szabad USDT</div><div>'+usd(b.usdtFree || 0)+'</div><div class="muted">Margin mód</div><div>'+(c.marginMode || '-')+'</div><div class="muted">Tőkeáttétel</div><div>'+(c.leverage || '-')+'</div><div class="muted">Átlagos késleltetés</div><div>'+(l.avgMs || '-')+' ms</div></div></div>';
  }).join('');

  document.getElementById('arb').innerHTML = (data.arbitrage || []).map(a =>
    '<tr><td>'+a.symbol+'</td><td>'+a.buyExchange+' @ '+usd(a.buyPrice)+'</td><td>'+a.sellExchange+' @ '+usd(a.sellPrice)+'</td><td>'+pct(a.grossEdgePct)+'</td><td>'+pct(a.netEdgePct)+'</td></tr>'
  ).join('');

  document.getElementById('pendingBox').innerHTML = Object.values(data.pendingOrders || {}).length
    ? Object.values(data.pendingOrders || {}).map(o =>
      '<div class="logItem"><strong>'+o.symbol+'</strong> '+o.side+' @ '+o.venue+
      '<div class="kv"><div class="muted">Kért mennyiség</div><div>'+o.requestedQty+'</div><div class="muted">Teljesült</div><div>'+o.filledQty+'</div><div class="muted">Hátralévő</div><div>'+o.remainingQty+'</div><div class="muted">Állapot</div><div>'+o.status+'</div></div></div>'
    ).join('')
    : '<div class="muted">Nincs függő megbízás</div>';

  const tr = s.training || {};

  const retention = s.retentionStats || {};
  const lastRet = s.maintenance?.retention || {};
  const lastRetText = lastRet.lastRunAt ? new Date(lastRet.lastRunAt).toLocaleString() : '-';

  const openList = Object.values(s.openPositions || {});
  const avgAlloc = openList.length ? (openList.reduce((a,b)=>a+Number(b.allocationMultiplier||1),0)/openList.length) : 0;
  const avgSlip = openList.length ? (openList.reduce((a,b)=>a+Number(b.estimatedSlippagePct||0),0)/openList.length) : 0;

  const persistence = s.persistence || {};
  document.getElementById('persistenceBox').innerHTML = `
    <div class="logItem"><strong>Storage gyökér:</strong> ${persistence.storageRoot || '-'}</div>
    <div class="logItem"><strong>Aktív modell:</strong> ${persistence.activeModel?.version || persistence.learningState?.activeModelVersion || '-'}</div>
    <div class="logItem"><strong>Eltárolt modellverziók:</strong> ${persistence.modelVersions ?? 0}</div>
    <div class="logItem"><strong>Eltárolt trade események:</strong> ${persistence.persistedTradeEvents ?? 0}</div>
    <div class="logItem"><strong>Utolsó snapshot:</strong> ${persistence.learningState?.lastSnapshotAt || '-'}</div>
    <div class="logItem"><strong>Utolsó merge:</strong> ${persistence.learningState?.lastMergedAt || '-'}</div>
  `;

  document.getElementById('profitBox').innerHTML = `
    <div class="logItem"><strong>AI motor:</strong> RL + ensemble döntéshozás</div>
    <div class="logItem"><strong>Execution optimalizálás:</strong> aktív</div>
    <div class="logItem"><strong>Slippage becslés:</strong> ${(avgSlip*100).toFixed(4)}% átlag a nyitott pozícióknál</div>
    <div class="logItem"><strong>Capital allocation:</strong> ${avgAlloc ? avgAlloc.toFixed(2)+'x átlagos szorzó' : 'még nincs aktív pozíció'}</div>
  `;

  document.getElementById('retentionBox').innerHTML = `
    <div class="logItem"><strong>Élő piaci fájlok:</strong> ${retention.liveMarketFiles ?? 0}</div>
    <div class="logItem"><strong>Archív tömörített fájlok:</strong> ${retention.archivedMarketFiles ?? 0}</div>
    <div class="logItem"><strong>Dataset fájlok:</strong> ${retention.datasetFiles ?? 0}</div>
    <div class="logItem"><strong>Modellverzió mappák:</strong> ${retention.modelVersionDirs ?? 0}</div>
    <div class="logItem"><strong>Utolsó adatkarbantartás:</strong> ${lastRetText}</div>
    <div class="logItem"><strong>Utolsó eredmény:</strong><pre>${JSON.stringify(lastRet.lastResult || {}, null, 2)}</pre></div>
  `;

  document.getElementById('trainingBox').innerHTML = `
    <div class="logItem"><strong>Fut:</strong> ${tr.running ? 'IGEN' : 'NEM'}</div>
    <div class="logItem"><strong>Aktív verzió:</strong> ${tr.activeVersion || '-'}</div>
    <div class="logItem"><strong>Jelölt verzió:</strong> ${tr.candidateVersion || '-'}</div>
    <div class="logItem"><strong>Utolsó futás:</strong> ${tr.lastRunAt ? new Date(tr.lastRunAt).toLocaleString() : '-'}</div>
    <div class="logItem"><strong>Utolsó eredmény:</strong><pre>${JSON.stringify(tr.lastResult || {}, null, 2)}</pre></div>
  `;

  document.getElementById('alerts').innerHTML = (data.alerts||[]).map(a => '<div class="logItem"><strong>'+a.type.toUpperCase()+'</strong> - '+a.title+'<div class="muted">'+a.time+'</div></div>').join('');
  document.getElementById('logs').innerHTML = (data.logs||[]).map(l => '<div class="logItem"><strong>'+l.level+'</strong> - '+l.message+'<div class="muted">'+l.time+'</div></div>').join('');
  document.getElementById('trades').innerHTML = (data.closedTrades||[]).map((t, i) => {
    const tradeId = t.tradeId || ('trade_'+i+'_'+String(t.closedAt||'').replaceAll(':','-').replaceAll('.','-'));
    return '<tr>'
      +'<td>'+t.closedAt+'</td>'
      +'<td>'+t.symbol+'</td>'
      +'<td>'+(t.venue||'-')+'</td>'
      +'<td>'+t.side+'</td>'
      +'<td>'+usd(t.entry)+'</td>'
      +'<td>'+usd(t.exit)+'</td>'
      +'<td>'+(t.pnl>=0?'+':'')+usd(t.pnl)+'</td>'
      +'<td>'+t.reason+'<div style="margin-top:8px"><button class="s mini" onclick="kerTradeElemzest(\''+tradeId+'\')">Trade elemzés</button></div><div id="trade-extra-'+tradeId+'" class="extra-elemzes-doboz"></div></td>'
      +'</tr>';
  }).join('');

  await refreshExchangeÁllapot();
}

initChart();
refresh();
setInterval(async ()=>{ await refresh(); if(availableSymbols.length) await loadChart(); }, 5000);
