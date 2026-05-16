const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function daysAgo(n) {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function compressOldMarketFiles(ctx) {
  const marketDir = path.join(ctx.CONFIG.projectRoot, 'data', 'market');
  const archiveDir = path.join(marketDir, 'archive');
  ensureDir(marketDir);
  ensureDir(archiveDir);

  const cutoff90 = daysAgo(90);
  const files = fs.readdirSync(marketDir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.jsonl'));

  let compressed = 0;
  for (const f of files) {
    const src = path.join(marketDir, f.name);
    const stat = fs.statSync(src);
    if (stat.mtimeMs > cutoff90) continue;

    const gzPath = path.join(archiveDir, `${f.name}.gz`);
    if (fs.existsSync(gzPath)) {
      fs.unlinkSync(src);
      continue;
    }

    const buf = fs.readFileSync(src);
    const gz = zlib.gzipSync(buf, { level: 9 });
    fs.writeFileSync(gzPath, gz);
    fs.unlinkSync(src);
    compressed += 1;
  }
  return compressed;
}

function deleteExpiredCompressedMarketFiles(ctx) {
  const archiveDir = path.join(ctx.CONFIG.projectRoot, 'data', 'market', 'archive');
  ensureDir(archiveDir);

  const cutoff365 = daysAgo(365);
  const files = fs.readdirSync(archiveDir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.jsonl.gz'));

  let deleted = 0;
  for (const f of files) {
    const p = path.join(archiveDir, f.name);
    const stat = fs.statSync(p);
    if (stat.mtimeMs <= cutoff365) {
      fs.unlinkSync(p);
      deleted += 1;
    }
  }
  return deleted;
}

function pruneDatasetVersions(ctx) {
  const datasetsDir = path.join(ctx.CONFIG.projectRoot, 'data', 'datasets');
  ensureDir(datasetsDir);

  const files = fs.readdirSync(datasetsDir, { withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => {
      const p = path.join(datasetsDir, d.name);
      const stat = fs.statSync(p);
      return { path: p, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  let deleted = 0;
  for (const f of files.slice(10)) {
    fs.unlinkSync(f.path);
    deleted += 1;
  }
  return deleted;
}

function pruneModelRegistryVersions(ctx) {
  const registryDir = path.join(ctx.CONFIG.projectRoot, 'model', 'registry');
  const versionsFile = path.join(registryDir, 'versions.json');
  const activeFile = path.join(registryDir, 'active.json');
  ensureDir(registryDir);

  if (!fs.existsSync(versionsFile)) return { deletedDirs: 0, prunedEntries: 0 };

  const versions = JSON.parse(fs.readFileSync(versionsFile, 'utf8'));
  const active = fs.existsSync(activeFile) ? JSON.parse(fs.readFileSync(activeFile, 'utf8')) : null;
  const activeVersion = active?.version || null;

  const sorted = [...versions].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const keep = [];
  for (const item of sorted) {
    if (activeVersion && item.version === activeVersion) {
      keep.push(item);
      continue;
    }
    if (keep.length < 10 + (activeVersion ? 1 : 0)) keep.push(item);
  }
  const keepSet = new Set(keep.map(x => x.version));

  let deletedDirs = 0;
  for (const item of sorted) {
    if (!keepSet.has(item.version)) {
      const versionDir = path.join(registryDir, item.version || '');
      if (item.version && fs.existsSync(versionDir) && fs.statSync(versionDir).isDirectory()) {
        fs.rmSync(versionDir, { recursive: true, force: true });
        deletedDirs += 1;
      }
    }
  }

  fs.writeFileSync(versionsFile, JSON.stringify(keep, null, 2));
  return { deletedDirs, prunedEntries: Math.max(0, sorted.length - keep.length) };
}

function loadMarketHistoryForSymbol(ctx, symbol, maxRecords = 5000) {
  const marketDir = path.join(ctx.CONFIG.projectRoot, 'data', 'market');
  const archiveDir = path.join(marketDir, 'archive');
  ensureDir(marketDir);
  ensureDir(archiveDir);

  const baseName = symbol.replaceAll('/', '_');
  const livePath = path.join(marketDir, `${baseName}.jsonl`);
  const gzPath = path.join(archiveDir, `${baseName}.jsonl.gz`);
  const rows = [];

  if (fs.existsSync(gzPath)) {
    try {
      const gz = fs.readFileSync(gzPath);
      const txt = zlib.gunzipSync(gz).toString('utf8');
      for (const line of txt.split('\n')) {
        if (!line.trim()) continue;
        rows.push(JSON.parse(line));
      }
    } catch (_) {}
  }

  if (fs.existsSync(livePath)) {
    try {
      const txt = fs.readFileSync(livePath, 'utf8');
      for (const line of txt.split('\n')) {
        if (!line.trim()) continue;
        rows.push(JSON.parse(line));
      }
    } catch (_) {}
  }

  return rows.slice(-maxRecords);
}

function runRetentionCycle(ctx) {
  const compressedMarketFiles = compressOldMarketFiles(ctx);
  const deletedCompressedMarketFiles = deleteExpiredCompressedMarketFiles(ctx);
  const deletedDatasets = pruneDatasetVersions(ctx);
  const modelPrune = pruneModelRegistryVersions(ctx);

  const result = {
    compressedMarketFiles,
    deletedCompressedMarketFiles,
    deletedDatasets,
    deletedModelDirs: modelPrune.deletedDirs,
    prunedModelEntries: modelPrune.prunedEntries,
    finishedAt: new Date().toISOString()
  };

  ctx.helpers.pushLog('INFO', 'Automatikus adatmegőrzési ciklus lefutott', result);
  return result;
}




function getRetentionStats(ctx) {
  const marketDir = path.join(ctx.CONFIG.projectRoot, 'data', 'market');
  const archiveDir = path.join(marketDir, 'archive');
  const datasetsDir = path.join(ctx.CONFIG.projectRoot, 'data', 'datasets');
  const registryDir = path.join(ctx.CONFIG.projectRoot, 'model', 'registry');
  ensureDir(marketDir);
  ensureDir(archiveDir);
  ensureDir(datasetsDir);
  ensureDir(registryDir);

  const liveMarketFiles = fs.readdirSync(marketDir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.jsonl')).length;

  const archivedMarketFiles = fs.readdirSync(archiveDir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.jsonl.gz')).length;

  const datasetFiles = fs.readdirSync(datasetsDir, { withFileTypes: true })
    .filter(d => d.isFile()).length;

  let modelVersionDirs = 0;
  const versions = fs.readdirSync(registryDir, { withFileTypes: true });
  for (const item of versions) {
    if (item.isDirectory()) modelVersionDirs += 1;
  }

  return {
    liveMarketFiles,
    archivedMarketFiles,
    datasetFiles,
    modelVersionDirs,
    lastRetentionRun: ctx.state?.maintenance?.retention?.lastRunAt || null,
    lastRetentionResult: ctx.state?.maintenance?.retention?.lastResult || null
  };
}

module.exports = { runRetentionCycle, loadMarketHistoryForSymbol, getRetentionStats };
