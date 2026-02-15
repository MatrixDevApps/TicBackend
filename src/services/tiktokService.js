const httpClient = require('../utils/httpClient');
const Validator = require('../utils/validator');
const { logger } = require('../utils/logger');
const { cache, getCacheKey } = require('../utils/cache');

class TikTokService {
  constructor() {
    this.apiBase = 'https://www.tikwm.com/api/';
  }

  async fetchMetadata(url) {
    try {
      if (!Validator.isValidTikTokURL(url)) {
        throw new Error('Invalid or unsupported TikTok URL');
      }

      if (!Validator.isSSRFSafe(url)) {
        throw new Error('URL not allowed for security reasons');
      }

      const sanitizedURL = Validator.sanitizeURL(url);
      const cacheKey = getCacheKey(sanitizedURL);

      const cached = cache.get(cacheKey);
      if (cached) {
        logger.debug({ url: sanitizedURL }, 'cache hit');
        return cached;
      }

      const response = await httpClient.get(this.apiBase, {
        params: { url: sanitizedURL },
        headers: {
          'Accept': 'application/json',
        },
      });

      const body = response.data;

      if (body.code !== 0 || !body.data) {
        throw new Error('Failed to extract video metadata');
      }

      const d = body.data;

      const metadata = {
        username: d.author?.unique_id || d.author?.nickname || null,
        caption: (d.title || '').trim(),
        thumbnail: d.cover || d.origin_cover || null,
        no_wm: d.play || null,
        wm: d.wmplay || d.play || null,
        audio: d.music || null,
        video_id: String(d.id || ''),
      };

      if (!metadata.username || !metadata.video_id) {
        throw new Error('Failed to extract video metadata');
      }

      cache.set(cacheKey, metadata);
      return metadata;
    } catch (error) {
      if (error.message.includes('Invalid or unsupported TikTok URL') ||
          error.message.includes('URL not allowed')) {
        throw error;
      }
      throw new Error(`Failed to fetch TikTok metadata: ${error.message}`);
    }
  }

  resolveDownloadUrl(type, metadata) {
    switch (type) {
      case 'nowm':
        return metadata.no_wm;
      case 'wm':
        return metadata.wm || metadata.no_wm;
      case 'audio':
        return metadata.audio;
      default:
        throw new Error('Invalid download type');
    }
  }

  async getDirectDownloadURL(url) {
    try {
      const response = await httpClient.get(url, {
        maxRedirects: 10,
        validateStatus: (status) => status >= 200 && status < 400
      });

      return response.request.res.responseUrl || response.config.url || url;
    } catch (error) {
      return url;
    }
  }

  getFileExtension(type) {
    switch (type) {
      case 'nowm':
      case 'wm':
        return '.mp4';
      case 'audio':
        return '.mp3';
      default:
        return '.mp4';
    }
  }

  generateFilename(metadata, type) {
    const username = metadata.username || 'unknown';
    const videoId = metadata.video_id || 'video';
    const extension = this.getFileExtension(type);
    const timestamp = Date.now();

    const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${safeUsername}_${videoId}_${type}_${timestamp}${extension}`;
  }
}

module.exports = new TikTokService();
