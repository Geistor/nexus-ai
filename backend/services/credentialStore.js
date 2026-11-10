
const { store } = require('../state/store');

function suffix(v) { return v ? v.slice(-4) : null; }

function loadCredentialsFromEnv() {
  const binKey = process.env.BINANCE_API_KEY || '';
  const binSecret = process.env.BINANCE_API_SECRET || '';
  const okxKey = process.env.OKX_API_KEY || '';
  const okxSecret = process.env.OKX_API_SECRET || '';
  const okxPass = process.env.OKX_PASSPHRASE || '';

  store.credentials.binance = {
    loaded: Boolean(binKey && binSecret),
    apiKeySuffix: suffix(binKey),
    secretLoaded: Boolean(binSecret)
  };

  store.credentials.okx = {
    loaded: Boolean(okxKey && okxSecret && okxPass),
    apiKeySuffix: suffix(okxKey),
    secretLoaded: Boolean(okxSecret),
    passphraseLoaded: Boolean(okxPass)
  };

  store.system.mode = process.env.TRADING_MODE || 'paper';
  return store.credentials;
}

function getCredentialState() {
  return store.credentials;
}

module.exports = { loadCredentialsFromEnv, getCredentialState };
