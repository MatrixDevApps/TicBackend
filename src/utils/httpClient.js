const axios = require('axios');
const UserAgent = require('user-agents');
const { logger } = require('./logger');

class HTTPClient {
  constructor() {
    this.userAgent = new UserAgent();
    this.timeout = 30000; // 30 seconds
  }

  getRandomUserAgent() {
    return this.userAgent.toString();
  }

  getRandomHeaders() {
    return {
      'User-Agent': this.getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-User': '?1',
      'Sec-Fetch-Dest': 'document',
      'Cache-Control': 'max-age=0'
    };
  }

  async get(url, options = {}) {
    const config = {
      method: 'GET',
      url,
      timeout: this.timeout,
      headers: {
        ...this.getRandomHeaders(),
        ...options.headers
      },
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 300;
      },
      ...options
    };

    try {
      const response = await axios(config);
      return response;
    } catch (error) {
      logger.error({ url, code: error.code }, 'HTTP GET failed');
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout - TikTok server took too long to respond');
      }
      if (error.response) {
        throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      }
      throw new Error(`Network error: ${error.message}`);
    }
  }

  async stream(url, options = {}) {
    const config = {
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: this.timeout,
      headers: {
        ...this.getRandomHeaders(),
        ...options.headers
      },
      maxRedirects: 5,
      ...options
    };

    try {
      const response = await axios(config);
      return response;
    } catch (error) {
      logger.error({ url, code: error.code }, 'HTTP stream failed');
      if (error.code === 'ECONNABORTED') {
        throw new Error('Stream timeout - Failed to download file');
      }
      if (error.response) {
        throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      }
      throw new Error(`Network error: ${error.message}`);
    }
  }
}

module.exports = new HTTPClient();