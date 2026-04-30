
const store = {
  credentials: {
    binance: { loaded: false, apiKeySuffix: null, secretLoaded: false },
    okx: { loaded: false, apiKeySuffix: null, secretLoaded: false, passphraseLoaded: false }
  },
  http: {
    binance: { lastRequestAt: null, requests: 0, lastStatus: null },
    okx: { lastRequestAt: null, requests: 0, lastStatus: null }
  },
  executions: [],
  system: {
    mode: 'paper'
  }
};

module.exports = { store };
