const rateLimit = require('express-rate-limit');

const apiMax = parseInt(process.env.API_RATE_LIMIT, 10) || 30;
const fetchMax = parseInt(process.env.FETCH_RATE_LIMIT, 10) || 20;
const downloadMax = parseInt(process.env.DOWNLOAD_RATE_LIMIT, 10) || 10;

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: apiMax,
  message: {
    error: true,
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: true,
      message: `Rate limit exceeded. Maximum ${apiMax} requests per minute allowed.`,
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  },
  skip: (req) => {
    return req.path === '/health' || req.path === '/';
  }
});

// Stricter rate limiting for download endpoint
const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: downloadMax,
  message: {
    error: true,
    message: `Download rate limit exceeded. Maximum ${downloadMax} downloads per minute allowed.`,
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: true,
      message: `Download rate limit exceeded. Maximum ${downloadMax} downloads per minute allowed.`,
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

// Very strict rate limiting for metadata fetching to prevent abuse
const fetchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: fetchMax,
  message: {
    error: true,
    message: `Fetch rate limit exceeded. Maximum ${fetchMax} requests per minute allowed.`,
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: true,
      message: `Fetch rate limit exceeded. Maximum ${fetchMax} requests per minute allowed.`,
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

module.exports = {
  apiLimiter,
  downloadLimiter,
  fetchLimiter
};
