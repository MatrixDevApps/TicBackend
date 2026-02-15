# TikTok Video Downloader API

A production-ready REST API for downloading TikTok videos and extracting metadata. Built with Node.js, Express, and modern security practices.

## 🚀 Features

- **Video Metadata Extraction**: Get username, caption, thumbnail, and download URLs
- **Multiple Download Options**: No watermark, with watermark, and audio-only downloads
- **Production Security**: Helmet, CORS, rate limiting, and SSRF protection
- **User Agent Rotation**: Avoid TikTok blocking with randomized headers
- **Error Handling**: Comprehensive error responses and logging
- **Rate Limiting**: Configurable limits per IP address
- **Stream Downloads**: Efficient file streaming to clients

## 📋 API Endpoints

### 1. Fetch Video Metadata
```
GET /api/fetch?url=<tiktok_url>
```

**Response:**
```json
{
  "username": "user123",
  "caption": "Amazing video! #viral",
  "thumbnail": "https://...",
  "no_wm": "https://...",
  "wm": "https://...",
  "audio": "https://..."
}
```

**Error Response:**
```json
{
  "error": true,
  "message": "Invalid or unsupported TikTok URL"
}
```

### 2. Download Video/Audio
```
GET /api/download?type=<nowm|wm|audio>&url=<tiktok_url>
```

**Parameters:**
- `type`: Download type (`nowm` = no watermark, `wm` = with watermark, `audio` = audio only)
- `url`: TikTok video URL

**Response:** File stream with appropriate headers

### 3. Health Check
```
GET /health
```

### 4. API Documentation
```
GET /api
```

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 16+ 
- npm or yarn

### Local Development

1. **Clone and Install**
```bash
git clone <repository-url>
cd tiktok-downloader-api
npm install
```

2. **Environment Variables** (Optional)
Create `.env` file:
```env
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=*
```

3. **Start Development Server**
```bash
npm run dev
```

4. **Start Production Server**
```bash
npm start
```

### Testing the API

**Using curl:**
```bash
# Fetch metadata
curl "http://localhost:3000/api/fetch?url=https://www.tiktok.com/@username/video/1234567890"

# Download video (no watermark)
curl -o video.mp4 "http://localhost:3000/api/download?type=nowm&url=https://www.tiktok.com/@username/video/1234567890"

# Download audio
curl -o audio.mp3 "http://localhost:3000/api/download?type=audio&url=https://www.tiktok.com/@username/video/1234567890"
```

**Using Postman:**
1. Import the following as GET requests:
   - `http://localhost:3000/api/fetch?url=<TIKTOK_URL>`
   - `http://localhost:3000/api/download?type=nowm&url=<TIKTOK_URL>`

## 🚀 Deployment

### Deploy on Render

1. **Create Render Account** at [render.com](https://render.com)

2. **Connect Repository**
   - Link your GitHub repository
   - Select "Web Service"

3. **Configure Settings**
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: `NODE_ENV=production`

4. **Deploy**
   - Click "Create Web Service"
   - Your API will be live at `https://your-app.onrender.com`

### Deploy on Railway

1. **Create Railway Account** at [railway.app](https://railway.app)

2. **Deploy from GitHub**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login and deploy
   railway login
   railway link
   railway up
   ```

3. **Environment Variables**
   - Set `NODE_ENV=production` in Railway dashboard
   - Configure custom domain if needed

### Deploy on Vercel

1. **Install Vercel CLI**
```bash
npm install -g vercel
```

2. **Deploy**
```bash
vercel --prod
```

3. **Create `vercel.json`**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/server.js"
    }
  ]
}
```

### Deploy on Cloudflare Workers (Notes)

For Cloudflare Workers deployment, you'll need to:
1. Refactor to use Cloudflare Workers API
2. Replace Node.js specific modules
3. Use Cloudflare Workers KV for rate limiting
4. Adapt file streaming for Workers environment

*Note: Full Cloudflare Workers implementation requires significant modifications due to runtime differences.*

## 📊 Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| General API | 30 requests | 1 minute |
| `/api/fetch` | 20 requests | 1 minute |
| `/api/download` | 10 requests | 1 minute |

## 🔒 Security Features

- **Helmet**: Security headers and protection
- **CORS**: Configurable cross-origin resource sharing
- **Rate Limiting**: IP-based request throttling  
- **SSRF Protection**: Validates URLs to prevent server-side request forgery
- **Input Validation**: Comprehensive request validation
- **User Agent Rotation**: Randomized headers to avoid blocking
- **Error Sanitization**: Safe error responses in production

## 📁 Project Structure

```
/
├── src/
│   ├── app.js              # Express app configuration
│   ├── routes/
│   │   ├── fetch.js        # Metadata extraction endpoint
│   │   └── download.js     # File download endpoint
│   ├── services/
│   │   └── tiktokService.js # TikTok scraping logic
│   ├── middleware/
│   │   ├── rateLimit.js    # Rate limiting configuration
│   │   └── errorHandler.js # Global error handling
│   └── utils/
│       ├── validator.js    # URL and input validation
│       └── httpClient.js   # HTTP client with user-agent rotation
├── server.js               # Server entry point
├── package.json           # Dependencies and scripts
└── README.md              # This file
```

## 🏗️ Architecture Overview

The API follows a layered architecture:

1. **Routes Layer**: Handle HTTP requests and responses
2. **Service Layer**: Business logic for TikTok interaction
3. **Middleware Layer**: Security, validation, and error handling
4. **Utility Layer**: Reusable components and helpers

**Data Flow:**
```
Client Request → Rate Limit → Validation → TikTok Service → Response
```

## ⚠️ Important Notes

- **TikTok Terms**: Ensure compliance with TikTok's Terms of Service
- **Rate Limiting**: Built-in protection against abuse
- **Error Handling**: Comprehensive error responses for debugging
- **Security**: Multiple layers of protection against common attacks
- **Monitoring**: Built-in logging for request tracking

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 📞 Support

For issues and support:
- Create GitHub issues for bugs
- Check logs for debugging information
- Monitor rate limits and adjust as needed

---

**Built with ❤️ using Node.js and Express**