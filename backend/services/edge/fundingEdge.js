function num(v,f=0){ const n=Number(v); return Number.isFinite(n)?n:f; }
function fundingBias(data = {}) {
  const productType=String(data.productType || data.marketType || 'spot').toLowerCase();
  const perpetual=/perp|future|swap/.test(productType);
  if (!perpetual) return { version:'funding-intelligence-2.0', supported:false, status:'not-applicable-spot', bias:'neutral', fundingRate:null, basisPct:null, expectedFundingCostPct:0, policy:'no-funding-on-spot' };
  if (data.fundingRate==null || data.fundingRate==='' || !Number.isFinite(Number(data.fundingRate))) return { version:'funding-intelligence-2.0', supported:true, status:'funding-data-missing', bias:'neutral', fundingRate:null, basisPct:data.basisPct!=null && Number.isFinite(Number(data.basisPct))?Number(data.basisPct):null, expectedFundingCostPct:null, policy:'missing-data-explicit-no-fabrication' };
  const fundingRate=num(data.fundingRate,0); const basisPct=data.basisPct==null?null:num(data.basisPct,0); const holdIntervals=Math.max(0,num(data.holdIntervals,1));
  let bias='neutral';
  if (fundingRate>0.0001 && basisPct>0.2) bias='short_bias';
  else if (fundingRate<-0.0001 && basisPct<-0.2) bias='long_bias';
  return { version:'funding-intelligence-2.0', supported:true, status:'validated', bias, fundingRate, basisPct, expectedFundingCostPct:Number((Math.abs(fundingRate)*100*holdIntervals).toFixed(5)), policy:'venue-product-specific-funding-only' };
}
module.exports={fundingBias};
