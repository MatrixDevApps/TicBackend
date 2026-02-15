const cheerio = require('cheerio');

// Mock httpClient before requiring tiktokService
jest.mock('../../src/utils/httpClient', () => ({
  get: jest.fn(),
  stream: jest.fn(),
}));

const httpClient = require('../../src/utils/httpClient');
const tiktokService = require('../../src/services/tiktokService');
const { cache } = require('../../src/utils/cache');

// Helper: build a fake TikTok HTML page with SIGI_STATE
function buildSigiHtml(videoData) {
  const sigiState = { ItemModule: { '123': videoData } };
  return `<html><script>window["SIGI_STATE"]=${JSON.stringify(sigiState)};</script></html>`;
}

// Helper: build a fake TikTok HTML page with __UNIVERSAL_DATA_FOR_REHYDRATION__
function buildUniversalHtml(videoData) {
  const universalData = {
    default: {
      'webapp.video-detail': {
        '*': {
          statusCode: 0,
          itemInfo: { itemStruct: videoData },
        },
      },
    },
  };
  return `<html><script>window["__UNIVERSAL_DATA_FOR_REHYDRATION__"]=${JSON.stringify(universalData)};</script></html>`;
}

const sampleVideoData = {
  id: '7777777777',
  desc: 'Dancing cat video #viral',
  author: { uniqueId: 'catdancer', id: 'uid99' },
  video: {
    downloadAddr: 'https://v16.tiktokcdn.com/video.mp4',
    playAddr: 'https://v16.tiktokcdn.com/play.mp4',
    cover: 'https://p16.tiktokcdn.com/cover.jpg',
    dynamicCover: 'https://p16.tiktokcdn.com/dynamic.gif',
  },
  music: { playUrl: 'https://sf16.tiktokcdn.com/audio.mp3' },
};

beforeEach(() => {
  jest.clearAllMocks();
  cache.flushAll();
});

