const Validator = require('../../src/utils/validator');

describe('Validator', () => {
  // ─── isValidTikTokURL ─────────────────────────────────────────────
  describe('isValidTikTokURL', () => {
    const valid = [
      ['standard video URL', 'https://www.tiktok.com/@user/video/1234567890'],
      ['mobile URL', 'https://m.tiktok.com/@user/video/1234567890'],
      ['short URL (vm)', 'https://vm.tiktok.com/t/abc123'],
      ['bare domain', 'https://tiktok.com/@user/video/1234567890'],
      ['share URL', 'https://www.tiktok.com/share/video/1234567890'],
      ['alt /v/ format', 'https://www.tiktok.com/v/1234567890'],
      ['username with dots', 'https://www.tiktok.com/@user.name/video/111'],
      ['username with hyphens', 'https://www.tiktok.com/@user-name/video/111'],
      ['URL with query params', 'https://www.tiktok.com/@user/video/123?lang=en'],
    ];

    it.each(valid)('accepts %s', (_label, url) => {
      expect(Validator.isValidTikTokURL(url)).toBe(true);
    });

    const invalid = [
      ['non-TikTok domain', 'https://www.youtube.com/watch?v=123'],
      ['TikTok profile (no video)', 'https://www.tiktok.com/@user'],
      ['TikTok homepage', 'https://www.tiktok.com/'],
      ['random string', 'not-a-url'],
      ['empty string', ''],
      ['javascript protocol', 'javascript:alert(1)'],
      ['ftp URL on non-TikTok domain', 'ftp://example.com/@user/video/123'],
      ['similar domain', 'https://faketiktok.com/@user/video/123'],
    ];

    it.each(invalid)('rejects %s', (_label, url) => {
      expect(Validator.isValidTikTokURL(url)).toBe(false);
    });
  });

  // ─── isValidDownloadType ───────────────────────────────────────────
  describe('isValidDownloadType', () => {
    it.each(['nowm', 'wm', 'audio'])('accepts "%s"', (type) => {
      expect(Validator.isValidDownloadType(type)).toBe(true);
    });

    it.each(['invalid', '', 'mp4', 'NOWM', 'video', null, undefined])(
      'rejects "%s"',
      (type) => {
        expect(Validator.isValidDownloadType(type)).toBe(false);
      }
    );
  });

  // ─── sanitizeURL ──────────────────────────────────────────────────
  describe('sanitizeURL', () => {
    it('removes tracking parameters', () => {
      const url =
        'https://www.tiktok.com/@user/video/123?_r=1&checksum=abc&language=en&u_code=x&preview_pb=1&timestamp=999';
      const sanitized = Validator.sanitizeURL(url);
      expect(sanitized).not.toContain('_r=');
      expect(sanitized).not.toContain('checksum=');
      expect(sanitized).not.toContain('language=');
      expect(sanitized).not.toContain('u_code=');
      expect(sanitized).not.toContain('preview_pb=');
      expect(sanitized).not.toContain('timestamp=');
    });

    it('preserves non-tracking query params', () => {
      const url = 'https://www.tiktok.com/@user/video/123?is_copy_url=1';
      const sanitized = Validator.sanitizeURL(url);
      expect(sanitized).toContain('is_copy_url=1');
    });

    it('returns clean URL when no tracking params', () => {
      const url = 'https://www.tiktok.com/@user/video/123';
      const sanitized = Validator.sanitizeURL(url);
      expect(sanitized).toBe('https://www.tiktok.com/@user/video/123');
    });

    it('throws on invalid URL', () => {
      expect(() => Validator.sanitizeURL('not-a-url')).toThrow('Invalid URL format');
    });
  });

  // ─── extractVideoId ───────────────────────────────────────────────
  describe('extractVideoId', () => {
    it('extracts from standard /@user/video/ID format', () => {
      expect(
        Validator.extractVideoId('https://www.tiktok.com/@user/video/1234567890')
      ).toBe('1234567890');
    });

    it('extracts from short /t/ID format', () => {
      expect(Validator.extractVideoId('https://vm.tiktok.com/t/abc123')).toBe('abc123');
    });

    it('extracts from /v/ID format', () => {
      expect(Validator.extractVideoId('https://www.tiktok.com/v/9876543210')).toBe(
        '9876543210'
      );
    });

    it('extracts from /share/video/ID format', () => {
      expect(
        Validator.extractVideoId('https://www.tiktok.com/share/video/5555555555')
      ).toBe('5555555555');
    });

    it('returns null for URL without video ID', () => {
      expect(Validator.extractVideoId('https://www.tiktok.com/@user')).toBeNull();
    });

    it('returns null for invalid URL', () => {
      expect(Validator.extractVideoId('not-a-url')).toBeNull();
    });
  });

  // ─── isSSRFSafe ───────────────────────────────────────────────────
  describe('isSSRFSafe', () => {
    it('allows external HTTPS URLs', () => {
      expect(Validator.isSSRFSafe('https://www.tiktok.com/@user/video/123')).toBe(true);
    });

    it('allows external HTTP URLs', () => {
      expect(Validator.isSSRFSafe('http://example.com/foo')).toBe(true);
    });

    const blocked = [
      ['localhost', 'http://localhost/path'],
      ['127.0.0.1', 'http://127.0.0.1/path'],
      ['127.x.x.x range', 'http://127.255.255.255/path'],
      ['10.x.x.x', 'http://10.0.0.1/path'],
      ['192.168.x.x', 'http://192.168.1.1/path'],
      ['172.16.x.x', 'http://172.16.0.1/path'],
      ['172.31.x.x', 'http://172.31.255.255/path'],
      ['169.254.x.x (link-local)', 'http://169.254.169.254/metadata'],
      ['0.x.x.x', 'http://0.0.0.0/path'],
      ['IPv6 loopback', 'http://::1/path'],
      ['ftp protocol', 'ftp://example.com/file'],
      ['file protocol', 'file:///etc/passwd'],
    ];

    it.each(blocked)('blocks %s', (_label, url) => {
      expect(Validator.isSSRFSafe(url)).toBe(false);
    });

    it('returns false for invalid URL', () => {
      expect(Validator.isSSRFSafe('not-a-url')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(Validator.isSSRFSafe('')).toBe(false);
    });
  });
});
