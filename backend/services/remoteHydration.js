const fs = require('fs');
const path = require('path');
const remote = require('./supabasePersistence');
const { paths, ensureStructure } = require('./persistenceManager');

async function hydrateFromRemote(ctx) {
  if (!remote.isEnabled()) return { enabled: false, restored: false };

  const p = ensureStructure(ctx);
  const learningState = await remote.fetchSystemState('learning_state').catch(() => null);
  const activeModel = await remote.fetchSystemState('active_model').catch(() => null);
  const registry = await remote.listModelRegistry().catch(() => []);
  const tradeEvents = await remote.listTradeEvents(500).catch(() => []);

  if (learningState) {
    fs.writeFileSync(p.stateFile, JSON.stringify(learningState, null, 2));
  }
  if (activeModel) {
    fs.writeFileSync(p.activeModelFile, JSON.stringify(activeModel, null, 2));
    if (activeModel.remotePath && activeModel.path) {
      const localModelPath = path.isAbsolute(activeModel.path) ? activeModel.path : path.join(ctx.CONFIG.projectRoot, activeModel.path);
      await remote.downloadFile(activeModel.remotePath, localModelPath).catch(() => null);
    }
  }
  if (registry.length) {
    const rows = registry.map(r => r.payload || r);
    fs.writeFileSync(path.join(p.modelsDir, 'registry.json'), JSON.stringify(rows, null, 2));
  }

  const closes = tradeEvents
    .map(x => x.payload)
    .filter(x => x && x.event === 'CLOSE')
    .sort((a, b) => new Date(b.time || b.closedAt || 0) - new Date(a.time || a.closedAt || 0));

  if (closes.length) {
    ctx.state.closedTrades = closes.map(x => ({
      tradeId: x.tradeId,
      symbol: x.symbol,
      venue: x.venue,
      side: x.side,
      entry: x.entry,
      exit: x.exit,
      pnl: x.pnl,
      reason: x.reason,
      closedAt: x.time || x.closedAt || new Date().toISOString(),
      stopLoss: x.stopLoss,
      takeProfit: x.takeProfit,
      confidence: x.confidence
    }));
  }

  return {
    enabled: true,
    restored: true,
    learningState: !!learningState,
    activeModel: !!activeModel,
    registryCount: registry.length,
    restoredClosedTrades: closes.length
  };
}

module.exports = { hydrateFromRemote };
