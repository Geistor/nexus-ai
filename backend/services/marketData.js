
function toWsStreamSymbol(symbol) {
  return symbol.replace('/', '').toLowerCase();
}

function startPriceSockets(ctx) {
  const WebSocket = require('ws');
  for (const symbol of ctx.CONFIG.symbols) {
    const stream = toWsStreamSymbol(symbol);
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}@trade`);

    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        ctx.state.priceCache.binance = ctx.state.priceCache.binance || {};
        ctx.state.priceCache.binance[symbol] = Number(data.p);
      } catch (_) {}
    });

    ws.on('error', (err) => ctx.helpers.pushLog('WARN', 'Binance WS error', { symbol, message: err.message }));
    ws.on('close', () => ctx.helpers.pushLog('WARN', 'Binance WS closed', { symbol }));
  }
}

async function fetchTickerFast(ctx, exchangeName, symbol) {
  const ex = ctx.exchanges[exchangeName];
  const started = Date.now();
  const ticker = await ex.fetchTicker(symbol);
  const ms = Date.now() - started;

  const prev = ctx.state.latencyStats[exchangeName]?.avgMs || ms;
  ctx.state.latencyStats[exchangeName] = { lastMs: ms, avgMs: Number(((prev * 0.8) + (ms * 0.2)).toFixed(2)) };

  ctx.state.priceCache[exchangeName] = ctx.state.priceCache[exchangeName] || {};
  ctx.state.priceCache[exchangeName][symbol] = ticker.last;
  return ticker.last;
}

async function refreshFastPrices(ctx) {
  const tasks = [];
  for (const exchangeName of ctx.activeExchanges) {
    for (const symbol of ctx.CONFIG.symbols) {
      tasks.push(fetchTickerFast(ctx, exchangeName, symbol).catch(() => null));
    }
  }
  await Promise.all(tasks);
}

module.exports = { startPriceSockets, refreshFastPrices };

// Public full snapshots only. These adapters grant no private/execution rights.
function publicEdgeRoutes(venue,symbol,productType='spot') {
  const v=String(venue).toLowerCase(),s=String(symbol).toUpperCase();
  if(!/^(BTC|ETH|SOL)\/USDT$/.test(s))throw new Error('UNSUPPORTED_PUBLIC_EDGE_SYMBOL');
  const perp=/perp|future|swap/.test(productType),compact=s.replace('/',''),inst=s.replace('/','-')+(perp?'-SWAP':'');
  if(v==='binance')return {depth:perp?`https://fapi.binance.com/fapi/v1/depth?symbol=${compact}&limit=20`:`https://data-api.binance.vision/api/v3/depth?symbol=${compact}&limit=20`,funding:perp?`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${compact}`:null};
  if(v==='bybit')return {depth:`https://api.bybit.com/v5/market/orderbook?category=${perp?'linear':'spot'}&symbol=${compact}&limit=50`,funding:perp?`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${compact}`:null};
  if(v==='okx')return {depth:`https://www.okx.com/api/v5/market/books?instId=${inst}&sz=50`,funding:perp?`https://www.okx.com/api/v5/public/funding-rate?instId=${inst}`:null};
  if(v==='kraken' && !perp)return {depth:`https://api.kraken.com/0/public/Depth?pair=${compact.replace('BTC','XBT')}&count=25`,funding:null};
  throw new Error('UNSUPPORTED_PUBLIC_EDGE_PRODUCT');
}
function parsePublicDepth(venue,symbol,productType,raw,receivedAt=Date.now()) {
  let book=raw;
  if(venue==='bybit'){if(raw.retCode!==0)throw new Error('BYBIT_PUBLIC_ERROR');book=raw.result;if(book?.s!==symbol.replace('/',''))throw new Error('DEPTH_SYMBOL_MISMATCH');}
  if(venue==='okx'){if(String(raw.code)!=='0')throw new Error('OKX_PUBLIC_ERROR');book=raw.data?.[0];}
  if(venue==='kraken'){if(raw.error?.length)throw new Error('KRAKEN_PUBLIC_ERROR');const values=Object.values(raw.result || {});if(values.length!==1)throw new Error('KRAKEN_DEPTH_SHAPE');book=values[0];}
  if(!book || raw.code<0)throw new Error('PUBLIC_DEPTH_ERROR');
  const levels=(rows,bid)=>{if(!Array.isArray(rows) || !rows.length || rows.length>100)throw new Error('DEPTH_LEVELS_MISSING');const result=rows.map(r=>[Number(r[0]),Number(r[1])]);
    if(result.some(r=>!Number.isFinite(r[0]) || !Number.isFinite(r[1]) || r[0]<=0 || r[1]<=0))throw new Error('INVALID_DEPTH_LEVEL');
    if(result.some((r,i)=>i>0 && (bid?r[0]>=result[i-1][0]:r[0]<=result[i-1][0])))throw new Error('UNSORTED_DEPTH');return result;};
  const bids=levels(book.bids || book.b,true),asks=levels(book.asks || book.a,false);if(bids[0][0]>asks[0][0])throw new Error('CROSSED_DEPTH');
  const hasProviderTime=book.ts!=null || book.T!=null || raw.time!=null;const providerTime=Number(book.ts || book.T || raw.time || 0);if(hasProviderTime && !Number.isFinite(providerTime))throw new Error('INVALID_DEPTH_TIMESTAMP');if(providerTime && (!Number.isFinite(providerTime) || providerTime>receivedAt+5000 || receivedAt-providerTime>3000))throw new Error('STALE_DEPTH_RESPONSE');
  return {venue,symbol,productType,bids,asks,sequence:Number(book.lastUpdateId || book.seqId || book.u || 0),transport:'rest-full-snapshot',fullSnapshot:true,providerVerified:true,
    updatedAt:new Date(providerTime || receivedAt).toISOString(),receivedAt,timeBasis:providerTime?'provider':'receipt-no-provider-event-time',source:'own-venue-public-rest-depth'};
}
function parsePublicFunding(venue,symbol,productType,raw,receivedAt=Date.now()) {
  if(!/perp|future|swap/.test(productType))return {status:'not-applicable-spot',fundingRate:null};
  let data=raw;if(venue==='bybit'){if(raw.retCode!==0)throw new Error('BYBIT_FUNDING_ERROR');data=raw.result?.list?.find(r=>r.symbol===symbol.replace('/',''));}
  if(venue==='okx'){if(String(raw.code)!=='0')throw new Error('OKX_FUNDING_ERROR');data=raw.data?.find(r=>r.instId===symbol.replace('/','-')+'-SWAP');}
  if(venue==='binance' && data?.symbol!==symbol.replace('/',''))throw new Error('FUNDING_SYMBOL_MISMATCH');
  const rate=data?.lastFundingRate ?? data?.fundingRate;if(rate==null || rate==='' || !Number.isFinite(Number(rate)))throw new Error('FUNDING_DATA_MISSING');
  const providerTime=Number(raw.time || 0);if(raw.time!=null && !Number.isFinite(providerTime))throw new Error('INVALID_FUNDING_TIMESTAMP');if(providerTime && (providerTime>receivedAt+5000 || receivedAt-providerTime>60000))throw new Error('STALE_FUNDING_RESPONSE');
  const mark=Number(data.markPrice),index=Number(data.indexPrice);
  return {venue,symbol,productType,fundingRate:Number(rate),basisPct:mark>0 && index>0?(mark-index)/index*100:null,updatedAt:receivedAt,source:'own-venue-public-perp-funding',status:'received'};
}
class PublicEdgeFeedCache {
  constructor(fetchFn=global.fetch){this.fetchFn=fetchFn;this.rows=new Map();this.busy=false;}
  key(v,s,p){return [v,s,p].join('|');}
  async request(url){const response=await this.fetchFn(url,{signal:AbortSignal.timeout(3000)});if(!response.ok)throw new Error('PUBLIC_EDGE_HTTP_'+response.status);return response.json();}
  async refresh(markets=[]){
    if(this.busy)return {skipped:true,reason:'already-running'};this.busy=true;
    const unique=[...new Map(markets.slice(0,24).map(m=>[this.key(m.venue,m.symbol,m.productType || 'spot'),m])).entries()];let index=0;const tickStarted=Date.now();
    try {const run=async()=>{while(index<unique.length && Date.now()-tickStarted<15000){const [key,m]=unique[index++],previous=this.rows.get(key);if(previous?.retryAfter>Date.now())continue;
      try {const product=m.productType || 'spot',routes=publicEdgeRoutes(m.venue,m.symbol,product);const depth=parsePublicDepth(m.venue,m.symbol,product,await this.request(routes.depth));
        let funding=null,fundingError=null;if(routes.funding){try{funding=parsePublicFunding(m.venue,m.symbol,product,await this.request(routes.funding));}catch(e){fundingError=e.message;}}
        this.rows.delete(key);this.rows.set(key,{depth,funding,fundingError,status:'received',receivedAt:Date.now()});
      }catch(e){this.rows.set(key,{status:'unavailable',error:e.message,retryAfter:Date.now()+60000});}
    }};await Promise.all([run(),run()]);while(this.rows.size>24)this.rows.delete(this.rows.keys().next().value);return {ok:true,markets:this.rows.size};}
    finally{this.busy=false;}
  }
  get(venue,symbol,productType='spot'){const row=this.rows.get(this.key(venue,symbol,productType));if(!row)return null;const now=Date.now();return {...row,depth:row.depth && now-Date.parse(row.depth.updatedAt)<=3000?row.depth:null,funding:row.funding && now-row.funding.updatedAt<=60000?row.funding:null};}
  status(){return [...this.rows].map(([key,row])=>({key,status:row.status,error:row.error || row.fundingError || null,ageMs:row.receivedAt?Date.now()-row.receivedAt:null,depthFresh:!!this.get(...key.split('|'))?.depth,fundingFresh:!!this.get(...key.split('|'))?.funding,transport:'rest-full-snapshot',privateAuthority:false}));}
}
module.exports.publicEdgeRoutes=publicEdgeRoutes;
module.exports.parsePublicDepth=parsePublicDepth;
module.exports.parsePublicFunding=parsePublicFunding;
module.exports.PublicEdgeFeedCache=PublicEdgeFeedCache;
