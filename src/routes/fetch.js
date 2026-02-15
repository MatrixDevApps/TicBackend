const express = require('express');
const { query, validationResult } = require('express-validator');
const tiktokService = require('../services/tiktokService');
const Validator = require('../utils/validator');
const { fetchLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

const validateFetchRequest = [
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
    })
];

router.get('/',
  fetchLimiter,
  validateFetchRequest,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: true,
        message: errors.array()[0].msg
      });
    }

    const { url } = req.query;
    const log = req.log || logger;

    try {
      log.info({ url }, 'fetch request');

      const metadata = await tiktokService.fetchMetadata(url);

      if (!metadata.username) {
        throw new Error('Failed to extract video metadata');
      }

      const response = {
        username: metadata.username || '',
        caption: metadata.caption || '',
        thumbnail: metadata.thumbnail || '',
        no_wm: metadata.no_wm || '',
        wm: metadata.wm || metadata.no_wm || '',
        audio: metadata.audio || ''
      };

      log.info({ username: metadata.username }, 'fetch success');

      res.json(response);
    } catch (error) {
      log.error({ url, err: error }, 'fetch error');

      if (error.message.includes('Invalid or unsupported TikTok URL')) {
        return res.status(400).json({
          error: true,
          message: 'Invalid or unsupported TikTok URL'
        });
      }

      throw error;
    }
  })
);

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'fetch',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
