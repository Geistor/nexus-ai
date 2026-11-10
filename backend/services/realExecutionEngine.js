const ccxtPromise = import('ccxt');

const EXCHANGE_MAP = {
  binance: 'binance',
  okx: 'okx',
  bybit: 'bybit',
  kraken: 'kraken',
};

async function getCcxt() {
  const mod = await ccxtPromise;
  return mod.default || mod;
}

function buildExchangeOptions(venue, config = {}) {
  const marketType = String(config.marketType || 'spot').toLowerCase();
  const exchangeConfig = {
    apiKey: config.apiKey,
    secret: config.apiSecret,
    password: config.passphrase || undefined,
    enableRateLimit: true,
    options: {},
  };

  if (venue === 'binance') {
    exchangeConfig.options.defaultType = marketType === 'spot' ? 'spot' : 'future';
    if (config.testnet) {
      exchangeConfig.options.defaultType = marketType === 'spot' ? 'spot' : 'future';
      exchangeConfig.urls = {
        api: marketType === 'spot'
          ? {
              public: 'https://testnet.binance.vision/api',
              private: 'https://testnet.binance.vision/api',
            }
          : {
              public: 'https://testnet.binancefuture.com/fapi/v1',
              private: 'https://testnet.binancefuture.com/fapi/v1',
            },
      };
    }
  }

  if (venue === 'bybit') {
    exchangeConfig.options.defaultType = marketType === 'spot' ? 'spot' : 'swap';
    if (config.testnet) exchangeConfig.options.testnet = true;
  }

  if (venue === 'okx') {
    exchangeConfig.options.defaultType = marketType === 'spot' ? 'spot' : 'swap';
    if (config.testnet) exchangeConfig.setSandboxMode = true;
  }

  if (venue === 'kraken') {
    exchangeConfig.options.defaultType = marketType === 'spot' ? 'spot' : 'future';
    if (config.testnet) exchangeConfig.options.sandboxMode = true;
  }

  return exchangeConfig;
}

async function createExchange(venue, config) {
  const ccxt = await getCcxt();
  const className = EXCHANGE_MAP[venue];
  if (!className || !ccxt[className]) throw new Error(`Nem támogatott venue: ${venue}`);
  const exchange = new ccxt[className](buildExchangeOptions(venue, config));
  if (typeof exchange.setSandboxMode === 'function' && config.testnet) {
    try { exchange.setSandboxMode(true); } catch (_) {}
  }
  return exchange;
}

async function testVenueConnection({ venue, config }) {
  let exchange;
  try {
    exchange = await createExchange(venue, config);
    if (typeof exchange.loadMarkets === 'function') await exchange.loadMarkets();
    if (typeof exchange.fetchTime === 'function') {
      await exchange.fetchTime();
    } else if (typeof exchange.fetchBalance === 'function') {
      await exchange.fetchBalance();
    }
    return {
      ok: true,
      details: {
        venue,
        testnet: !!config.testnet,
        marketType: config.marketType || 'spot',
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'Kapcsolódási hiba',
      details: {
        venue,
        testnet: !!config.testnet,
        marketType: config.marketType || 'spot',
      },
    };
  } finally {
    if (exchange && typeof exchange.close === 'function') {
      try { await exchange.close(); } catch (_) {}
    }
  }
}

async function executeRealOrder({ venue, config, symbol, side, type, amount, reduceOnly = false, dryRun = true, mode, workflowStage }) {
  const payload = {
    venue,
    symbol,
    side,
    type,
    amount,
    reduceOnly,
    dryRun,
    mode,
    workflowStage,
  };

  if (dryRun) {
    return {
      ...payload,
      status: 'simulated',
      orderId: `sim_${Date.now()}`,
      info: { message: 'DRY_RUN aktív, valós order nem lett elküldve.' },
    };
  }

  let exchange;
  try {
    exchange = await createExchange(venue, config);
    if (typeof exchange.loadMarkets === 'function') await exchange.loadMarkets();

    const params = {};
    if (reduceOnly) params.reduceOnly = true;

    const marginMode = String(config.marginMode || '').toLowerCase();
    if (marginMode) params.marginMode = marginMode;

    if (config.leverage && Number(config.leverage) > 0 && typeof exchange.setLeverage === 'function' && String(config.marketType || '').toLowerCase() !== 'spot') {
      try {
        await exchange.setLeverage(Number(config.leverage), symbol, { marginMode: marginMode || undefined });
      } catch (_) {}
    }

    const order = await exchange.createOrder(symbol, type, side, amount, undefined, params);
    return {
      ...payload,
      status: 'submitted',
      orderId: order?.id || null,
      info: order || null,
    };
  } finally {
    if (exchange && typeof exchange.close === 'function') {
      try { await exchange.close(); } catch (_) {}
    }
  }
}

module.exports = {
  testVenueConnection,
  executeRealOrder,
};
