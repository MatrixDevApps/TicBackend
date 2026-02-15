const { logger } = require('../utils/logger');

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
  const log = req.log || logger;
  log.error(
    {
      err,
      url: req.url,
      method: req.method,
      ip: req.ip,
    },
    'unhandled error'
  );

  let statusCode = 500;
  let message = 'Internal server error';

  if (err.message.includes('Invalid or unsupported TikTok URL')) {
    statusCode = 400;
    message = 'Invalid or unsupported TikTok URL';
  } else if (err.message.includes('Failed to fetch TikTok metadata')) {
    statusCode = 422;
    message = 'Unable to process TikTok URL. Please check if the video exists and is public.';
  } else if (err.message.includes('Request timeout')) {
    statusCode = 504;
    message = 'Request timeout. TikTok server took too long to respond.';
  } else if (err.message.includes('Network error')) {
    statusCode = 503;
    message = 'Service temporarily unavailable. Please try again later.';
  } else if (err.message.includes('HTTP 403')) {
    statusCode = 403;
    message = 'Access denied by TikTok. This video may be private or region-locked.';
  } else if (err.message.includes('HTTP 404')) {
    statusCode = 404;
    message = 'TikTok video not found. Please check the URL and try again.';
  } else if (err.message.includes('Invalid download type')) {
    statusCode = 400;
    message = 'Invalid download type. Supported types: nowm, wm, audio';
  } else if (err.message.includes('URL not allowed')) {
    statusCode = 400;
    message = 'URL not allowed for security reasons';
  } else if (err.message.includes('validation')) {
    statusCode = 400;
    message = err.message;
  }

  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Something went wrong. Please try again later.';
  }

  res.status(statusCode).json({ error: true, message });
};

// 404 handler for undefined routes
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: true,
    message: `Route ${req.originalUrl} not found`
  });
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
