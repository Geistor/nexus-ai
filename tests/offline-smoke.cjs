'use strict';
if (process.env.NEXUS_SMOKE_CHILD === '1') {
  // This preload is only used by the isolated smoke child. No external I/O is allowed.
  const blocked = () => { throw new Error('offline smoke: outbound network disabled'); };
  require('node:https').request = blocked;
  require('node:https').get = blocked;
  require('node:http').request = blocked;
  require('node:http').get = blocked;
  global.fetch = async () => { throw new Error('offline smoke: outbound fetch disabled'); };
} else {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const net = require('node:net');
  const { spawn } = require('node:child_process');
  const assert = require('node:assert/strict');
  (async () => {
    const root = path.resolve(__dirname, '..');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-smoke-'));
    for (const file of ['server.js', 'version.json', 'package.json', 'frontend', 'backend']) {
      fs.cpSync(path.join(root, file), path.join(temp, file), { recursive: true });
    }
    const port = await new Promise(resolve => {
      const socket = net.createServer();
      socket.listen(0, '127.0.0.1', () => { const p = socket.address().port; socket.close(() => resolve(p)); });
    });
    const startChild=()=>spawn(process.execPath, ['--require', __filename, path.join(temp, 'server.js')], {
      cwd: temp, windowsHide: true,
      env: { SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir(), TMP: os.tmpdir(),
        PORT: String(port), NEXUS_SMOKE_CHILD: '1', NEXUS_DEFAULT_MODE: 'paper',
        NEXUS_ALLOW_LIVE: 'false', NEXUS_LIVE_REAL_SUBMIT: 'false', NEXUS_TESTNET_REAL_SUBMIT: 'false',
        NEXUS_MARKET_WS_ENABLED: 'false', NEXUS_PUBLIC_EDGE_FEEDS:'false', NEXUS_MARKET_CONTINUITY_HARD_DISABLE: 'true',
        NEXUS_HISTORICAL_WALKFORWARD_SEED_ENABLED: 'false', NEXUS_AUTONOMOUS_ALWAYS_ON: 'false',
        NEXUS_CONTINUOUS_AUTONOMY: 'false', NEXUS_RECOVERY_AUTOSTART_AFTER_RESTART: 'false',
        NEXUS_SAFE_STAGING_AUTO_RESUME: 'false' }
    });
    let child=startChild();
    let log = ''; child.stdout.on('data', b => { log += b; }); child.stderr.on('data', b => { log += b; });
    try {
      const headlessMs=Number(process.env.NEXUS_SMOKE_HEADLESS_MS || 0);
      const started=Date.now();if(headlessMs>0)await new Promise(r=>setTimeout(r,headlessMs));
      assert.equal(child.exitCode,null,log);
      let ready = false;
      for (let i = 0; i < 60; i++) {
        try { const r = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1000) }); if (r.ok) { ready = true; break; } } catch {}
        if (child.exitCode !== null) throw new Error(log);
        await new Promise(r => setTimeout(r, 200));
      }
      assert.ok(ready, log);
      for (const route of ['/healthz', '/api/health', '/api/dashboard/state', '/api/portfolio/venue-capital', '/api/portfolio/supervisor-ai',
    '/api/portfolio/venue-agents', '/api/portfolio/agent-performance', '/api/strategy/shadow-lab', '/api/strategy/champion-challenger', '/api/models/registry', '/api/models/durability', '/api/execution/authority', '/api/portfolio/risk-2', '/api/strategy/evolution', '/api/strategy/graph', '/api/market/edge-feeds', '/api/strategy/counterfactual', '/api/strategy/paper-experiments', '/api/market/patterns', '/api/strategy/benchmark', '/']) {
        const r = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(10000) });
        assert.equal(r.status, 200, route);
        const body = await r.text(); assert.ok(body.length > 0, route);
        console.log(`OK ${route} (${body.length} characters)`);
      }
      const replay=await (await fetch(`http://127.0.0.1:${port}/api/strategy/counterfactual`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
      assert.equal(replay.skipped,true);assert.equal(replay.liveAuthority,false);assert.equal(replay.reason,'insufficient-own-public-quotes');
      const noTrial=await fetch(`http://127.0.0.1:${port}/api/models/revalidation`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"id":"missing"}'});
      assert.equal(noTrial.status,409);assert.equal((await noTrial.json()).reason,'retired-model-required');
      const authority=await (await fetch(`http://127.0.0.1:${port}/api/execution/authority`)).json();
      assert.equal(authority.liveRealSubmit,false);
      const risk=await (await fetch(`http://127.0.0.1:${port}/api/portfolio/risk-2`)).json();
      assert.equal(risk.equityPolicy.qualified,false);assert.ok(risk.equityPolicy.riskMultiplier<=1);
      const retrain=await (await fetch(`http://127.0.0.1:${port}/api/learning/retrain`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
      assert.ok(retrain.result?.skipped,retrain.result?.reason);
      if(headlessMs>=35000){const paper=await (await fetch(`http://127.0.0.1:${port}/api/strategy/paper-experiments`)).json();assert.equal(paper.lastTick?.ok,true);assert.equal(paper.liveAuthority,false);assert.ok(Array.isArray(paper.entries));}
      child.kill();await new Promise(resolve=>child.once('exit',resolve));
      child=startChild();child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});
      let restarted=false;for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${port}/healthz`,{signal:AbortSignal.timeout(1000)});if(r.ok){restarted=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(restarted,log);
      const afterRestart=await (await fetch(`http://127.0.0.1:${port}/api/strategy/paper-experiments`)).json();assert.equal(afterRestart.liveAuthority,false);assert.deepEqual(afterRestart.entries,[]);
      console.log(`Isolated offline startup/restart passed; headless before first request ${headlessMs}ms, actual duration ${Date.now()-started}ms; no exchange or database connectivity tested.`);
    } finally {
      child.kill();
      await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
      // Delete only the exact temporary directory created above, after the child has stopped.
      if (path.dirname(temp) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('nexus-smoke-')) throw new Error('unexpected temp path');
      fs.rmSync(temp, { recursive: true, force: true });
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
