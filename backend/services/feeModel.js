function getVenueFeeModel(venueName, marketType = 'future') {
  const table = {
    binance: { spot: { maker: 0.0010, taker: 0.0010 }, future: { maker: 0.0002, taker: 0.0005 } },
    bybit: { spot: { maker: 0.0010, taker: 0.0010 }, future: { maker: 0.0002, taker: 0.00055 } },
    okx: { spot: { maker: 0.0008, taker: 0.0010 }, future: { maker: 0.0002, taker: 0.0005 } },
    kraken: { spot: { maker: 0.0016, taker: 0.0026 }, future: { maker: 0.0002, taker: 0.0005 } }
  };
  return table[venueName]?.[marketType] || { maker: 0.001, taker: 0.0015 };
}
function estimateRoundTripFeePct(venueName, marketType = 'future', sideStyle = 'taker') {
  const fees = getVenueFeeModel(venueName, marketType);
  const oneSide = fees[sideStyle] ?? fees.taker;
  return oneSide * 2;
}
module.exports = { getVenueFeeModel, estimateRoundTripFeePct };
