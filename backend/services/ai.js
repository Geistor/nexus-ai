const { ensembleDecision } = require('./ensembleAI');
let tf = null;
try { tf = require('@tensorflow/tfjs-node'); } catch (_) {}
let model = null;

function activeRegistryPath(ctx) {
  const path = require('path');
  return path.join(ctx.CONFIG.projectRoot, 'model', 'registry', 'active.json');
}
function getActiveRecord(ctx) {
  const fs = require('fs');
  const p = activeRegistryPath(ctx);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
async function reloadActiveModel(ctx) {
  model = null;
  ctx.state.modelLoaded = false;
  await loadActiveModel(ctx);
}

async function loadActiveModel(ctx) {
  if (!tf) {
    ctx.helpers.pushLog('INFO', 'TensorFlow.js not installed; using ensemble fallback');
    return;
  }
  try {
    model = await tf.loadLayersModel(`file://${ctx.CONFIG.modelPath}`);
    ctx.state.modelLoaded = true;
    ctx.state.modelInfo = { backend: 'tensorflow-js', activeVersion: active?.version || null, path: active?.path || ctx.CONFIG.modelPath };
    ctx.helpers.pushLog('INFO', 'Neural network model loaded', { modelPath: active?.path || ctx.CONFIG.modelPath });
  } catch (err) {
    ctx.helpers.pushLog('WARN', 'Model load failed; using ensemble fallback', { message: err.message });
  }
}

function deterministicDecision(ctx, features) {
  const reasons = [];
  let buyScore = 0;
  let sellScore = 0;

  if (features.ema20 > features.ema50) { buyScore += 0.22; reasons.push('EMA20 > EMA50, emelkedő trend'); }
  else { sellScore += 0.22; reasons.push('EMA20 < EMA50, csökkenő trend'); }

  if (features.rsi < 33) { buyScore += 0.18; reasons.push('RSI túladott zóna'); }
  else if (features.rsi > 67) { sellScore += 0.18; reasons.push('RSI túlvett zóna'); }

  if (features.macd.MACD > features.macd.signal) { buyScore += 0.20; reasons.push('MACD bullish keresztezés'); }
  else { sellScore += 0.20; reasons.push('MACD bearish keresztezés'); }

  if (features.volRatio > 1.15) {
    if (buyScore > sellScore) { buyScore += 0.10; reasons.push('A forgalom megerősíti az emelkedést'); }
    else if (sellScore > buyScore) { sellScore += 0.10; reasons.push('A forgalom megerősíti a csökkenést'); }
  }

  const spread = Math.abs(features.ema20 - features.ema50) / features.price;
  if (spread < 0.0015) return { action: 'HOLD', confidence: 0.55, reasons: [...reasons, 'Alacsony trendkülönbség, oldalazó piac szűrése'], source: 'ensemble' };
  if (buyScore >= ctx.CONFIG.minConfidence && buyScore > sellScore) return { action: 'BUY', confidence: Number(buyScore.toFixed(2)), reasons, source: 'ensemble' };
  if (sellScore >= ctx.CONFIG.minConfidence && sellScore > buyScore) return { action: 'SELL', confidence: Number(sellScore.toFixed(2)), reasons, source: 'ensemble' };
  return { action: 'HOLD', confidence: Number(Math.max(buyScore, sellScore, 0.5).toFixed(2)), reasons, source: 'ensemble' };
}

async function neuralDecision(ctx, features) {
  const active = getActiveRecord(ctx);
  if (active?.version) ctx.state.training.activeVersion = active.version;
  if (!model || !tf) return ensembleDecision(ctx, symbol, features, deterministicDecision(ctx, features));

  const input = tf.tensor2d([[features.price, features.rsi, features.ema20, features.ema50, features.macd.MACD, features.macd.signal, features.atr, features.volRatio]]);
  const out = model.predict(input).dataSync();
  const [buy, sell, hold] = Array.from(out);

  let action = 'HOLD';
  let confidence = hold;
  if (buy > sell && buy > hold) { action = 'BUY'; confidence = buy; }
  else if (sell > buy && sell > hold) { action = 'SELL'; confidence = sell; }

  const nnDecision = {
    action,
    confidence: Number(confidence.toFixed(2)),
    reasons: [`NN logits -> buy:${buy.toFixed(3)} sell:${sell.toFixed(3)} hold:${hold.toFixed(3)}`],
    source: 'neural-network',
    modelVersion: ctx.state.training.activeVersion
  };
  return {
    ...ensembleDecision(ctx, symbol, features, nnDecision),
    modelVersion: ctx.state.training.activeVersion
  };
}

module.exports = { loadActiveModel, neuralDecision, reloadActiveModel };
