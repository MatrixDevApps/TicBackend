const { URL } = require('url');

class Validator {
  static isValidTikTokURL(urlString) {
    try {
      const url = new URL(urlString);
      
      // Check if it's a TikTok domain
      const validDomains = [
        'tiktok.com',
        'www.tiktok.com',
        'm.tiktok.com',
        'vm.tiktok.com'
      ];

      const hostname = url.hostname.toLowerCase();
      if (!validDomains.includes(hostname)) {
        return false;
      }

      // Check if it contains video patterns
      const pathname = url.pathname.toLowerCase();
      
      // Match patterns like:
      // /@username/video/123456789
      // /t/abcdefg/
      // /v/123456789.html
      const videoPatterns = [
        /\/@[\w.-]+\/video\/\d+/,  // Standard video URL
        /\/t\/[\w-]+/,             // Short URL
        /\/v\/\d+/,                // Alternative video format
        /\/share\/video\/\d+/      // Share URL format
      ];

      return videoPatterns.some(pattern => pattern.test(pathname));
    } catch (error) {
      return false;
    }
  }

  static isValidDownloadType(type) {
    const validTypes = ['nowm', 'wm', 'audio'];
    return validTypes.includes(type);
  }

  static sanitizeURL(urlString) {
    try {
      const url = new URL(urlString);
      
      // Remove tracking parameters
      const paramsToRemove = ['_r', 'checksum', 'u_code', 'preview_pb', 'language', 'timestamp'];
      paramsToRemove.forEach(param => url.searchParams.delete(param));
      
      return url.toString();
    } catch (error) {
      throw new Error('Invalid URL format');
    }
  }

  static extractVideoId(urlString) {
    try {
      const url = new URL(urlString);
      const pathname = url.pathname;
      
      // Extract video ID from different URL formats
      let videoId = null;
      
      // Standard format: /@username/video/123456789
      const standardMatch = pathname.match(/\/@[\w.-]+\/video\/(\d+)/);
      if (standardMatch) {
        videoId = standardMatch[1];
      }
      
      // Short URL format: /t/abcdefg/
      const shortMatch = pathname.match(/\/t\/([\w-]+)/);
      if (shortMatch) {
        videoId = shortMatch[1];
      }
      
      // Alternative format: /v/123456789
      const altMatch = pathname.match(/\/v\/(\d+)/);
      if (altMatch) {
        videoId = altMatch[1];
      }
      
      // Share format: /share/video/123456789
      const shareMatch = pathname.match(/\/share\/video\/(\d+)/);
      if (shareMatch) {
        videoId = shareMatch[1];
      }
      
      return videoId;
    } catch (error) {
      return null;
    }
  }

  static isSSRFSafe(urlString) {
    try {
      const url = new URL(urlString);
      const hostname = url.hostname.toLowerCase();
      
      // Block internal networks and localhost
      const blockedPatterns = [
        /^localhost$/,
        /^127\./,
        /^10\./,
        /^192\.168\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^169\.254\./,
        /^0\./,
        /^::1$/,
        /^fe80:/,
        /^fc00:/,
        /^fd00:/
      ];
      
      // Check if hostname matches any blocked pattern
      if (blockedPatterns.some(pattern => pattern.test(hostname))) {
        return false;
      }
      
      // Only allow HTTP/HTTPS protocols
      if (!['http:', 'https:'].includes(url.protocol)) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = Validator;