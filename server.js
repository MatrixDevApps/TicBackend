const app = require('./src/app');
const { logger } = require('./src/utils/logger');

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: NODE_ENV }, 'server started');
});

const gracefulShutdown = (signal) => {
  logger.info({ signal }, 'shutting down gracefully');

  server.close((err) => {
    if (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }

    logger.info('server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('forcing shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = server;
