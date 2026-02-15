// Mock httpClient before requiring tiktokService
jest.mock('../../src/utils/httpClient', () => ({
  get: jest.fn(),
  stream: jest.fn(),
}));

const httpClient = require('../../src/utils/httpClient');
const tiktokService = require('../../src/services/tiktokService');
const { cache } = require('../../src/utils/cache');

// Helper: build a tikwm API response
function buildApiResponse(overrides = {}) {
  return {
    data: {
      code: 0,
      data: {
        id: '7777777777',
        title: 'Dancing cat video #viral',
        author: { unique_id: 'catdancer', nickname: 'Cat Dancer' },
        play: 'https://v16.tiktokcdn.com/video_nowm.mp4',
        wmplay: 'https://v16.tiktokcdn.com/video_wm.mp4',
        music: 'https://sf16.tiktokcdn.com/audio.mp3',
        cover: 'https://p16.tiktokcdn.com/cover.jpg',
        origin_cover: 'https://p16.tiktokcdn.com/origin_cover.jpg',
        ...overrides,
      },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  cache.flushAll();
});

describe('TikTokService', () => {
  // ─── fetchMetadata ────────────────────────────────────────────────
  describe('fetchMetadata', () => {
    const validUrl = 'https://www.tiktok.com/@catdancer/video/7777777777';

    it('returns metadata for a valid URL', async () => {
      httpClient.get.mockResolvedValue(buildApiResponse());

      const meta = await tiktokService.fetchMetadata(validUrl);

      expect(meta.username).toBe('catdancer');
      expect(meta.caption).toBe('Dancing cat video #viral');
      expect(meta.video_id).toBe('7777777777');
      expect(meta.no_wm).toContain('video_nowm.mp4');
      expect(meta.wm).toContain('video_wm.mp4');
      expect(meta.audio).toContain('audio.mp3');
      expect(meta.thumbnail).toContain('cover.jpg');
      expect(httpClient.get).toHaveBeenCalledTimes(1);
    });

    it('uses cache on second call', async () => {
      httpClient.get.mockResolvedValue(buildApiResponse());

      await tiktokService.fetchMetadata(validUrl);
      await tiktokService.fetchMetadata(validUrl);

      expect(httpClient.get).toHaveBeenCalledTimes(1);
    });

    it('falls back to nickname when unique_id missing', async () => {
      httpClient.get.mockResolvedValue(
        buildApiResponse({ author: { nickname: 'FallbackName' } })
      );

      const meta = await tiktokService.fetchMetadata(validUrl);
      expect(meta.username).toBe('FallbackName');
    });

    it('falls back to origin_cover when cover missing', async () => {
      httpClient.get.mockResolvedValue(
        buildApiResponse({ cover: null, origin_cover: 'https://origin.jpg' })
      );

      const meta = await tiktokService.fetchMetadata(validUrl);
      expect(meta.thumbnail).toBe('https://origin.jpg');
    });

    it('trims caption whitespace', async () => {
      httpClient.get.mockResolvedValue(
        buildApiResponse({ title: '  spaced out  ' })
      );

      const meta = await tiktokService.fetchMetadata(validUrl);
      expect(meta.caption).toBe('spaced out');
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

    it('throws when API returns error code', async () => {
      httpClient.get.mockResolvedValue({ data: { code: -1, data: null } });

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
