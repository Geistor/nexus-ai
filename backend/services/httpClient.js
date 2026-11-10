
async function fetchWithRetry(url, options = {}, config = {}) {
  const retries = Number(config.retries ?? 2);
  const baseDelayMs = Number(config.baseDelayMs ?? 400);
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text; }

      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        err.body = parsed;
        throw err;
      }

      return { ok: true, status: res.status, data: parsed, attempt };
    } catch (err) {
      lastError = err;
      if (attempt >= retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    ok: false,
    status: lastError?.status || null,
    error: lastError?.message || 'request_failed',
    details: lastError?.body || null
  };
}

module.exports = { fetchWithRetry };
