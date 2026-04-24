
const express = require('express');
const { store } = require('../state/store');
const { loadCredentialsFromEnv, getCredentialState } = require('../services/credentialStore');
const { submitOrder: submitBinance } = require('../services/binanceExecutionClient');
const { submitOrder: submitOkx } = require('../services/okxExecutionClient');

const router = express.Router();

router.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'nexus', mode: process.env.TRADING_MODE || 'paper' });
});

router.get('/api/snapshot', (_req, res) => {
  res.json({
    ok: true,
    mode: process.env.TRADING_MODE || 'paper',
    allowLive: String(process.env.ALLOW_LIVE_TRADING || 'false') === 'true',
    credentials: getCredentialState(),
    http: store.http,
    executions: store.executions.slice(0, 20)
  });
});

router.post('/api/credentials/reload', (_req, res) => {
  res.json({ ok: true, credentials: loadCredentialsFromEnv() });
});

router.post('/api/execute/binance', async (req, res) => {
  res.json({ ok: true, result: await submitBinance(req.body || {}) });
});

router.post('/api/execute/okx', async (req, res) => {
  res.json({ ok: true, result: await submitOkx(req.body || {}) });
});

module.exports = router;
