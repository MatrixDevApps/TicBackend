const { Readable } = require('stream');

// Mock httpClient so integration tests don't call TikTok
jest.mock('../../src/utils/httpClient', () => ({
  get: jest.fn(),
  stream: jest.fn(),
}));

const request = require('supertest');
const httpClient = require('../../src/utils/httpClient');
const app = require('../../src/app');
const { cache } = require('../../src/utils/cache');

// Build fake TikTok HTML with SIGI_STATE
function buildTikTokHtml(overrides = {}) {
  const videoData = {
    id: '9999999999',
    desc: 'Test video caption',
    author: { uniqueId: 'testcreator', id: 'uid1' },
    video: {
      downloadAddr: 'https://v16.tiktokcdn.com/video_nowm.mp4',
      playAddr: 'https://v16.tiktokcdn.com/video_play.mp4',
      cover: 'https://p16.tiktokcdn.com/cover.jpg',
    },
    music: { playUrl: 'https://sf16.tiktokcdn.com/music.mp3' },
    ...overrides,
  };
  const sigiState = { ItemModule: { '9999999999': videoData } };
  return `<html><script>window["SIGI_STATE"]=${JSON.stringify(sigiState)};</script></html>`;
}

const VALID_URL = 'https://www.tiktok.com/@testcreator/video/9999999999';

beforeEach(() => {
  jest.clearAllMocks();
  cache.flushAll();
});

// ─── Static Endpoints ──────────────────────────────────────────────
describe('Static Endpoints', () => {
  describe('GET /', () => {
    it('returns service info with correct shape', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        service: 'TikTok Downloader API',
        version: '1.0.0',
      });
      expect(res.body.endpoints).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /health', () => {
    it('returns health status with cache stats', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.uptime).toBeGreaterThan(0);
      expect(res.body.memory).toHaveProperty('rss');
      expect(res.body.cache).toHaveProperty('hits');
      expect(res.body.cache).toHaveProperty('misses');
      expect(res.body.cache).toHaveProperty('keys');
    });
  });

  describe('GET /api', () => {
    it('returns API documentation', async () => {
      const res = await request(app).get('/api');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('TikTok Downloader API');
      expect(res.body.endpoints.fetch).toBeDefined();
      expect(res.body.endpoints.download).toBeDefined();
    });
  });

  describe('404 handler', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request(app).get('/this/does/not/exist');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe(true);
      expect(res.body.message).toContain('not found');
    });
  });
});

