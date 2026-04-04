const fs = require('fs');
const path = require('path');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function storageRoot(ctx) {
  return process.env.PERSISTENCE_ROOT
    ? path.resolve(process.env.PERSISTENCE_ROOT)
    : path.join(ctx.CONFIG.projectRoot, 'storage');
}

function paths(ctx) {
  const root = storageRoot(ctx);
  return {
    root,
    journalDir: path.join(root, 'journal'),
    marketDir: path.join(root, 'market'),
    datasetsDir: path.join(root, 'datasets'),
    modelsDir: path.join(root, 'models'),
    performanceDir: path.join(root, 'performance'),
    snapshotsDir: path.join(root, 'snapshots'),
    stateFile: path.join(root, 'learning_state.json'),
    manifestFile: path.join(root, 'manifest.json'),
    activeModelFile: path.join(root, 'models', 'active.json')
  };
}

function ensureStructure(ctx) {
  const p = paths(ctx);
  [p.root,p.journalDir,p.marketDir,p.datasetsDir,p.modelsDir,p.performanceDir,p.snapshotsDir].forEach(ensureDir);
  if (!fs.existsSync(p.stateFile)) {
    fs.writeFileSync(p.stateFile, JSON.stringify({
      activeModelVersion: null,
      learningStats: {},
      lastSnapshotAt: null,
      lastMergedAt: null
    }, null, 2));
  }
  if (!fs.existsSync(p.manifestFile)) {
    fs.writeFileSync(p.manifestFile, JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      description: 'NEXUS AI persistence storage'
    }, null, 2));
  }
  return p;
}

function safeReadJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function safeWriteJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function appendJsonl(file, item) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(item) + '\n');
}

function symbolFileName(symbol) {
  return String(symbol).replaceAll('/', '_');
}

function persistMarketSnapshot(ctx, symbol, payload) {
  const p = ensureStructure(ctx);
  appendJsonl(path.join(p.marketDir, `${symbolFileName(symbol)}.jsonl`), payload);
}

function persistTradeEvent(ctx, payload) {
  const p = ensureStructure(ctx);
  appendJsonl(path.join(p.journalDir, 'trades.jsonl'), payload);
}

function updateLearningState(ctx, patch = {}) {
  const p = ensureStructure(ctx);
  const current = safeReadJson(p.stateFile, {});
  const merged = { ...current, ...patch, updatedAt: new Date().toISOString() };
  safeWriteJson(p.stateFile, merged);
  return merged;
}

function registerModelVersion(ctx, meta) {
  const p = ensureStructure(ctx);
  const registryFile = path.join(p.modelsDir, 'registry.json');
  const current = safeReadJson(registryFile, []);
  current.unshift(meta);
  safeWriteJson(registryFile, current);
  return current;
}

function setActiveModelVersion(ctx, version, meta = {}) {
  const p = ensureStructure(ctx);
  safeWriteJson(p.activeModelFile, { version, ...meta, activatedAt: new Date().toISOString() });
  return updateLearningState(ctx, { activeModelVersion: version });
}

function restorePersistenceSummary(ctx) {
  const p = ensureStructure(ctx);
  const learningState = safeReadJson(p.stateFile, {});
  const active = safeReadJson(p.activeModelFile, null);
  const registry = safeReadJson(path.join(p.modelsDir, 'registry.json'), []);
  const tradeJournal = path.join(p.journalDir, 'trades.jsonl');
  const tradeLines = fs.existsSync(tradeJournal)
    ? fs.readFileSync(tradeJournal, 'utf8').split('\n').filter(Boolean).length
    : 0;

  return {
    storageRoot: p.root,
    learningState,
    activeModel: active,
    modelVersions: registry.length,
    persistedTradeEvents: tradeLines
  };
}

function createPersistenceSnapshot(ctx, label = 'manual') {
  const p = ensureStructure(ctx);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotDir = path.join(p.snapshotsDir, `${stamp}_${label}`);
  ensureDir(snapshotDir);

  const filesToCopy = [
    [p.stateFile, path.join(snapshotDir, 'learning_state.json')],
    [p.manifestFile, path.join(snapshotDir, 'manifest.json')],
    [path.join(p.modelsDir, 'registry.json'), path.join(snapshotDir, 'model_registry.json')],
    [p.activeModelFile, path.join(snapshotDir, 'active_model.json')]
  ];

  for (const [srcFile, dstFile] of filesToCopy) {
    if (fs.existsSync(srcFile)) {
      ensureDir(path.dirname(dstFile));
      fs.copyFileSync(srcFile, dstFile);
    }
  }

  updateLearningState(ctx, { lastSnapshotAt: new Date().toISOString() });
  return { snapshotDir };
}

function mergePersistenceFolder(ctx, importRoot) {
  const p = ensureStructure(ctx);
  const sourceRoot = path.resolve(importRoot);
  if (!fs.existsSync(sourceRoot)) throw new Error('A megadott import mappa nem található.');

  const candidates = [
    ['learning_state.json', p.stateFile],
    ['models/active.json', p.activeModelFile],
    ['models/registry.json', path.join(p.modelsDir, 'registry.json')],
    ['journal/trades.jsonl', path.join(p.journalDir, 'trades.jsonl')]
  ];

  let mergedFiles = 0;
  for (const [relativeSrc, dstFile] of candidates) {
    const srcFile = path.join(sourceRoot, relativeSrc);
    if (!fs.existsSync(srcFile)) continue;

    ensureDir(path.dirname(dstFile));

    if (srcFile.endsWith('.jsonl') && fs.existsSync(dstFile)) {
      const current = fs.readFileSync(dstFile, 'utf8');
      const incoming = fs.readFileSync(srcFile, 'utf8');
      fs.writeFileSync(dstFile, current + incoming);
    } else {
      fs.copyFileSync(srcFile, dstFile);
    }
    mergedFiles += 1;
  }

  updateLearningState(ctx, { lastMergedAt: new Date().toISOString() });
  return { mergedFiles, sourceRoot };
}

module.exports = {
  ensureStructure,
  paths,
  persistMarketSnapshot,
  persistTradeEvent,
  updateLearningState,
  registerModelVersion,
  setActiveModelVersion,
  restorePersistenceSummary,
  createPersistenceSnapshot,
  mergePersistenceFolder
};
