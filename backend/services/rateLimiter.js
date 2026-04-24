
const lastByVenue = new Map();

async function enforceRateLimit(venue, minMs = 250) {
  const now = Date.now();
  const last = lastByVenue.get(venue) || 0;
  const diff = now - last;
  if (diff < minMs) {
    await new Promise(resolve => setTimeout(resolve, minMs - diff));
  }
  lastByVenue.set(venue, Date.now());
}

module.exports = { enforceRateLimit };
