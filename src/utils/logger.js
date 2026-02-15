const pino = require('pino');
const crypto = require('crypto');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

function requestLogger(req, res, next) {
  req.id = crypto.randomUUID();
  req.log = logger.child({ reqId: req.id });
  const start = Date.now();

  res.on('finish', () => {
    req.log.info(
      {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: Date.now() - start,
        ip: req.ip,
      },
      'request completed'
    );
  });

  next();
}

module.exports = { logger, requestLogger };
