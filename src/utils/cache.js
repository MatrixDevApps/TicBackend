const NodeCache = require('node-cache');

const ttl = parseInt(process.env.CACHE_TTL, 10) || 300; // 5 minutes default

const cache = new NodeCache({ stdTTL: ttl, checkperiod: ttl * 0.2 });

function getCacheKey(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
}

module.exports = { cache, getCacheKey };
