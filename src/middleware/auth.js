const { logger } = require('../utils/logger');

function apiKeyAuth(req, res, next) {
  const apiKeys = process.env.API_KEYS;

  // If API_KEYS not configured, skip auth (backwards compatible)
  if (!apiKeys) {
    return next();
  }

  const validKeys = apiKeys.split(',').map((k) => k.trim()).filter(Boolean);

  if (validKeys.length === 0) {
    return next();
  }

  const key = req.get('X-API-Key') || req.query.apikey;

  if (!key || !validKeys.includes(key)) {
    logger.warn({ ip: req.ip, url: req.originalUrl }, 'unauthorized request');
    return res.status(401).json({
      error: true,
      message: 'Invalid or missing API key',
    });
  }

  next();
}

module.exports = { apiKeyAuth };
