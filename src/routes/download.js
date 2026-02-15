const express = require('express');
const { query, validationResult } = require('express-validator');
const tiktokService = require('../services/tiktokService');
const httpClient = require('../utils/httpClient');
const Validator = require('../utils/validator');
const { downloadLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

const validateDownloadRequest = [
  query('url')
    .notEmpty()
    .withMessage('URL parameter is required')
    .custom(async (value) => {
      if (!Validator.isValidTikTokURL(value)) {
        throw new Error('Invalid or unsupported TikTok URL');
      }
      if (!Validator.isSSRFSafe(value)) {
        throw new Error('URL not allowed for security reasons');
      }
      return true;
    }),
  query('type')
    .notEmpty()
    .withMessage('Type parameter is required')
    .custom(async (value) => {
      if (!Validator.isValidDownloadType(value)) {
        throw new Error('Invalid download type. Supported types: nowm, wm, audio');
      }
      return true;
    })
];

router.get('/',
  downloadLimiter,
  validateDownloadRequest,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: true,
        message: errors.array()[0].msg
      });
    }

    const { url, type } = req.query;
    const log = req.log || logger;

    try {
      log.info({ url, type }, 'download request');

      const metadata = await tiktokService.fetchMetadata(url);
      const downloadUrl = tiktokService.resolveDownloadUrl(type, metadata);

      if (!downloadUrl) {
        return res.status(404).json({
          error: true,
          message: `${type} download not available for this video`
        });
      }

      const directUrl = await tiktokService.getDirectDownloadURL(downloadUrl);
      const filename = tiktokService.generateFilename(metadata, type);
      const contentType = type === 'audio' ? 'audio/mpeg' : 'video/mp4';

      res.set({
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Download-Type': type,
        'X-Original-URL': url
      });

      const response = await httpClient.stream(directUrl, {
        timeout: 60000,
        responseType: 'stream'
      });

      response.data.on('error', (error) => {
        log.error({ err: error }, 'stream error');
        if (!res.headersSent) {
          res.status(500).json({
            error: true,
            message: 'Failed to stream file'
          });
        }
      });

      response.data.pipe(res);

      log.info({ type, username: metadata.username }, 'streaming started');

      req.on('close', () => {
        log.info('client disconnected during download');
        response.data.destroy();
      });
    } catch (error) {
      log.error({ url, type, err: error }, 'download error');

      if (res.headersSent) {
        return res.destroy();
      }

      if (error.message.includes('Invalid or unsupported TikTok URL')) {
        return res.status(400).json({
          error: true,
          message: 'Invalid or unsupported TikTok URL'
        });
      }

      if (error.message.includes('Invalid download type')) {
        return res.status(400).json({
          error: true,
          message: 'Invalid download type. Supported types: nowm, wm, audio'
        });
      }

      throw error;
    }
  })
);

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'download',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
