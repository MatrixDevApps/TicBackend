const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const { apiLimiter } = require('./middleware/rateLimit');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { apiKeyAuth } = require('./middleware/auth');
const { logger, requestLogger } = require('./utils/logger');
const { cache } = require('./utils/cache');

const fetchRoutes = require('./routes/fetch');
const downloadRoutes = require('./routes/download');

const app = express();

app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: false,
  maxAge: 86400
}));

app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// Global rate limiting
app.use('/api', apiLimiter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'TikTok Downloader API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      fetch: '/api/v1/fetch?url=<tiktok_url>',
      download: '/api/v1/download?type=<nowm|wm|audio>&url=<tiktok_url>'
    }
  });
});

// Health check with cache stats
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
    cache: cache.getStats()
  });
});

// API v1 routes with auth
app.use('/api/v1/fetch', apiKeyAuth, fetchRoutes);
app.use('/api/v1/download', apiKeyAuth, downloadRoutes);

// Backwards-compatible aliases (point /api/* to v1)
app.use('/api/fetch', apiKeyAuth, fetchRoutes);
app.use('/api/download', apiKeyAuth, downloadRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'TikTok Downloader API',
    version: '1.0.0',
    description: 'Production-ready API for downloading TikTok videos',
    endpoints: {
      fetch: {
        method: 'GET',
        path: '/api/v1/fetch',
        description: 'Extract metadata from TikTok video',
        parameters: {
          url: {
            type: 'string',
            required: true,
            description: 'TikTok video URL'
          }
        },
        example: '/api/v1/fetch?url=https://www.tiktok.com/@username/video/1234567890'
      },
      download: {
        method: 'GET',
        path: '/api/v1/download',
        description: 'Download TikTok video or audio',
        parameters: {
          url: {
            type: 'string',
            required: true,
            description: 'TikTok video URL'
          },
          type: {
            type: 'string',
            required: true,
            enum: ['nowm', 'wm', 'audio'],
            description: 'Download type: nowm (no watermark), wm (with watermark), audio'
          }
        },
        example: '/api/v1/download?type=nowm&url=https://www.tiktok.com/@username/video/1234567890'
      }
    }
  });
});

// 404 handler for undefined routes
app.use('*', notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled rejection');
  process.exit(1);
});

module.exports = app;
