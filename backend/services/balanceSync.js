async function fetchVenueBalances(exchanges) {
  const out = {};
  for (const [name, ex] of Object.entries(exchanges)) {
    try {
      const b = await ex.fetchBalance();
      out[name] = { usdtFree: b.USDT?.free ?? b.free?.USDT ?? 0, usdtTotal: b.USDT?.total ?? b.total?.USDT ?? 0 };
    } catch (err) {
      out[name] = { usdtFree: 0, usdtTotal: 0, error: err.message };
    }
  }
  return out;
}
module.exports = { fetchVenueBalances };
