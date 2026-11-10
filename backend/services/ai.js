const fs = require('fs');
const path = require('path');
const { ensembleDecision } = require('./ensembleAI');

let customModel = null;

function activeRegistryPath(ctx) {
  return path.join(ctx.CONFIG.projectRoot, 'model', 'registry', 'active.json');
}

function getActiveModelRecord(ctx) {
  const p = activeRegistryPath(ctx);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function relu(x) { return Math.max(0, x); }

function softmax(arr) {
  const max = Math.max(...arr);
  const exps = arr.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / Math.max(sum, 1e-12));
}

function scaleInput(features, scaler) {
  const raw = [
    Number(features.close || features.price || 0),
    Number(features.rsi || 0),
    Number(features.ema20 || 0),
    Number(features.ema50 || 0),
    Number(features.macd?.MACD || 0),
    Number(features.macd?.signal || 0),
    Number(features.atr || 0),
    Number(features.volRatio || 0)
  ];
  if (!scaler) return raw;
  return raw.map((v, i) => {
    const mean = Number(scaler.mean?.[i] || 0);
    const scale = Number(scaler.scale?.[i] || 1) || 1;
    return (v - mean) / scale;
  });
}

function forwardDense(input, weights, bias, activation = 'relu') {
  const out = [];
  for (let j = 0; j < bias.length; j++) {
    let s = Number(bias[j] || 0);
    for (let i = 0; i < input.length; i++) s += Number(input[i] || 0) * Number(weights[i]?.[j] || 0);
    out.push(activation === 'relu' ? relu(s) : s);
  }
  return out;
}

function inferCustomModel(model, features) {
  const x = scaleInput(features, model.scaler);
  let h = x;
  const layers = model.layers || [];
  for (let i = 0; i < layers.length; i++) {
    const isLast = i === layers.length - 1;
    h = forwardDense(h, layers[i].weights, layers[i].bias, isLast ? 'linear' : 'relu');
  }
  const probs = softmax(h);
  return { buy: Number(probs[0] || 0), sell: Number(probs[1] || 0), hold: Number(probs[2] || 0) };
}

async function loadActiveModel(ctx) {
  const active = getActiveModelRecord(ctx);
  if (!active?.path) {
    customModel = null;
    ctx.state.modelLoaded = false;
    ctx.state.modelInfo = { backend: 'ensemble-fallback', activeVersion: null, path: null };
    ctx.helpers.pushLog('INFO', 'Nincs aktív cloud NN modell, fallback aktív', {});
    return;
  }

  try {
    const absPath = path.isAbsolute(active.path) ? active.path : path.join(ctx.CONFIG.projectRoot, active.path);
    customModel = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    ctx.state.modelLoaded = true;
    ctx.state.modelInfo = { backend: 'custom-json-mlp', activeVersion: active.version || null, path: active.path };
    ctx.helpers.pushLog('INFO', 'Cloud-kompatibilis NN modell betöltve', ctx.state.modelInfo);
  } catch (err) {
    customModel = null;
    ctx.state.modelLoaded = false;
    ctx.state.modelInfo = { backend: 'ensemble-fallback', activeVersion: null, path: null };
    ctx.helpers.pushLog('WARN', 'NN modell betöltése sikertelen, fallback aktív', { message: err.message });
  }
}

async function reloadActiveModel(ctx) {
  customModel = null;
  ctx.state.modelLoaded = false;
  await loadActiveModel(ctx);
}

function deterministicDecision(ctx, features) {
  const reasons = [];
  let buyScore = 0;
  let sellScore = 0;

  if (features.ema20 > features.ema50) { buyScore += 0.22; reasons.push('EMA20 > EMA50, emelkedő trend'); }
  else { sellScore += 0.22; reasons.push('EMA20 < EMA50, csökkenő trend'); }

  if (features.rsi < 33) { buyScore += 0.18; reasons.push('RSI túladott zóna'); }
  else if (features.rsi > 67) { sellScore += 0.18; reasons.push('RSI túlvett zóna'); }

  if ((features.macd?.MACD || 0) > (features.macd?.signal || 0)) { buyScore += 0.20; reasons.push('MACD bullish keresztezés'); }
  else { sellScore += 0.20; reasons.push('MACD bearish keresztezés'); }

  if (features.volRatio > 1.15) {
    if (buyScore > sellScore) { buyScore += 0.10; reasons.push('A forgalom megerősíti az emelkedést'); }
    else if (sellScore > buyScore) { sellScore += 0.10; reasons.push('A forgalom megerősíti a csökkenést'); }
  }

  const spread = Math.abs(features.ema20 - features.ema50) / Math.max(1, features.price || 1);
  if (spread < 0.0015) return { action: 'HOLD', confidence: 0.55, reasons: [...reasons, 'Alacsony trendkülönbség, oldalazó piac szűrése'], source: 'ensemble' };
  if (buyScore >= ctx.CONFIG.minConfidence && buyScore > sellScore) return { action: 'BUY', confidence: Number(buyScore.toFixed(2)), reasons, source: 'ensemble' };
  if (sellScore >= ctx.CONFIG.minConfidence && sellScore > buyScore) return { action: 'SELL', confidence: Number(sellScore.toFixed(2)), reasons, source: 'ensemble' };
  return { action: 'HOLD', confidence: Number(Math.max(buyScore, sellScore, 0.5).toFixed(2)), reasons, source: 'ensemble' };
}

async function neuralDecision(ctx, symbol, features) {
  const base = deterministicDecision(ctx, features);
  if (!customModel) return { ...ensembleDecision(ctx, symbol, features, base), modelVersion: ctx.state.modelInfo?.activeVersion || null };

  const out = inferCustomModel(customModel, features);
  let action = 'HOLD';
  let confidence = out.hold;
  if (out.buy > out.sell && out.buy > out.hold) { action = 'BUY'; confidence = out.buy; }
  else if (out.sell > out.buy && out.sell > out.hold) { action = 'SELL'; confidence = out.sell; }

  const nnDecision = {
    action,
    confidence: Number(confidence.toFixed(2)),
    reasons: [`Cloud NN logits -> buy:${out.buy.toFixed(3)} sell:${out.sell.toFixed(3)} hold:${out.hold.toFixed(3)}`],
    source: 'custom-json-mlp',
    modelVersion: ctx.state.modelInfo?.activeVersion || null
  };

  return { ...ensembleDecision(ctx, symbol, features, nnDecision), modelVersion: ctx.state.modelInfo?.activeVersion || null };
}

module.exports = { loadActiveModel, reloadActiveModel, neuralDecision, getActiveModelRecord };
