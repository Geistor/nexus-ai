const ccxt = require('ccxt');

function buildClient(exchangeName, creds = {}) {
  const common = {
    apiKey: creds.apiKey || '',
    secret: creds.apiSecret || '',
    enableRateLimit: true,
  };

  if (exchangeName === 'binance') {
    return new ccxt.binance({
      ...common,
      options: { defaultType: creds.marketType || 'future' }
    });
  }
  if (exchangeName === 'okx') {
    return new ccxt.okx({
      ...common,
      password: creds.passphrase || '',
    });
  }
  if (exchangeName === 'bybit') {
    return new ccxt.bybit(common);
  }
  if (exchangeName === 'kraken') {
    return new ccxt.kraken(common);
  }
  throw new Error(`Nem támogatott tőzsde: ${exchangeName}`);
}

async function connectExchange(ctx, payload) {
  const exchangeName = String(payload.exchange || '').toLowerCase();
  const creds = {
    apiKey: payload.apiKey || '',
    apiSecret: payload.apiSecret || '',
    passphrase: payload.passphrase || '',
    marketType: payload.marketType || 'future',
    marginMode: payload.marginMode || 'cross',
    leverage: Number(payload.leverage || 3),
    useSandbox: !!payload.useSandbox
  };

  if (!exchangeName) throw new Error('Hiányzó tőzsde');
  if (!creds.apiKey || !creds.apiSecret) throw new Error('Hiányzó API kulcs vagy titok');

  const client = buildClient(exchangeName, creds);

  if (creds.useSandbox || ctx.CONFIG.useSandbox) {
    try { client.setSandboxMode(true); } catch (_) {}
  }

  await client.loadMarkets();

  let balancePreview = {};
  try {
    const bal = await client.fetchBalance();
    balancePreview = {
      usdtFree: bal.USDT?.free ?? bal.free?.USDT ?? 0,
      usdtTotal: bal.USDT?.total ?? bal.total?.USDT ?? 0
    };
  } catch (_) {}

  ctx.exchanges[exchangeName] = client;
  if (!ctx.activeExchanges.includes(exchangeName)) ctx.activeExchanges.push(exchangeName);
  if (!ctx.state.priceCache[exchangeName]) ctx.state.priceCache[exchangeName] = {};
  if (!ctx.state.latencyStats[exchangeName]) ctx.state.latencyStats[exchangeName] = {};

  // kept only in-memory for WS auth and trading
  ctx.state.exchangeSecrets = ctx.state.exchangeSecrets || {};
  ctx.state.exchangeSecrets[exchangeName] = {
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
    passphrase: creds.passphrase
  };

  ctx.state.exchangeConnections[exchangeName] = {
    connected: true,
    connectedAt: new Date().toISOString(),
    marketType: creds.marketType,
    marginMode: creds.marginMode,
    leverage: creds.leverage,
    useSandbox: creds.useSandbox || ctx.CONFIG.useSandbox,
    hasPassphrase: !!creds.passphrase,
    balancePreview
  };

  ctx.helpers.pushLog('INFO', 'Tőzsde sikeresen csatlakoztatva', {
    exchange: exchangeName,
    marketType: creds.marketType,
    marginMode: creds.marginMode,
    leverage: creds.leverage,
    sandbox: creds.useSandbox || ctx.CONFIG.useSandbox
  });

  return {
    exchange: exchangeName,
    connected: true,
    marketType: creds.marketType,
    marginMode: creds.marginMode,
    leverage: creds.leverage,
    useSandbox: creds.useSandbox || ctx.CONFIG.useSandbox,
    balancePreview
  };
}

function disconnectExchange(ctx, exchangeName) {
  const name = String(exchangeName || '').toLowerCase();
  delete ctx.exchanges[name];
  ctx.activeExchanges = ctx.activeExchanges.filter(x => x !== name);
  if (ctx.state.exchangeSecrets) delete ctx.state.exchangeSecrets[name];
  if (ctx.state.exchangeConnections[name]) {
    ctx.state.exchangeConnections[name].connected = false;
    ctx.state.exchangeConnections[name].disconnectedAt = new Date().toISOString();
  }
  ctx.helpers.pushLog('INFO', 'Tőzsde kapcsolat bontva', { exchange: name });
  return { exchange: name, connected: false };
}

function getExchangeStatus(ctx) {
  const supported = ['binance', 'okx', 'bybit', 'kraken'];
  return supported.map(name => ({
    exchange: name,
    connected: !!ctx.exchanges[name],
    details: ctx.state.exchangeConnections[name] || { connected: false }
  }));
}

async function getLiveClient(exchangeName, venueState = null) {
  const name = String(exchangeName || '').toLowerCase();
  if (venueState?.client) return venueState.client;
  if (venueState?.apiKey && venueState?.apiSecret) {
    const client = buildClient(name, {
      apiKey: venueState.apiKey,
      apiSecret: venueState.apiSecret,
      passphrase: venueState.passphrase || '',
      marketType: venueState.marketType || 'future'
    });
    if (venueState.useSandbox) { try { client.setSandboxMode(true); } catch (_) {} }
    try { await client.loadMarkets(); } catch (_) {}
    return client;
  }
  return null;
}

module.exports = { connectExchange, disconnectExchange, getExchangeStatus, getLiveClient, buildClient };
