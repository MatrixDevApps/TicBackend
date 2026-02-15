const cheerio = require('cheerio');
const httpClient = require('../utils/httpClient');
const Validator = require('../utils/validator');
const { logger } = require('../utils/logger');
const { cache, getCacheKey } = require('../utils/cache');

class TikTokService {
  constructor() {
    this.baseURL = 'https://www.tiktok.com';
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

      const response = await httpClient.get(sanitizedURL, {
        headers: {
          'Referer': 'https://www.tiktok.com/',
          'Origin': 'https://www.tiktok.com'
        }
      });

      const html = response.data;
      const $ = cheerio.load(html);

      const metadata = this.extractMetadataFromHTML(html, $);

      if (!metadata.username || !metadata.video_id) {
        throw new Error('Failed to extract video metadata');
      }

      cache.set(cacheKey, metadata);
      return metadata;
    } catch (error) {
      throw new Error(`Failed to fetch TikTok metadata: ${error.message}`);
    }
  }

  extractMetadataFromHTML(html, $) {
    let metadata = {
      username: null,
      caption: null,
      thumbnail: null,
      no_wm: null,
      wm: null,
      audio: null,
      video_id: null
    };

    try {
      // Method 1: Extract from SIGI_STATE (Primary method)
      const sigiStateMatch = html.match(/window\["SIGI_STATE"\]\s*=\s*({.+?});/);
      if (sigiStateMatch) {
        try {
          const sigiState = JSON.parse(sigiStateMatch[1]);
          const itemModule = sigiState?.ItemModule || {};
          const videoData = Object.values(itemModule)[0];

          if (videoData) {
            metadata.username = videoData.author?.uniqueId || videoData.author?.id;
            metadata.caption = videoData.desc || '';
            metadata.video_id = videoData.id;

            const videoAddr = videoData.video?.downloadAddr || videoData.video?.playAddr;
            const coverAddr = videoData.video?.cover || videoData.video?.dynamicCover;
            const musicAddr = videoData.music?.playUrl;

            if (videoAddr) {
              metadata.no_wm = videoAddr;
              metadata.wm = videoAddr;
            }

            if (coverAddr) {
              metadata.thumbnail = coverAddr;
            }

            if (musicAddr) {
              metadata.audio = musicAddr;
            }
          }
        } catch (parseError) {
          logger.warn({ err: parseError }, 'Failed to parse SIGI_STATE');
        }
      }

      // Method 2: Extract from __UNIVERSAL_DATA_FOR_REHYDRATION__ (Backup method)
      if (!metadata.username) {
        const universalDataMatch = html.match(/window\["__UNIVERSAL_DATA_FOR_REHYDRATION__"\]\s*=\s*({.+?});/);
        if (universalDataMatch) {
          try {
            const universalData = JSON.parse(universalDataMatch[1]);
            const videoData = universalData?.default?.["webapp.video-detail"]?.["*"]?.statusCode === 0
              ? universalData.default["webapp.video-detail"]["*"].itemInfo?.itemStruct
              : null;

            if (videoData) {
              metadata.username = videoData.author?.uniqueId;
              metadata.caption = videoData.desc || '';
              metadata.video_id = videoData.id;

              const videoAddr = videoData.video?.downloadAddr || videoData.video?.playAddr;
              const coverAddr = videoData.video?.cover;
              const musicAddr = videoData.music?.playUrl;

              if (videoAddr) {
                metadata.no_wm = videoAddr;
                metadata.wm = videoAddr;
              }

              if (coverAddr) {
                metadata.thumbnail = coverAddr;
              }

              if (musicAddr) {
                metadata.audio = musicAddr;
              }
            }
          } catch (parseError) {
            logger.warn({ err: parseError }, 'Failed to parse universal data');
          }
        }
      }

      // Method 3: Extract from meta tags (Last resort)
      if (!metadata.username) {
        metadata.username = $('meta[property="profile:username"]').attr('content') ||
                           $('meta[name="twitter:title"]').attr('content')?.split(' ')[0];
        metadata.caption = $('meta[property="og:description"]').attr('content') ||
                          $('meta[name="description"]').attr('content');
        metadata.thumbnail = $('meta[property="og:image"]').attr('content');
      }

      if (metadata.caption) {
        metadata.caption = metadata.caption.trim();
      }

      return metadata;
    } catch (error) {
      throw new Error(`Failed to extract metadata: ${error.message}`);
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
