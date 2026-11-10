'use strict';

const crypto = require('crypto');

const EXECUTION_CONTRACT_VERSION = 'v1-shadow';

function finiteNumber(value, digits = 10) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits));
}

function canonicalExecutionPayload(intent = {}) {
  return {
    version: EXECUTION_CONTRACT_VERSION,
    decisionId: String(intent.decisionId || ''),
    venue: String(intent.venue || intent.requestedVenue || '').toUpperCase(),
    symbol: String(intent.symbol || '').toUpperCase(),
    side: String(intent.side || '').toUpperCase(),
    quantity: finiteNumber(intent.quantity ?? intent.amount, 12),
    notionalUsd: finiteNumber(intent.notionalUsd, 8),
    entryPrice: finiteNumber(intent.entryPrice, 12),
    marketSnapshotId: String(intent.entryMarketSnapshotId || intent.marketSnapshotId || ''),
    strategyVersion: String(intent.strategyVersion || intent.executionEpoch || ''),
    mode: String(intent.mode || '').toLowerCase()
  };
}

function createExecutionContract(intent = {}) {
  const payload = canonicalExecutionPayload(intent);
  const canonical = JSON.stringify(payload);
  return {
    version: EXECUTION_CONTRACT_VERSION,
    mode: 'shadow-audit',
    authority: 'observe-only',
    hash: `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`,
    payload
  };
}

module.exports = {
  EXECUTION_CONTRACT_VERSION,
  canonicalExecutionPayload,
  createExecutionContract
};