// ─── Fetch Endpoint ────────────────────────────────────────────────
describe('GET /api/fetch', () => {
  it('returns 400 when url param is missing', async () => {
    const res = await request(app).get('/api/fetch');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
    expect(res.body.message).toContain('URL');
  });

  it('returns 400 for non-TikTok URL', async () => {
    const res = await request(app).get('/api/fetch?url=https://youtube.com/watch');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
  });

  it('returns 400 for SSRF attempt', async () => {
    const res = await request(app).get(
      '/api/fetch?url=http://127.0.0.1/@user/video/123'
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
  });

  it('returns metadata for a valid TikTok URL', async () => {
    httpClient.get.mockResolvedValue({ data: buildTikTokHtml() });

    const res = await request(app).get(`/api/fetch?url=${encodeURIComponent(VALID_URL)}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('testcreator');
    expect(res.body.caption).toBe('Test video caption');
    expect(res.body.no_wm).toContain('video_nowm.mp4');
    expect(res.body.audio).toContain('music.mp3');
    expect(res.body.thumbnail).toContain('cover.jpg');
  });

  it('returns 422 when TikTok returns empty page', async () => {
    httpClient.get.mockResolvedValue({ data: '<html></html>' });

    const res = await request(app).get(`/api/fetch?url=${encodeURIComponent(VALID_URL)}`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe(true);
  });
});

// ─── Fetch v1 Endpoint ─────────────────────────────────────────────
describe('GET /api/v1/fetch', () => {
  it('returns 400 when url param is missing', async () => {
    const res = await request(app).get('/api/v1/fetch');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
  });

  it('returns metadata (v1 works same as /api)', async () => {
    httpClient.get.mockResolvedValue({ data: buildTikTokHtml() });

    const res = await request(app).get(`/api/v1/fetch?url=${encodeURIComponent(VALID_URL)}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('testcreator');
  });
});

// ─── Download Endpoint ─────────────────────────────────────────────
describe('GET /api/download', () => {
  it('returns 400 without any params', async () => {
    const res = await request(app).get('/api/download');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
  });

  it('returns 400 for invalid download type', async () => {
    const res = await request(app).get(
      `/api/download?url=${encodeURIComponent(VALID_URL)}&type=gif`
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
  });

  it('returns 400 when url is missing but type is present', async () => {
    const res = await request(app).get('/api/download?type=nowm');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
  });

  it('streams video for valid nowm download request', async () => {
    // Mock fetchMetadata (first get call returns HTML)
    httpClient.get.mockResolvedValue({
      data: buildTikTokHtml(),
      request: { res: { responseUrl: 'https://final.cdn/video.mp4' } },
      config: { url: 'https://v16.tiktokcdn.com/video_nowm.mp4' },
    });

    // Mock stream response
    const fakeStream = new Readable({
      read() {
        this.push(Buffer.from('fake-video-data'));
        this.push(null);
      },
    });
    httpClient.stream.mockResolvedValue({ data: fakeStream });

    const res = await request(app).get(
      `/api/download?url=${encodeURIComponent(VALID_URL)}&type=nowm`
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('video/mp4');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('testcreator');
    expect(res.headers['x-download-type']).toBe('nowm');
  });

  it('streams audio for valid audio download request', async () => {
    httpClient.get.mockResolvedValue({
      data: buildTikTokHtml(),
      request: { res: { responseUrl: 'https://final.cdn/music.mp3' } },
      config: { url: 'https://sf16.tiktokcdn.com/music.mp3' },
    });

    const fakeStream = new Readable({
      read() {
        this.push(Buffer.from('fake-audio-data'));
        this.push(null);
      },
    });
    httpClient.stream.mockResolvedValue({ data: fakeStream });

    const res = await request(app).get(
      `/api/download?url=${encodeURIComponent(VALID_URL)}&type=audio`
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect(res.headers['content-disposition']).toContain('.mp3');
  });
});

// ─── Download v1 Endpoint ───────────────────────────────────────────
describe('GET /api/v1/download', () => {
  it('returns 400 without params', async () => {
    const res = await request(app).get('/api/v1/download');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
  });

  it('streams video (v1 works same as /api)', async () => {
    httpClient.get.mockResolvedValue({
      data: buildTikTokHtml(),
      request: { res: { responseUrl: 'https://final.cdn/video.mp4' } },
      config: { url: 'https://v16.tiktokcdn.com/video_nowm.mp4' },
    });

    const fakeStream = new Readable({
      read() {
        this.push(Buffer.from('fake-video-data'));
        this.push(null);
      },
    });
    httpClient.stream.mockResolvedValue({ data: fakeStream });

    const res = await request(app).get(
      `/api/v1/download?url=${encodeURIComponent(VALID_URL)}&type=wm`
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('video/mp4');
  });
});

// ─── API Key Authentication ─────────────────────────────────────────
describe('API Key Authentication', () => {
  const originalKeys = process.env.API_KEYS;

  afterEach(() => {
    if (originalKeys) {
      process.env.API_KEYS = originalKeys;
    } else {
      delete process.env.API_KEYS;
    }
  });

  it('allows requests when API_KEYS env is not set', async () => {
    delete process.env.API_KEYS;
    httpClient.get.mockResolvedValue({ data: buildTikTokHtml() });

    const res = await request(app).get(`/api/fetch?url=${encodeURIComponent(VALID_URL)}`);
    expect(res.status).not.toBe(401);
  });

  it('rejects requests with wrong API key', async () => {
    process.env.API_KEYS = 'correct-key-123';

    const res = await request(app)
      .get(`/api/fetch?url=${encodeURIComponent(VALID_URL)}`)
      .set('X-API-Key', 'wrong-key');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe(true);
    expect(res.body.message).toContain('API key');
  });

  it('rejects requests with no API key when keys are configured', async () => {
    process.env.API_KEYS = 'my-secret-key';

    const res = await request(app).get(`/api/fetch?url=${encodeURIComponent(VALID_URL)}`);
    expect(res.status).toBe(401);
  });

  it('accepts requests with correct API key in header', async () => {
    process.env.API_KEYS = 'my-secret-key';
    httpClient.get.mockResolvedValue({ data: buildTikTokHtml() });

    const res = await request(app)
      .get(`/api/fetch?url=${encodeURIComponent(VALID_URL)}`)
      .set('X-API-Key', 'my-secret-key');

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('testcreator');
  });

  it('accepts requests with correct API key in query param', async () => {
    process.env.API_KEYS = 'query-key-456';
    httpClient.get.mockResolvedValue({ data: buildTikTokHtml() });

    const res = await request(app).get(
      `/api/fetch?url=${encodeURIComponent(VALID_URL)}&apikey=query-key-456`
    );

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('testcreator');
  });

  it('supports multiple comma-separated API keys', async () => {
    process.env.API_KEYS = 'key-a, key-b, key-c';
    httpClient.get.mockResolvedValue({ data: buildTikTokHtml() });

    const resA = await request(app)
      .get(`/api/fetch?url=${encodeURIComponent(VALID_URL)}`)
      .set('X-API-Key', 'key-b');
    expect(resA.status).toBe(200);

    const resBad = await request(app)
      .get(`/api/fetch?url=${encodeURIComponent(VALID_URL)}`)
      .set('X-API-Key', 'key-d');
    expect(resBad.status).toBe(401);
  });

  it('does not require auth for /health or /', async () => {
    process.env.API_KEYS = 'some-key';

    const healthRes = await request(app).get('/health');
    expect(healthRes.status).toBe(200);

    const rootRes = await request(app).get('/');
    expect(rootRes.status).toBe(200);
  });
});

// ─── Caching ────────────────────────────────────────────────────────
describe('Caching', () => {
  it('serves cached response on second fetch', async () => {
    httpClient.get.mockResolvedValue({ data: buildTikTokHtml() });

    const res1 = await request(app).get(`/api/fetch?url=${encodeURIComponent(VALID_URL)}`);
    expect(res1.status).toBe(200);

    const res2 = await request(app).get(`/api/fetch?url=${encodeURIComponent(VALID_URL)}`);
    expect(res2.status).toBe(200);
    expect(res2.body.username).toBe('testcreator');

    // httpClient.get called once for HTML fetch, possibly again for redirect
    // But the key point: the TikTok page fetch should happen once
    const htmlFetchCalls = httpClient.get.mock.calls.filter(
      (call) => call[0].includes('tiktok.com')
    );
    expect(htmlFetchCalls.length).toBe(1);
  });

  it('cache stats appear in /health', async () => {
    httpClient.get.mockResolvedValue({ data: buildTikTokHtml() });

    // Make a fetch to populate cache
    await request(app).get(`/api/fetch?url=${encodeURIComponent(VALID_URL)}`);

    const res = await request(app).get('/health');
    expect(res.body.cache.keys).toBeGreaterThanOrEqual(1);
  });
});
