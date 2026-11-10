function num(v,f=0){ const n=Number(v); return Number.isFinite(n)?n:f; }
function sumDepth(levels=[]){ return (Array.isArray(levels)?levels:[]).reduce((s,row)=>s+Math.max(0,num(Array.isArray(row)?row[1]:row?.qty ?? row?.size ?? row?.amount,0)),0); }
function scoreOrderbook(snapshot = {}, options = {}) {
  const bids = Array.isArray(snapshot.bids) ? snapshot.bids : [];
  const asks = Array.isArray(snapshot.asks) ? snapshot.asks : [];
  const bidDepth = num(snapshot.bidDepth, sumDepth(bids));
  const askDepth = num(snapshot.askDepth, sumDepth(asks));
  const bestBid = num(snapshot.bestBid ?? snapshot.bid ?? (Array.isArray(bids[0])?bids[0][0]:bids[0]?.price),0);
  const bestAsk = num(snapshot.bestAsk ?? snapshot.ask ?? (Array.isArray(asks[0])?asks[0][0]:asks[0]?.price),0);
  const mid = bestBid>0 && bestAsk>0 ? (bestBid+bestAsk)/2 : num(snapshot.mid ?? snapshot.price,0);
  const spreadBps = Number.isFinite(Number(snapshot.spreadBps)) ? Number(snapshot.spreadBps) : (bestBid>0 && bestAsk>0 && mid>0 ? ((bestAsk-bestBid)/mid)*10000 : num(snapshot.spreadPct,0)*100);
  const updatedAtMs = Date.parse(snapshot.updatedAt || snapshot.time || snapshot.ts || '') || num(snapshot.timeMs,0);
  const ageMs = updatedAtMs ? Math.max(0, Date.now()-updatedAtMs) : null;
  const maxAgeMs = Math.max(250, num(options.maxAgeMs,3000));
  const sequence = num(snapshot.sequence ?? snapshot.seq,0);
  const previousSequence = num(options.previousSequence,0);
  const fullSnapshot=snapshot.fullSnapshot===true && snapshot.providerVerified===true && snapshot.transport==='rest-full-snapshot';
  const sequenceGap = !fullSnapshot && previousSequence>0 && sequence>0 ? Math.max(0, sequence-previousSequence-1) : 0;
  const hasDepth = bids.length>0 && asks.length>0 && bidDepth>0 && askDepth>0;
  const imbalance = hasDepth ? (bidDepth-askDepth)/Math.max(1e-12,bidDepth+askDepth) : 0;
  const fresh = ageMs === null ? false : ageMs<=maxAgeMs;
  const sequenceOk = sequenceGap===0;
  const trusted = hasDepth && fresh && sequenceOk && spreadBps>=0;
  const depthTotal = bidDepth+askDepth;
  const liquidityScore = trusted ? Math.max(0,Math.min(100, 55 + Math.log10(Math.max(1,depthTotal))*8 - Math.max(0,spreadBps-5)*1.4)) : 0;
  let signal='unavailable';
  if (trusted) {
    signal='neutral';
    if (imbalance>0.15 && spreadBps<8) signal='buy_pressure';
    else if (imbalance<-0.15 && spreadBps<8) signal='sell_pressure';
    else if (spreadBps>20) signal='wide_spread_caution';
  } else if (hasDepth && !fresh) signal='stale_orderbook';
  else if (sequenceGap>0) signal='sequence_gap';
  else if (!hasDepth) signal='insufficient_depth';
  return {
    version:'orderbook-intelligence-2.0', signal, trusted, fresh, sequence, sequenceOk, sequenceGap, ageMs, maxAgeMs,
    bidDepth:Number(bidDepth.toFixed(6)), askDepth:Number(askDepth.toFixed(6)), depthTotal:Number(depthTotal.toFixed(6)),
    imbalance:Number(imbalance.toFixed(4)), spreadBps:Number(spreadBps.toFixed(3)), liquidityScore:Number(liquidityScore.toFixed(1)),
    confidence:trusted?Number(Math.max(0.3,Math.min(0.95,0.5+Math.abs(imbalance)*0.65+liquidityScore/500)).toFixed(2)):0,
    dataStatus:trusted?'validated-orderbook':signal,
    sequenceValidation:fullSnapshot?'full-snapshot-no-delta-continuity-claim':'delta-sequence-gap',
    policy:'depth-spread-imbalance-freshness-sequence-gap-validation-no-fabricated-depth'
  };
}
module.exports={scoreOrderbook};