describe('TikTokService', () => {
  // ─── extractMetadataFromHTML ──────────────────────────────────────
  describe('extractMetadataFromHTML', () => {
    it('extracts all fields from SIGI_STATE', () => {
      const html = buildSigiHtml(sampleVideoData);
      const $ = cheerio.load(html);
      const meta = tiktokService.extractMetadataFromHTML(html, $);

      expect(meta.username).toBe('catdancer');
      expect(meta.caption).toBe('Dancing cat video #viral');
      expect(meta.video_id).toBe('7777777777');
      expect(meta.no_wm).toBe('https://v16.tiktokcdn.com/video.mp4');
      expect(meta.wm).toBe('https://v16.tiktokcdn.com/video.mp4');
      expect(meta.audio).toBe('https://sf16.tiktokcdn.com/audio.mp3');
      expect(meta.thumbnail).toBe('https://p16.tiktokcdn.com/cover.jpg');
    });

    it('falls back to playAddr when downloadAddr is missing', () => {
      const data = {
        ...sampleVideoData,
        video: { playAddr: 'https://play.url/v.mp4', cover: 'https://c.jpg' },
      };
      const html = buildSigiHtml(data);
      const $ = cheerio.load(html);
      const meta = tiktokService.extractMetadataFromHTML(html, $);

      expect(meta.no_wm).toBe('https://play.url/v.mp4');
    });

    it('falls back to author.id when uniqueId is missing', () => {
      const data = { ...sampleVideoData, author: { id: 'fallback_id' } };
      const html = buildSigiHtml(data);
      const $ = cheerio.load(html);
      const meta = tiktokService.extractMetadataFromHTML(html, $);

      expect(meta.username).toBe('fallback_id');
    });

    it('extracts from __UNIVERSAL_DATA_FOR_REHYDRATION__ when SIGI_STATE absent', () => {
      const html = buildUniversalHtml(sampleVideoData);
      const $ = cheerio.load(html);
      const meta = tiktokService.extractMetadataFromHTML(html, $);

      expect(meta.username).toBe('catdancer');
      expect(meta.video_id).toBe('7777777777');
      expect(meta.no_wm).toBe('https://v16.tiktokcdn.com/video.mp4');
    });

    it('falls back to meta tags when no JS data', () => {
      const html = `<html><head>
        <meta property="profile:username" content="metatag_user" />
        <meta property="og:description" content="A cool video" />
        <meta property="og:image" content="https://thumb.jpg" />
      </head></html>`;
      const $ = cheerio.load(html);
      const meta = tiktokService.extractMetadataFromHTML(html, $);

      expect(meta.username).toBe('metatag_user');
      expect(meta.caption).toBe('A cool video');
      expect(meta.thumbnail).toBe('https://thumb.jpg');
    });

    it('trims caption whitespace', () => {
      const data = { ...sampleVideoData, desc: '  spaced out  ' };
      const html = buildSigiHtml(data);
      const $ = cheerio.load(html);
      const meta = tiktokService.extractMetadataFromHTML(html, $);

      expect(meta.caption).toBe('spaced out');
    });

    it('returns falsy fields for empty HTML', () => {
      const html = '<html></html>';
      const $ = cheerio.load(html);
      const meta = tiktokService.extractMetadataFromHTML(html, $);

      expect(meta.username).toBeFalsy();
      expect(meta.no_wm).toBeFalsy();
      expect(meta.audio).toBeFalsy();
    });
  });

  // ─── fetchMetadata (with mocked HTTP) ─────────────────────────────
  describe('fetchMetadata', () => {
    const validUrl = 'https://www.tiktok.com/@catdancer/video/7777777777';

    it('returns metadata for a valid URL', async () => {
      const html = buildSigiHtml(sampleVideoData);
      httpClient.get.mockResolvedValue({ data: html });

      const meta = await tiktokService.fetchMetadata(validUrl);

      expect(meta.username).toBe('catdancer');
      expect(meta.video_id).toBe('7777777777');
      expect(httpClient.get).toHaveBeenCalledTimes(1);
    });

    it('uses cache on second call', async () => {
      const html = buildSigiHtml(sampleVideoData);
      httpClient.get.mockResolvedValue({ data: html });

      await tiktokService.fetchMetadata(validUrl);
      await tiktokService.fetchMetadata(validUrl);

      // httpClient.get should only be called once thanks to caching
      expect(httpClient.get).toHaveBeenCalledTimes(1);
    });

    it('throws for invalid TikTok URL', async () => {
      await expect(
        tiktokService.fetchMetadata('https://youtube.com/watch?v=123')
      ).rejects.toThrow('Invalid or unsupported TikTok URL');
    });

    it('throws for SSRF-unsafe URL', async () => {
      await expect(
        tiktokService.fetchMetadata('http://localhost/@user/video/123')
      ).rejects.toThrow();
    });

    it('throws when metadata extraction fails', async () => {
      httpClient.get.mockResolvedValue({ data: '<html></html>' });

      await expect(tiktokService.fetchMetadata(validUrl)).rejects.toThrow(
        'Failed to extract video metadata'
      );
    });

    it('throws when HTTP request fails', async () => {
      httpClient.get.mockRejectedValue(new Error('Network error: timeout'));

      await expect(tiktokService.fetchMetadata(validUrl)).rejects.toThrow(
        'Failed to fetch TikTok metadata'
      );
    });
  });

  // ─── resolveDownloadUrl ───────────────────────────────────────────
  describe('resolveDownloadUrl', () => {
    const metadata = {
      no_wm: 'https://cdn.tiktok.com/nowm.mp4',
      wm: 'https://cdn.tiktok.com/wm.mp4',
      audio: 'https://cdn.tiktok.com/audio.mp3',
    };

    it('returns no_wm for "nowm"', () => {
      expect(tiktokService.resolveDownloadUrl('nowm', metadata)).toBe(metadata.no_wm);
    });

    it('returns wm for "wm"', () => {
      expect(tiktokService.resolveDownloadUrl('wm', metadata)).toBe(metadata.wm);
    });

    it('returns audio for "audio"', () => {
      expect(tiktokService.resolveDownloadUrl('audio', metadata)).toBe(metadata.audio);
    });

    it('falls back to no_wm when wm is null', () => {
      const meta = { no_wm: 'https://fallback.mp4', wm: null };
      expect(tiktokService.resolveDownloadUrl('wm', meta)).toBe('https://fallback.mp4');
    });

    it('throws for unknown type', () => {
      expect(() => tiktokService.resolveDownloadUrl('gif', metadata)).toThrow(
        'Invalid download type'
      );
    });
  });

  // ─── getDirectDownloadURL ─────────────────────────────────────────
  describe('getDirectDownloadURL', () => {
    it('returns responseUrl after redirect', async () => {
      httpClient.get.mockResolvedValue({
        request: { res: { responseUrl: 'https://final.url/video.mp4' } },
        config: { url: 'https://original.url' },
      });

      const result = await tiktokService.getDirectDownloadURL('https://original.url');
      expect(result).toBe('https://final.url/video.mp4');
    });

    it('falls back to config.url when responseUrl is missing', async () => {
      httpClient.get.mockResolvedValue({
        request: { res: {} },
        config: { url: 'https://config.url/video.mp4' },
      });

      const result = await tiktokService.getDirectDownloadURL('https://original.url');
      expect(result).toBe('https://config.url/video.mp4');
    });

    it('returns original URL on error', async () => {
      httpClient.get.mockRejectedValue(new Error('fail'));

      const result = await tiktokService.getDirectDownloadURL('https://original.url');
      expect(result).toBe('https://original.url');
    });
  });

  // ─── generateFilename ────────────────────────────────────────────
  describe('generateFilename', () => {
    it('generates correct format', () => {
      const filename = tiktokService.generateFilename(
        { username: 'testuser', video_id: '12345' },
        'nowm'
      );
      expect(filename).toMatch(/^testuser_12345_nowm_\d+\.mp4$/);
    });

    it('sanitizes special characters', () => {
      const filename = tiktokService.generateFilename(
        { username: 'u$er!', video_id: '1' },
        'wm'
      );
      expect(filename).not.toMatch(/[$!]/);
      expect(filename).toMatch(/\.mp4$/);
    });

    it('uses .mp3 for audio type', () => {
      const filename = tiktokService.generateFilename(
        { username: 'u', video_id: '1' },
        'audio'
      );
      expect(filename).toMatch(/\.mp3$/);
    });

    it('uses defaults when metadata is empty', () => {
      const filename = tiktokService.generateFilename({}, 'nowm');
      expect(filename).toMatch(/^unknown_video_nowm_\d+\.mp4$/);
    });
  });

  // ─── getFileExtension ────────────────────────────────────────────
  describe('getFileExtension', () => {
    it.each([
      ['nowm', '.mp4'],
      ['wm', '.mp4'],
      ['audio', '.mp3'],
      ['unknown', '.mp4'],
    ])('returns %s for "%s"', (type, ext) => {
      expect(tiktokService.getFileExtension(type)).toBe(ext);
    });
  });
});
